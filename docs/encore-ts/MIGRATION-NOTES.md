# Express → Encore.ts migration — what changed

> **Provenance caveat (constitution Principle V; spec 058 FR-009).** The
> reference implementation this note distills lives in the source substrate
> (`<source-project>/public/server`), and some paths here (e.g.
> `apps/api-express/`) describe that substrate's migration, not this
> repository's. This template migrated its `apps/api` to Encore in place (specs
> 048 to 054); there is no `apps/api-express` in this tree. Read it as a
> decision record / provenance, not a description of the current layout; the
> authoritative architecture is `CODEMAP.md` and specs 048 / 058.

This template's API was converted from Express 5 to **Encore.ts**. The Vue
frontends (`apps/web`, `apps/web-internal`) and the GoA Design System are
unchanged except for the auth store. This note records the decisions and the
new shape; the reference implementation that informed it lives in
`<source-project>/public/server`.

## Layout

| Before | After |
|--------|-------|
| `apps/api/` (Express) | `apps/api-express/` (parked, kept working until cutover) |
| — | `apps/api/` (Encore.ts app — `encore.app` at its root) |

`apps/api` is a **standalone** Encore app (its own `node_modules`, excluded from
the npm workspaces) so its deps don't tangle with the Vue/Express trees. Root
scripts: `npm run dev:api` (Encore), `npm run express:dev` (legacy).

## Locked decisions

- **Auth: session-cookie → stateless JWT.** `express-session` + Redis/Postgres
  session store is gone. Access token (RS256, 15 min) + refresh token (7 day,
  DB-backed rotation/revocation) ride in httpOnly cookies, validated by an
  Encore `authHandler` + `Gateway`. The Vue cookie + CSRF contract is preserved.
- **Persistence: a minimal `SQLDatabase("app")`** was added (`user_account`,
  `refresh_token`, `audit_log`) — the Express template was deliberately DB-less.
  Multi-role is preserved (`user_roles TEXT[]`, any-of `requireRole`).
- **Auth drivers: full parity** — `mock` (dev), `entra-id` (OIDC, single-tenant
  + `tid` check), `saml` (SAML 2.0 via `@node-saml`, as `api.raw` handlers).
- **Middleware → Encore primitives:** helmet → `lib/security-headers` middleware;
  `express-rate-limit` → `rate-limiter-flexible` middleware (`lib/rate-limit`);
  CSRF double-submit → `lib/csrf` middleware; CORS → `encore.app` `global_cors`;
  pino → `encore.dev/log`; body parsing/validation → Encore typed endpoints.
- **Error envelope dropped.** Responses are Encore-native: success returns the
  typed payload directly; errors are `APIError` `{ code, message, details? }`
  (the old `{ success, error }` envelope is gone). CSRF sub-codes land at
  `details.code` (`CSRF_MISSING` / `CSRF_MISMATCH`).
- **Paths keep the `/api/v1` prefix** (unlike the reference, which dropped it) so
  external SAML ACS URLs and the `/api/v1/data/*` gateway contract are stable and
  the frontend needs minimal change.
- **BFF proxy preserved** as an `api.raw` catch-all (`gateway/`): path-traversal
  sanitisation, S2S OAuth token cache + Bearer injection, 5xx masking, timeout→504.
- **Static SPA** via `api.static` (`web/`); `apps/web` builds into
  `apps/api/web/build`, swept into the image by `bundle_source: true`.

## Endpoint map (high level)

| Path | Notes |
|------|-------|
| `GET /api/v1/auth/me` | typed; requires auth |
| `GET /api/v1/auth/csrf-token` | raw; sets cookie, returns `{ token }` |
| `POST /api/v1/auth/refresh` | raw; rotates token pair |
| `POST /api/v1/auth/logout` | raw; auth; revoke + clear cookies (+ optional IdP SLO) |
| `GET /api/v1/auth/drivers` `\|` `/status` `\|` `/login` | discovery + default-driver redirect |
| `GET /api/v1/auth/{mock,entra-id,saml}/login` (+ `/callback`) | per-driver SSO |
| `GET /api/v1/auth/saml/metadata` | SP metadata XML |
| `* /api/v1/data/*` | BFF proxy to the private backend |
| `GET /health` `\|` `/health/liveness` `\|` `/health/readiness` | probes |
| `GET /api/v1/info`, `POST /api/v1/csp-report` | meta |
| `/!path` | SPA static + history fallback |

## What's deferred

- **Module generator** (`modules/`, `orchestration/`, `scripts/add-module.ts`,
  the priority registries) is untouched this pass. Encore discovers services at
  compile time (no runtime registry), so the generator will be re-architected to
  emit Encore services as a follow-up project.
- **Dual-app static serving** for `apps/web-internal` (the single `web/` service
  serves one build) — folded into the generator work.
- **Document-level CSP for the SPA shell** is an ingress/CDN concern (api.static
  doesn't run service middleware) — `lib/security-headers` documents the policy.

## Running

See `apps/api/README.md`. TL;DR: `cd apps/api && npm install && npm run generate-keys && npm run dev`.
Verified with `encore check` (parse + topology + typecheck + boot + migrations) at every milestone.
