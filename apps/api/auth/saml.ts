/**
 * SAML 2.0 driver built on @node-saml/node-saml. login redirects to the IdP,
 * callback validates the POSTed assertion, and metadata serves SP metadata XML.
 * Config-gated (INV-9): unavailable unless entry point, issuer, and IdP cert are set.
 */
import { api } from "encore.dev/api";
import { SAML, type SamlConfig, type Profile } from "@node-saml/node-saml";
import { env } from "../lib/env";
import { samlIdpCert } from "../lib/secrets";
import { finalizeLogin, frontendUrl } from "./service";
import { clientIp, parseFormBody, readRequestBody, redirect, userAgent } from "./http";
import type { SSOProfile } from "./types";

export function isSamlConfigured(): boolean {
  return Boolean(env.samlEntryPoint && env.samlIssuer && samlIdpCert());
}

function samlInstance(): SAML {
  const config: SamlConfig = {
    entryPoint: env.samlEntryPoint,
    issuer: env.samlIssuer!,
    callbackUrl: env.samlCallbackUrl,
    idpCert: samlIdpCert(),
    audience: env.samlIssuer ?? false,
    wantAssertionsSigned: true,
  };
  return new SAML(config);
}

function profileToSSO(profile: Profile): SSOProfile {
  const record = profile as unknown as Record<string, unknown>;
  const rolesAttr = record[env.samlAttrRoles];
  const roles = Array.isArray(rolesAttr)
    ? rolesAttr.filter((role): role is string => typeof role === "string")
    : typeof rolesAttr === "string"
      ? [rolesAttr]
      : ["user"];
  const email = (record["email"] as string) ?? profile.nameID ?? "";
  const name = (record["displayName"] as string) ?? (record["cn"] as string) ?? email;
  return {
    ssoProvider: "saml",
    ssoProviderId: profile.nameID ?? email,
    email,
    name,
    roles,
    attributes: { nameIDFormat: profile.nameIDFormat },
  };
}

export const samlLogin = api.raw(
  { expose: true, method: "GET", path: "/api/v1/auth/saml/login" },
  async (_req, res) => {
    if (!isSamlConfigured()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const url = await samlInstance().getAuthorizeUrlAsync("", undefined, {});
    redirect(res, url);
  },
);

export const samlCallback = api.raw(
  { expose: true, method: "POST", path: "/api/v1/auth/saml/callback" },
  async (req, res) => {
    if (!isSamlConfigured()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const form = parseFormBody(await readRequestBody(req));
    const { profile } = await samlInstance().validatePostResponseAsync(form);
    if (!profile) {
      res.statusCode = 401;
      res.end("invalid SAML assertion");
      return;
    }
    await finalizeLogin(res, profileToSSO(profile), {
      ipAddress: clientIp(req),
      userAgent: userAgent(req),
    });
    redirect(res, frontendUrl("/"));
  },
);

export const samlMetadata = api.raw(
  { expose: true, method: "GET", path: "/api/v1/auth/saml/metadata" },
  async (_req, res) => {
    if (!isSamlConfigured()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const xml = samlInstance().generateServiceProviderMetadata(null, null);
    res.setHeader("Content-Type", "application/xml");
    res.end(xml);
  },
);
