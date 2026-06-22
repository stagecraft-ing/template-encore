/**
 * Microsoft Entra ID (OIDC) driver, single-tenant with a tenant (tid) guard,
 * built on openid-client v6 (authorization code + PKCE). Stateless: the state,
 * PKCE verifier, and nonce ride a short-lived httpOnly cookie across the redirect.
 * Config-gated (INV-9): unavailable unless tenant, client id, and secret are set.
 */
import { api } from "encore.dev/api";
import * as client from "openid-client";
import { env } from "../lib/env";
import { entraClientSecret } from "../lib/secrets";
import { authCookieOptions } from "../lib/cookie-config";
import { parseCookies, serializeCookie } from "../lib/cookies";
import { finalizeLogin, frontendUrl } from "./service";
import { clientIp, redirect, requestUrl, userAgent } from "./http";
import type { SSOProfile } from "./types";

const OIDC_TX_COOKIE = "oidc_tx";
const SCOPE = "openid profile email";

export function isEntraConfigured(): boolean {
  return Boolean(env.entraTenantId && env.entraClientId && entraClientSecret());
}

function issuerUrl(): URL {
  return new URL(`https://login.microsoftonline.com/${env.entraTenantId}/v2.0`);
}

function getConfig(): Promise<client.Configuration> {
  return client.discovery(issuerUrl(), env.entraClientId!, entraClientSecret());
}

function profileFromClaims(claims: Record<string, unknown>): SSOProfile {
  const rolesClaim = claims["roles"] ?? claims["groups"];
  const roles = Array.isArray(rolesClaim) ? (rolesClaim as unknown[]).map(String) : [env.entraDefaultRole];
  const email = (claims["preferred_username"] as string) ?? (claims["email"] as string) ?? "";
  const name = (claims["name"] as string) ?? email;
  return {
    ssoProvider: "entra-id",
    ssoProviderId: (claims["sub"] as string) ?? "",
    email,
    name,
    roles: roles.length ? roles : [env.entraDefaultRole],
    attributes: { tid: claims["tid"] },
  };
}

export const entraLogin = api.raw(
  { expose: true, method: "GET", path: "/api/v1/auth/entra-id/login" },
  async (_req, res) => {
    if (!isEntraConfigured()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const config = await getConfig();
    const verifier = client.randomPKCECodeVerifier();
    const challenge = await client.calculatePKCECodeChallenge(verifier);
    const state = client.randomState();
    const nonce = client.randomNonce();

    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: env.entraRedirectUri,
      scope: SCOPE,
      response_type: "code",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    const tx = Buffer.from(JSON.stringify({ state, verifier, nonce })).toString("base64url");
    res.setHeader("Set-Cookie", serializeCookie(OIDC_TX_COOKIE, tx, authCookieOptions(600)));
    redirect(res, url.href);
  },
);

export const entraCallback = api.raw(
  { expose: true, method: "GET", path: "/api/v1/auth/entra-id/callback" },
  async (req, res) => {
    if (!isEntraConfigured()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const cookies = parseCookies(req.headers.cookie);
    const txRaw = cookies[OIDC_TX_COOKIE];
    if (!txRaw) {
      res.statusCode = 400;
      res.end("missing login transaction");
      return;
    }
    const { state, verifier, nonce } = JSON.parse(
      Buffer.from(txRaw, "base64url").toString("utf8"),
    ) as { state: string; verifier: string; nonce: string };

    const config = await getConfig();
    const currentUrl = new URL(env.entraRedirectUri);
    currentUrl.search = requestUrl(req).search;

    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      expectedState: state,
      pkceCodeVerifier: verifier,
      expectedNonce: nonce,
    });
    const claims = tokens.claims();
    if (!claims) {
      res.statusCode = 401;
      res.end("no id token");
      return;
    }
    if (typeof claims.tid === "string" && claims.tid !== env.entraTenantId) {
      res.statusCode = 401;
      res.end("tenant mismatch");
      return;
    }

    // Clear the transaction cookie, then finalize (which appends the auth cookies).
    res.setHeader("Set-Cookie", serializeCookie(OIDC_TX_COOKIE, "", authCookieOptions(0)));
    const profile = profileFromClaims(claims as unknown as Record<string, unknown>);
    await finalizeLogin(res, profile, { ipAddress: clientIp(req), userAgent: userAgent(req) });
    redirect(res, frontendUrl("/"));
  },
);
