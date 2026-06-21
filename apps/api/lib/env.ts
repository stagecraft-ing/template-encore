import { z } from "zod";

/**
 * Non-secret environment variables.
 *
 * Secrets (JWT keys, CSRF secret, Entra/SAML credentials, gateway OAuth
 * client secret) are read via `secret()` from "encore.dev/config" — see
 * lib/secrets.ts. Everything here is non-sensitive configuration: URLs,
 * identifiers, timeouts, limits, feature flags. Validated once at module
 * load; throws on failure.
 */

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    // ── URLs ────────────────────────────────────────────────────────────
    // Public base URL of this API (used to build OAuth/SAML callback URLs).
    API_BASE_URL: z.string().url().default("http://localhost:4000"),
    // Allowed SPA origin(s) for post-login redirects (comma-separated). The
    // first entry is used as the redirect base. Replaces the Express WEB_URL.
    FRONTEND_URL: z.string().default("http://localhost:5173"),

    // ── Auth driver selection ───────────────────────────────────────────
    // Default driver for the backward-compatible /auth/login + /auth/callback
    // routes (no :driver segment). One of: mock | entra-id | saml.
    AUTH_DRIVER: z.string().default("mock"),
    // Explicit override for the OAuth/SAML callback URL. When unset, callbacks
    // are derived from API_BASE_URL as `${API_BASE_URL}/auth/<driver>/callback`.
    AUTH_CALLBACK_URL: z.string().url().optional(),

    // ── Microsoft Entra ID (OIDC) ───────────────────────────────────────
    // Tenant is identifier-level (not a secret) so it can be validated here.
    ENTRA_TENANT_ID: z.string().optional(),
    ENTRA_AUTHORITY: z.string().url().optional(),
    ENTRA_SCOPE: z.string().default("openid profile email"),
    ENTRA_POST_LOGOUT_REDIRECT_URI: z.string().url().optional(),
    // Lowest-privilege role assigned when an Entra token carries no role claim.
    ENTRA_DEFAULT_ROLE: z.string().default("user"),

    // ── SAML 2.0 ────────────────────────────────────────────────────────
    // Keys/certs are secrets (lib/secrets.ts); these identifiers/URLs are not.
    SAML_ENTRY_POINT: z.string().url().optional(),
    SAML_ISSUER: z.string().optional(),
    SAML_CALLBACK_URL: z.string().url().optional(),
    SAML_LOGOUT_URL: z.string().url().optional(),
    SAML_LOGOUT_CALLBACK_URL: z.string().url().optional(),
    SAML_IDENTIFIER_FORMAT: z
      .string()
      .default("urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"),

    // ── BFF API gateway (private backend proxy) ─────────────────────────
    PRIVATE_API_BASE_URL: z.string().url().optional(),
    GATEWAY_OAUTH_TOKEN_URL: z.string().url().optional(),
    GATEWAY_OAUTH_TENANT_ID: z.string().optional(),
    GATEWAY_OAUTH_SCOPE: z.string().optional(),

    // ── Static client serving (api.static — see web/ service) ───────────
    // Defaults to false in dev (run Vite on :5173 with the proxy); production
    // serves the built SPA. WEB_APP selects which build to serve in dual-app
    // deployments ('web' | 'web-internal').
    SERVE_CLIENT: z.coerce.boolean().default(false),
    WEB_APP: z.string().default("web"),

    // ── Rate limiting ───────────────────────────────────────────────────
    RATE_LIMIT_API_MAX: z.coerce.number().default(100),
    RATE_LIMIT_API_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().default(20),
    RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
    // When set, rate-limit state is backed by Redis (horizontal scale).
    REDIS_URL: z.string().optional(),
  })
  .refine(
    (data) => {
      // IDPV-001: Entra tenant MUST NOT be a multi-tenant placeholder in
      // production — 'common'/'organizations'/'consumers' accept ANY Microsoft
      // account globally. Empty is OK (Entra SSO simply disabled).
      if (data.NODE_ENV !== "production") return true;
      if (!data.ENTRA_TENANT_ID) return true;
      const forbidden = new Set(["common", "organizations", "consumers"]);
      return !forbidden.has(data.ENTRA_TENANT_ID.trim().toLowerCase());
    },
    {
      message:
        "ENTRA_TENANT_ID must be a specific tenant GUID or verified domain in " +
        "production. Multi-tenant values ('common', 'organizations', " +
        "'consumers') accept any Microsoft account in the world and violate " +
        "IDPV-001. Set a single-tenant GUID or leave ENTRA_TENANT_ID unset to " +
        "disable Entra ID SSO.",
      path: ["ENTRA_TENANT_ID"],
    }
  );

export type EnvConfig = z.infer<typeof envSchema>;

function loadEnvironment(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.flatten();
    const fieldMessages = Object.entries(errors.fieldErrors)
      .map(([field, msgs]) => `  ${field}: ${(msgs || []).join(", ")}`)
      .join("\n");
    const formMessages =
      errors.formErrors.length > 0 ? "\n  " + errors.formErrors.join("\n  ") : "";
    throw new Error(
      `Environment validation failed:\n${fieldMessages}${formMessages}`
    );
  }
  return parsed.data;
}

export const env = loadEnvironment();
