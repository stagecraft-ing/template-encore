# Authentication Setup Guide

This document describes configuring authentication for the Enterprise Application Template
(Encore.ts backend). The template ships three auth drivers:

1. **Mock**: local development (no real Identity Provider)
2. **Microsoft Entra ID**: OIDC, for internal/staff applications
3. **SAML 2.0**: for external user/business-facing applications

## Authentication model

Authentication is **stateless RS256 JWT**, not a server-side session:

- On login, the `auth` service issues an **access token** (RS256, ~15 min) and a **refresh token** (~7 day,
  DB-backed, rotated on use, revocable), both in **httpOnly cookies**. No token is readable from JavaScript.
- An Encore `authHandler` plus `Gateway` validate the access-token cookie (or `Authorization: Bearer`) on
  every endpoint declared `auth: true`, populating `AuthData { userID, email, name, roles, ssoProvider }`.
- State-changing requests carry a **CSRF token** (double-submit): the SPA fetches it from
  `GET /api/v1/auth/csrf-token` and replays it as the `X-CSRF-Token` header.
- `POST /api/v1/auth/refresh` rotates the refresh token and mints a new access cookie; `POST /api/v1/auth/logout`
  revokes the refresh token and clears cookies.

There is no `express-session`, no `SESSION_SECRET`, and no Redis session store. Postgres
(`SQLDatabase("app")`) stores the user record, the refresh-token hashes, and the audit log.

## Configuration model

The backend reads **non-secret** config from `apps/api/.env` (loaded by `encore run`); see
[apps/api/.env.example](../apps/api/.env.example). **Secrets** (JWT keys, `CSRF_SECRET`, IdP client secrets,
SAML keys/certs) are declared via `secret(...)` in `apps/api/lib/secrets.ts` and resolved from Encore's secret
store:

```bash
# Local development
encore secret set --type local <NAME>
# Production
encore secret set --type prod <NAME>
# or bind via infra.config.json ($env) / your secrets manager
```

JWT signing keys have a dev fallback: `npm run generate-keys` (inside `apps/api`) writes
`apps/api/keys/*.pem`, auto-loaded in dev. Unset Entra/SAML/gateway secrets simply disable those features
(no startup crash).

Driver selection: `AUTH_DRIVER` (`mock` | `entra-id` | `saml`) is the default for `/api/v1/auth/login`.
All installed drivers are also reachable at their own routes.

| Route | Purpose |
|-------|---------|
| `GET /api/v1/auth/drivers` | list available drivers |
| `GET /api/v1/auth/login` | login via the default (`AUTH_DRIVER`) driver |
| `GET /api/v1/auth/mock/login?user=0\|1\|2` | mock instant login |
| `GET /api/v1/auth/entra-id/login` → `GET /api/v1/auth/entra-id/callback` | Entra ID (OIDC) |
| `GET /api/v1/auth/saml/login` → `POST /api/v1/auth/saml/callback` | SAML 2.0 |
| `GET /api/v1/auth/saml/metadata` | SAML SP metadata |

---

## Quick Start (Development): Mock

No external IdP required.

```bash
cd apps/api
npm install
npm run generate-keys           # JWT keys for dev
cp .env.example .env            # defaults use AUTH_DRIVER=mock
cd ../.. && npm run dev
```

Relevant `.env` defaults:

```bash
AUTH_DRIVER=mock
API_BASE_URL=http://localhost:4000
FRONTEND_URL=http://localhost:5173
```

Then visit http://localhost:5173, click **Sign In**, and choose a mock user:

- `?user=0`: Developer (`developer`, `user` roles)
- `?user=1`: Administrator (`admin`, `user` roles)
- `?user=2`: Standard User (`user` role)

Mock users are defined in `apps/api/auth/mock.ts`.

---

## Microsoft Entra ID (OIDC)

For internal/staff applications using Microsoft Entra ID.

### 1. Register the application

In the Azure Portal, register an app and add a **Redirect URI** (Web):
`https://your-app.example.com/api/v1/auth/entra-id/callback` (and the local
`http://localhost:4000/api/v1/auth/entra-id/callback` for dev). Create a client secret.

### 2. Configure

Non-secret config in `apps/api/.env`:

```bash
AUTH_DRIVER=entra-id
ENTRA_TENANT_ID=<your-single-tenant-guid>     # IDPV-001: a single tenant, never common/organizations/consumers
ENTRA_SCOPE=openid profile email
ENTRA_DEFAULT_ROLE=user                        # fallback when no role claim is present
# ENTRA_AUTHORITY=                             # optional; default https://login.microsoftonline.com/<tenant>/v2.0
# ENTRA_POST_LOGOUT_REDIRECT_URI=
```

Secrets (Encore secret store):

```bash
encore secret set --type local ENTRA_CLIENT_ID
encore secret set --type local ENTRA_CLIENT_SECRET
```

Roles resolve from token claims in priority order `roles` → `role` → `groups`, falling back to
`ENTRA_DEFAULT_ROLE`. The tenant (`tid`) is verified against `ENTRA_TENANT_ID`.

---

## SAML 2.0 (External)

For external-facing applications where external users or businesses authenticate via a federated IdP.

> **Migrating from the Express (session) template? Two breaking changes for existing SAML deployments:**
> 1. **The ACS (callback) URL moved** from `/api/v1/auth/callback` to **`/api/v1/auth/saml/callback`** (driver-scoped paths; the generic default callback no longer exists). You MUST update the Assertion Consumer Service URL registered with your IdP, or SSO breaks after migration. Update the SP metadata URL to `/api/v1/auth/saml/metadata` as well.
> 2. **The `SESSION_COOKIE_SAME_SITE=none` / `SESSION_COOKIE_SECURE` env vars are gone, and `SameSite=None` is no longer required.** The stateless model needs no cross-site session cookie: SAML round-trip state travels in the SAML `RelayState` parameter (not a browser cookie), and the post-login JWT cookies are set on the top-level redirect back to the SPA. `lib/cookie-config.ts` fixes `sameSite: "lax"` for every auth cookie (lax is sent on the top-level navigation back from the IdP but not on cross-site POST/fetch: the correct tradeoff). `secure` is automatic in production (`NODE_ENV=production`).

### 1. Generate Service Provider keys

```bash
openssl req -x509 -newkey rsa:2048 -keyout sp-private-key.pem -out sp-certificate.pem \
  -days 730 -nodes -subj "/CN=your-app-name"

openssl rsa -in sp-private-key.pem -outform DER | openssl base64 -A    # → SAML_PRIVATE_KEY
openssl x509 -in sp-certificate.pem -outform DER | openssl base64 -A   # → SAML_CERT_SP
```

`SAML_PRIVATE_KEY` / `SAML_CERT_SP` / `SAML_CERT` accept either raw base64 or full PEM; the code wraps raw
base64 at runtime.

### 2. Service Provider details to register with the IdP

- **Entity ID (Issuer)**: `SAML_ISSUER`, e.g. `urn:example:app:your-app`
- **ACS (Assertion Consumer Service) URL**: `https://your-app.example.com/api/v1/auth/saml/callback`
- **SP metadata**: `https://your-app.example.com/api/v1/auth/saml/metadata`
- **Name ID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`

### 3. Configure

Non-secret config in `apps/api/.env`:

```bash
AUTH_DRIVER=saml
API_BASE_URL=https://your-app.example.com

SAML_ENTRY_POINT=https://your-idp.example.com/saml/sso     # IdP SSO URL
SAML_ISSUER=urn:example:app:your-app                       # SP entity ID
SAML_IDENTIFIER_FORMAT=urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress
# SAML_CALLBACK_URL=                                       # else derived: <API_BASE_URL>/api/v1/auth/saml/callback
# SAML_LOGOUT_URL=https://your-idp.example.com/saml/logout
# SAML_LOGOUT_CALLBACK_URL=https://your-app.example.com/api/v1/auth/saml/logout/callback

# Optional attribute-claim overrides (defaults are the standard schemas.xmlsoap URNs)
# SAML_ATTR_ID= / SAML_ATTR_EMAIL= / SAML_ATTR_NAME= / SAML_ATTR_FIRSTNAME= / SAML_ATTR_LASTNAME= / SAML_ATTR_ROLES=
```

Secrets (Encore secret store):

```bash
encore secret set --type prod SAML_PRIVATE_KEY     # SP signing/decryption key
encore secret set --type prod SAML_CERT_SP         # SP public cert (for metadata)
encore secret set --type prod SAML_CERT            # IdP signing cert
```

### 4. Attribute mapping

Default SAML attribute → user field mapping (override with `SAML_ATTR_*`):

| User Field | Default SAML Attribute |
|------------|------------------------|
| User ID | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier` |
| Email | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` |
| Name | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` |
| Roles | `http://schemas.microsoft.com/ws/2008/06/identity/claims/role` |

All IdP claims are passed through to the user's `attributes`. Enable `LOG_LEVEL=debug` to inspect raw SAML
profiles in the logs (never in production with real PII).

---

## Configuration Reference

### Core (all drivers)

```bash
AUTH_DRIVER=mock|entra-id|saml
API_BASE_URL=https://your-app.example.com     # builds OAuth/SAML callback URLs
FRONTEND_URL=https://your-app.example.com     # post-login redirect target (comma-separated; first wins)
```

### JWT + CSRF (secrets)

```bash
# Dev: npm run generate-keys (apps/api). Prod: set as Encore secrets (PEM strings).
JWT_PRIVATE_KEY= / JWT_PUBLIC_KEY= / JWT_REFRESH_PRIVATE_KEY= / JWT_REFRESH_PUBLIC_KEY=
CSRF_SECRET=                                  # HMAC key for CSRF token signatures
```

### Rate limiting

```bash
RATE_LIMIT_API_MAX=100
RATE_LIMIT_API_WINDOW_MS=900000
RATE_LIMIT_AUTH_MAX=20
RATE_LIMIT_AUTH_WINDOW_MS=900000
# REDIS_URL=redis://localhost:6379            # optional: Redis-backed rate limits (NOT sessions)
```

---

## Security Best Practices

1. **Secrets management**: use Encore secrets / Azure Key Vault; never commit secret values. `keys/` and
   `*.pem` are gitignored.
2. **HTTPS in production**: cookies are `secure`; many IdPs require HTTPS callback URLs.
3. **JWT keys**: RSA 2048-bit minimum; rotate periodically. Refresh tokens are stored hash-only and are
   revocable (logout-everywhere).
4. **Rate limiting**: the `auth` tier (`RATE_LIMIT_AUTH_*`) protects login/callback from brute force.
5. **PII**: `LOG_PII` must be `false` in production (the app fails fast otherwise); the logger redacts PII.
6. **SAML certificates**: monitor expiry; have a renewal process.

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for SAML/Entra/CSRF/cookie issues.

## Additional Resources

- [SAML 2.0 Overview](http://docs.oasis-open.org/security/saml/Post2.0/sstc-saml-tech-overview-2.0.html) · [SAML debugging tools](https://www.samltool.com/)
- [Microsoft Entra ID (OIDC) docs](https://learn.microsoft.com/en-us/entra/identity-platform/)
- [Encore.ts auth handlers](https://encore.dev/docs/ts/develop/auth)
- Your organization's digital service standard (consult your internal policy documentation)

---

**Last Updated**: 2026-06-05
