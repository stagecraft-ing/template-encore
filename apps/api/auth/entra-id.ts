import { api } from "encore.dev/api";
import crypto from "node:crypto";
import { env } from "../lib/env";
import { entraClientId, entraClientSecret } from "../lib/secrets";
import {
  COOKIE_NAMES,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  oauthStateCookieOptions,
  clearCookieOptions,
} from "../lib/cookie-config";
import { readCookie, serializeCookie, serializeClearCookie } from "../lib/cookies";
import { consumeAuthLimit } from "../lib/rate-limit";
import { createTokens, findOrCreateUser, frontendBase, getCallbackUrl } from "./service";
import { logAuditEvent } from "../lib/audit";
import logger from "../lib/logger";
import type { SSOProfile } from "./types";

/**
 * Microsoft Entra ID (OIDC) driver — internal/staff users. Ports the Express
 * EntraIdAuthDriver to openid-client inside api.raw handlers (no Passport).
 *
 * SINGLE-TENANT REQUIRED. ENTRA_TENANT_ID must be a tenant GUID / verified
 * domain; env.ts rejects 'common'/'organizations'/'consumers' in production,
 * and the callback verifies the `tid` claim matches (IDPV-001 defense).
 *
 *   GET /api/v1/auth/entra-id/login     — redirect to Microsoft authorize
 *   GET /api/v1/auth/entra-id/callback  — verify state + tid, exchange code, issue cookies
 */

export function isEntraConfigured(): boolean {
  try {
    return !!(entraClientId() && entraClientSecret() && env.ENTRA_TENANT_ID);
  } catch {
    return false;
  }
}

function tenantIssuer(): string {
  return (
    env.ENTRA_AUTHORITY ||
    `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/v2.0`
  );
}

function callbackUrl(): string {
  return getCallbackUrl("entra-id");
}

function clientIp(req: { headers: Record<string, unknown> }): string {
  const xff = req.headers["x-forwarded-for"] as string | undefined;
  return xff?.split(",")[0]?.trim() || "unknown";
}

/** Map OIDC claims → roles[], trying roles → role → groups, with a default. */
function rolesFromClaims(claims: Record<string, unknown>): string[] {
  const toArr = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
    if (typeof v === "string") return [v];
    return [];
  };
  let roles = toArr(claims.roles);
  if (roles.length === 0) roles = toArr(claims.role);
  if (roles.length === 0) roles = toArr(claims.groups);
  if (roles.length === 0 && env.ENTRA_DEFAULT_ROLE) roles = [env.ENTRA_DEFAULT_ROLE];
  return roles.filter(Boolean);
}

/**
 * Discover the tenant OIDC metadata and build a confidential-client
 * Configuration via the openid-client v6 functional API (client_secret_post,
 * matching Entra's token endpoint). Imported dynamically so openid-client only
 * loads when an Entra flow is actually exercised.
 */
async function entraConfig() {
  const oidc = await import("openid-client");
  const config = await oidc.discovery(
    new URL(tenantIssuer()),
    entraClientId(),
    entraClientSecret(),
    oidc.ClientSecretPost(entraClientSecret()),
  );
  return { oidc, config };
}

export const entraLogin = api.raw(
  { expose: true, method: "GET", path: "/api/v1/auth/entra-id/login" },
  async (req, resp) => {
    if (!isEntraConfigured()) {
      resp.writeHead(503, { "Content-Type": "application/json" });
      resp.end(JSON.stringify({ code: "unavailable", message: "Entra ID SSO not configured" }));
      return;
    }
    try {
      await consumeAuthLimit(clientIp(req));
    } catch {
      resp.writeHead(302, { Location: `${frontendBase()}/login?error=rate_limited` });
      resp.end();
      return;
    }

    const { oidc, config } = await entraConfig();

    const state = crypto.randomBytes(32).toString("hex");
    const authUrl = oidc.buildAuthorizationUrl(config, {
      scope: env.ENTRA_SCOPE,
      redirect_uri: callbackUrl(),
      state,
    });

    resp.setHeader(
      "Set-Cookie",
      serializeCookie(COOKIE_NAMES.OAUTH_STATE, state, oauthStateCookieOptions)
    );
    resp.writeHead(302, { Location: authUrl.href });
    resp.end();
  }
);

export const entraCallback = api.raw(
  { expose: true, method: "GET", path: "/api/v1/auth/entra-id/callback" },
  async (req, resp) => {
    const cookieHeader = req.headers["cookie"];
    const stateCookie = readCookie(cookieHeader, COOKIE_NAMES.OAUTH_STATE);
    const clearedState = serializeClearCookie(COOKIE_NAMES.OAUTH_STATE, clearCookieOptions);

    const url = new URL(req.url ?? "/", env.API_BASE_URL);
    const stateParam = url.searchParams.get("state");
    const code = url.searchParams.get("code");

    const fail = (reason: string) => {
      resp.setHeader("Set-Cookie", clearedState);
      resp.writeHead(302, { Location: `${frontendBase()}/login?error=${reason}` });
      resp.end();
    };

    if (
      !stateCookie ||
      !stateParam ||
      stateCookie.length !== stateParam.length ||
      !crypto.timingSafeEqual(Buffer.from(stateCookie), Buffer.from(stateParam))
    ) {
      logger.warn("Entra OAuth state mismatch", {
        hasStateCookie: !!stateCookie,
        hasStateParam: !!stateParam,
      });
      return fail("entra_failed");
    }
    if (!code) return fail("entra_failed");

    try {
      const { oidc, config } = await entraConfig();
      const tokenSet = await oidc.authorizationCodeGrant(config, url, {
        expectedState: stateCookie,
        idTokenExpected: true,
      });
      const claims = tokenSet.claims();
      if (!claims) return fail("entra_failed");

      // IDPV-001: reject tokens from any tenant other than the configured one.
      if (claims.tid !== env.ENTRA_TENANT_ID) {
        logger.warn("Entra tid mismatch", {
          configuredTenant: env.ENTRA_TENANT_ID,
          tokenTid: claims.tid,
        });
        return fail("tenant_mismatch");
      }

      const profile: SSOProfile = {
        provider: "entra-id",
        providerId: String(claims.sub),
        email:
          (claims.email as string) ||
          (claims.preferred_username as string) ||
          (claims.upn as string) ||
          "",
        displayName: (claims.name as string) || (claims.email as string) || "",
        roles: rolesFromClaims(claims),
        attributes: {
          firstName: (claims.given_name) ?? null,
          lastName: (claims.family_name) ?? null,
          tenantId: (claims.tid) ?? null,
          objectId: (claims.oid) ?? null,
          upn: (claims.upn) ?? null,
        },
      };

      const user = await findOrCreateUser(profile);
      const tokens = await createTokens(user);

      resp.setHeader("Set-Cookie", [
        clearedState,
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
        ipAddress: clientIp(req),
        userAgent: (req.headers["user-agent"]) ?? null,
        newData: { provider: "entra-id", email: user.user_email_address },
      });
    } catch (err) {
      logger.error(err as Error, "Entra callback error");
      void logAuditEvent({
        action: "LOGIN_FAILED",
        tableName: "user_account",
        ipAddress: clientIp(req),
        userAgent: (req.headers["user-agent"]) ?? null,
        newData: { provider: "entra-id", error: (err as Error).message },
      });
      return fail("entra_failed");
    }
  }
);
