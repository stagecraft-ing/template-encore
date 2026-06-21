import { api } from "encore.dev/api";
import {
  SAML,
  ValidateInResponseTo,
  type Profile,
  type SamlConfig,
} from "@node-saml/passport-saml";
import type { IncomingMessage } from "node:http";
import { env } from "../lib/env";
import { samlPrivateKey, samlCertSp, samlIdpCert } from "../lib/secrets";
import {
  COOKIE_NAMES,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
} from "../lib/cookie-config";
import { serializeCookie } from "../lib/cookies";
import { consumeAuthLimit } from "../lib/rate-limit";
import { createTokens, findOrCreateUser, frontendBase, getCallbackUrl } from "./service";
import { logAuditEvent } from "../lib/audit";
import logger from "../lib/logger";
import type { SSOProfile } from "./types";

/**
 * SAML 2.0 driver: external users (for example consumers and businesses) via a SAML IdP.
 *
 * Ports the Express SamlAuthDriver to api.raw handlers using @node-saml's
 * `SAML` class directly (no Passport, no Express Strategy). The redirect-based
 * SSO flow and the POST assertion callback both run as raw Node handlers:
 *
 *   GET  /api/v1/auth/saml/login     — sign + redirect AuthnRequest to the IdP
 *   POST /api/v1/auth/saml/callback  — validate signed assertion, issue cookies
 *   GET  /api/v1/auth/saml/metadata  — SP metadata XML for IdP configuration
 *
 * Keys/certs are Encore secrets (base64 or PEM accepted); identifiers/URLs are
 * env. validateInResponseTo is disabled so the flow is stateless (no shared
 * request-ID cache needed across instances) — the signed assertion is the
 * security boundary.
 */

const ATTR = {
  id: process.env.SAML_ATTR_ID || "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
  email: process.env.SAML_ATTR_EMAIL || "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  name: process.env.SAML_ATTR_NAME || "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
  firstName: process.env.SAML_ATTR_FIRSTNAME || "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
  lastName: process.env.SAML_ATTR_LASTNAME || "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
  roles: process.env.SAML_ATTR_ROLES || "http://schemas.microsoft.com/ws/2008/06/identity/claims/role",
} as const;

/** Wrap a raw base64 body in PEM headers if it isn't already PEM-formatted. */
function wrapPem(raw: string, label: "CERTIFICATE" | "PRIVATE KEY"): string {
  const v = raw.trim();
  if (v.includes("-----BEGIN")) return v;
  const lines = v.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

export function isSamlConfigured(): boolean {
  try {
    return !!(samlIdpCert() && env.SAML_ENTRY_POINT && env.SAML_ISSUER);
  } catch {
    return false;
  }
}

function spPrivateKey(): string | undefined {
  try {
    const k = samlPrivateKey();
    return k ? wrapPem(k, "PRIVATE KEY") : undefined;
  } catch {
    return undefined;
  }
}

function spCert(): string | undefined {
  try {
    const c = samlCertSp();
    return c ? wrapPem(c, "CERTIFICATE") : undefined;
  } catch {
    return undefined;
  }
}

let samlInstance: SAML | undefined;

function getSaml(): SAML {
  if (samlInstance) return samlInstance;
  const privateKey = spPrivateKey();
  const config: SamlConfig = {
    idpCert: wrapPem(samlIdpCert(), "CERTIFICATE"),
    issuer: env.SAML_ISSUER!,
    callbackUrl: env.SAML_CALLBACK_URL || getCallbackUrl("saml"),
    entryPoint: env.SAML_ENTRY_POINT,
    identifierFormat: env.SAML_IDENTIFIER_FORMAT,
    wantAssertionsSigned: true,
    signatureAlgorithm: "sha256",
    digestAlgorithm: "sha256",
    // Stateless: the signed assertion is the security boundary; we don't keep a
    // per-request ID cache (which wouldn't be shared across instances anyway).
    validateInResponseTo: ValidateInResponseTo.never,
    ...(privateKey ? { privateKey, decryptionPvk: privateKey } : {}),
  };
  samlInstance = new SAML(config);
  return samlInstance;
}

function clientIp(req: IncomingMessage): string {
  const xff = req.headers["x-forwarded-for"] as string | undefined;
  return xff?.split(",")[0]?.trim() || "unknown";
}

/** Collect the (form-urlencoded) request body for the POST assertion binding. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const toStr = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
};

/** Read a mapped attribute from the profile (direct key or nested attributes). */
function getAttr(profile: Record<string, unknown>, attrName: string): string {
  const direct = profile[attrName];
  if (direct != null) return Array.isArray(direct) ? toStr(direct[0]) : toStr(direct);
  const nested = profile.attributes as Record<string, unknown> | undefined;
  const val = nested?.[attrName];
  if (val != null) return Array.isArray(val) ? toStr(val[0]) : toStr(val);
  return "";
}

/** Map a validated SAML Profile to our SSOProfile. */
function profileToSSO(p: Profile): SSOProfile {
  const profile = p as unknown as Record<string, unknown>;

  const id = getAttr(profile, ATTR.id) || toStr(profile.nameID ?? profile.ID);
  const email = getAttr(profile, ATTR.email) || toStr(profile.email ?? profile.mail);
  const firstName = getAttr(profile, ATTR.firstName);
  const lastName = getAttr(profile, ATTR.lastName);
  const name = getAttr(profile, ATTR.name) || `${firstName} ${lastName}`.trim() || email;

  // Roles — the role attribute can be a single value or an array.
  let roles: string[] = [];
  const direct = profile[ATTR.roles];
  const nested = (profile.attributes as Record<string, unknown> | undefined)?.[ATTR.roles];
  const roleVal = direct ?? nested;
  if (roleVal != null) {
    roles = Array.isArray(roleVal) ? roleVal.map(toStr) : [toStr(roleVal)];
  }

  return {
    provider: "saml",
    providerId: id,
    email,
    displayName: name,
    roles: roles.filter(Boolean),
    attributes: {
      firstName: firstName || null,
      lastName: lastName || null,
      samlNameId: typeof profile.nameID === "string" ? profile.nameID : null,
      samlSessionIndex:
        typeof profile.sessionIndex === "string" ? profile.sessionIndex : null,
    },
  };
}

export const samlLogin = api.raw(
  { expose: true, method: "GET", path: "/api/v1/auth/saml/login" },
  async (req, resp) => {
    if (!isSamlConfigured()) {
      resp.writeHead(503, { "Content-Type": "application/json" });
      resp.end(JSON.stringify({ code: "unavailable", message: "SAML SSO not configured" }));
      return;
    }
    try {
      await consumeAuthLimit(clientIp(req));
    } catch {
      resp.writeHead(302, { Location: `${frontendBase()}/login?error=rate_limited` });
      resp.end();
      return;
    }

    try {
      const url = await getSaml().getAuthorizeUrlAsync("", req.headers.host, {});
      resp.writeHead(302, { Location: url });
      resp.end();
    } catch (err) {
      logger.error(err as Error, "SAML login failed to build AuthnRequest");
      resp.writeHead(302, { Location: `${frontendBase()}/login?error=server_error` });
      resp.end();
    }
  }
);

export const samlCallback = api.raw(
  { expose: true, method: "POST", path: "/api/v1/auth/saml/callback" },
  async (req, resp) => {
    if (!isSamlConfigured()) {
      resp.writeHead(503, { "Content-Type": "application/json" });
      resp.end(JSON.stringify({ code: "unavailable", message: "SAML SSO not configured" }));
      return;
    }

    const ip = clientIp(req);
    try {
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const SAMLResponse = params.get("SAMLResponse");
      const RelayState = params.get("RelayState") ?? "";
      if (!SAMLResponse) {
        resp.writeHead(302, { Location: `${frontendBase()}/login?error=saml_failed` });
        resp.end();
        return;
      }

      const { profile, loggedOut } = await getSaml().validatePostResponseAsync({
        SAMLResponse,
        RelayState,
      });
      if (loggedOut || !profile) {
        resp.writeHead(302, { Location: `${frontendBase()}/login?error=saml_failed` });
        resp.end();
        return;
      }

      const sso = profileToSSO(profile);
      if (!sso.email && !sso.providerId) {
        logger.warn("SAML assertion missing both email and nameID");
        resp.writeHead(302, { Location: `${frontendBase()}/login?error=saml_failed` });
        resp.end();
        return;
      }

      const user = await findOrCreateUser(sso);
      const tokens = await createTokens(user);

      resp.setHeader("Set-Cookie", [
        serializeCookie(COOKIE_NAMES.ACCESS_TOKEN, tokens.accessToken, accessTokenCookieOptions),
        serializeCookie(COOKIE_NAMES.REFRESH_TOKEN, tokens.refreshToken, refreshTokenCookieOptions),
      ]);
      resp.writeHead(302, { Location: `${frontendBase()}/?signed_in=true` });
      resp.end();

      void logAuditEvent({
        action: "LOGIN",
        tableName: "user_account",
        recordId: user.pk_user_account,
        userId: user.pk_user_account,
        ipAddress: ip,
        userAgent: (req.headers["user-agent"]) ?? null,
        newData: { provider: "saml", email: user.user_email_address },
      });
    } catch (err) {
      logger.error(err as Error, "SAML callback validation failed");
      void logAuditEvent({
        action: "LOGIN_FAILED",
        tableName: "user_account",
        ipAddress: ip,
        userAgent: (req.headers["user-agent"]) ?? null,
        newData: { provider: "saml", error: (err as Error).message },
      });
      resp.writeHead(302, { Location: `${frontendBase()}/login?error=saml_failed` });
      resp.end();
    }
  }
);

export const samlMetadata = api.raw(
  { expose: true, method: "GET", path: "/api/v1/auth/saml/metadata" },
  async (_req, resp) => {
    if (!isSamlConfigured()) {
      resp.writeHead(404, { "Content-Type": "application/json" });
      resp.end(JSON.stringify({ code: "not_found", message: "SAML not configured" }));
      return;
    }
    const cert = spCert() ?? null;
    const xml = getSaml().generateServiceProviderMetadata(cert, cert);
    resp.setHeader("Content-Type", "application/xml");
    resp.writeHead(200);
    resp.end(xml);
  }
);
