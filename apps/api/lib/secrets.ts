import { secret } from "encore.dev/config";

/**
 * Secret bindings — resolved by Encore at runtime.
 *
 * Local dev: set via `encore secret set --type local <NAME>`, or rely on the
 * graceful fallbacks in jwt.ts (PEM files in ./keys) and the lazy
 * `isConfigured()` guards in the auth providers (an unset secret throws when
 * called, which the providers catch to report "not configured").
 *
 * Production / self-host: values come from your secrets manager, bound via
 * infra.config.json's `$env` mappings during `encore build docker --config`.
 *
 * Always invoke the secret function (e.g. `jwtPrivateKey()`); Encore
 * guarantees these values are never logged or serialized.
 */

// JWT signing keys — PEM strings, RS256.
export const jwtPrivateKey = secret("JWT_PRIVATE_KEY");
export const jwtPublicKey = secret("JWT_PUBLIC_KEY");
export const jwtRefreshPrivateKey = secret("JWT_REFRESH_PRIVATE_KEY");
export const jwtRefreshPublicKey = secret("JWT_REFRESH_PUBLIC_KEY");

// CSRF — HMAC key for token signature.
export const csrfSecret = secret("CSRF_SECRET");

// Microsoft Entra ID (OIDC) client credentials. The tenant ID is
// identifier-level config (see lib/env.ts), not a secret.
export const entraClientId = secret("ENTRA_CLIENT_ID");
export const entraClientSecret = secret("ENTRA_CLIENT_SECRET");

// SAML 2.0 — SP private key (assertion decryption + request signing + local
// TLS), SP certificate (metadata + IdP-side encryption), and the IdP's
// signing certificate (signature verification). Base64 or PEM accepted.
export const samlPrivateKey = secret("SAML_PRIVATE_KEY");
export const samlCertSp = secret("SAML_CERT_SP");
export const samlIdpCert = secret("SAML_CERT");

// BFF API gateway — OAuth client-credentials for service-to-service calls to
// the private backend (api/v1/data/* proxy).
export const gatewayOAuthClientId = secret("GATEWAY_OAUTH_CLIENT_ID");
export const gatewayOAuthClientSecret = secret("GATEWAY_OAUTH_CLIENT_SECRET");
