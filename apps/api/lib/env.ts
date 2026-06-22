/**
 * Non-secret runtime configuration, read from process.env in one place (spec 002).
 *
 * Secret material (JWT keys, client secrets, IdP certs) is NOT here: it is read
 * through Encore secret() in lib/secrets.ts so it is never logged or committed.
 */

function str(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}
function strOr(name: string, fallback: string): string {
  return str(name) ?? fallback;
}
function num(name: string, fallback: number): number {
  const v = str(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function bool(name: string, fallback: boolean): boolean {
  const v = str(name);
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

export type AuthDriver = "mock" | "entra-id" | "saml";

export const env = {
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
  port: num("PORT", 4000),

  authDriver: strOr("AUTH_DRIVER", "mock") as AuthDriver,
  frontendUrl: strOr("FRONTEND_URL", "http://localhost:5173"),
  logPii: bool("LOG_PII", false),
  redisUrl: str("REDIS_URL"),

  // Entra ID (OIDC) non-secret config.
  entraTenantId: str("ENTRA_TENANT_ID"),
  entraClientId: str("ENTRA_CLIENT_ID"),
  entraRedirectUri: strOr("ENTRA_REDIRECT_URI", "http://localhost:4000/api/v1/auth/entra-id/callback"),
  entraDefaultRole: strOr("ENTRA_DEFAULT_ROLE", "user"),

  // SAML 2.0 non-secret config (the IdP cert is a secret; see lib/secrets.ts).
  samlEntryPoint: str("SAML_ENTRY_POINT"),
  samlIssuer: str("SAML_ISSUER"),
  samlCallbackUrl: strOr("SAML_CALLBACK_URL", "http://localhost:4000/api/v1/auth/saml/callback"),
  samlLogoutUrl: str("SAML_LOGOUT_URL"),
  samlAttrRoles: strOr("SAML_ATTR_ROLES", "roles"),

  // BFF gateway non-secret config (the OAuth client secret is in lib/secrets.ts).
  privateApiBaseUrl: str("PRIVATE_API_BASE_URL"),
  gatewayOAuthTokenUrl: str("GATEWAY_OAUTH_TOKEN_URL"),
  gatewayOAuthClientId: str("GATEWAY_OAUTH_CLIENT_ID"),
  gatewayOAuthScope: str("GATEWAY_OAUTH_SCOPE"),
  gatewayTimeoutMs: num("GATEWAY_TIMEOUT_MS", 30000),
};
