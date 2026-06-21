# `@template/api` — Encore.ts API

The backend for the Vue + Encore Enterprise Template, built on
[Encore.ts](https://encore.dev). Replaces the former Express BFF, which was
removed at the PR 5c cutover (see git history and spec 048 for the migration
record).

## Prerequisites

- **Encore CLI** — `brew install encoredev/tap/encore` (macOS) /
  `curl -L https://encore.dev/install.sh | bash` (Linux)
- **Docker** — Encore provisions a local Postgres for `encore run`
- **Node 22+**

## Quick start

```bash
cd apps/api
npm install
npm run generate-keys     # writes RS256 PEM keys into ./keys (dev JWT signing)
npm run dev               # encore run --port=4000   (local dev dashboard: http://localhost:9400)
```

With `AUTH_DRIVER=mock` (the default) you can sign in without any IdP:

```
http://localhost:4000/api/v1/auth/mock/login?user=1   # admin
```

The Vue dev servers proxy `/api` → `:4000`:

```bash
# from the monorepo root
npm run dev:web            # public portal  → http://localhost:5173
npm run dev:web-internal   # staff portal   → http://localhost:5174
```

## Structure

```
apps/api/
├── encore.app            # app manifest + global_cors
├── infra.config.json     # secret $env bindings + sql_servers (build/self-host)
├── lib/                  # cross-cutting: env, secrets, jwt, cookies, csrf,
│                         #   rate-limit, security-headers, errors, audit, roles, logger
├── db/                   # SQLDatabase("app") + migrations/ (user_account, refresh_token, audit_log)
├── auth/                 # authHandler + Gateway, JWT issue/rotate, CSRF token,
│                         #   me / logout / refresh / drivers, providers: mock, entra-id, saml
├── gateway/              # BFF proxy /api/v1/data/* → private backend (S2S OAuth)
├── health/              # /health, /health/liveness, /health/readiness, /api/v1/info, /api/v1/csp-report
├── web/                  # api.static SPA serving (./web/build) + fallback
└── scripts/              # generate-keys.ts, migrate.mjs, docker-build.sh
```

## Auth model

Stateless JWT in httpOnly cookies (no server sessions):

- **access_token** — RS256 JWT, 15 min, carries `{ sub, email, name, roles[] }`.
- **refresh_token** — RS256 JWT, 7 days, hash stored in `refresh_token` (rotated
  + revocable). `POST /api/v1/auth/refresh` rotates the pair.
- **csrf_token** — double-submit cookie; fetch via `GET /api/v1/auth/csrf-token`,
  echo in `X-CSRF-Token` on state-changing requests.

Drivers (multi-role preserved): `mock` (dev), `entra-id` (OIDC, single-tenant +
`tid` check), `saml` (SAML 2.0 via `@node-saml`). Each exposes
`/api/v1/auth/<driver>/login` (+ `/callback` for entra-id/saml).

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | `encore run --port=4000` |
| `npm run typecheck` | `encore check` (parse + topology + typecheck + boot) |
| `npm run generate-keys` | RS256 PEM keypairs for local JWT signing |
| `npm run gen:client` | Generate typed client into `apps/web/src/lib/encore-client.ts` |
| `npm run build:docker` | `encore build docker --base` (supported image build) |
| `npm run db:migrate` | External migration runner (CI/Helm; `encore run` auto-migrates) |

## Production

Secrets (`JWT_*`, `CSRF_SECRET`, `ENTRA_CLIENT_*`, `SAML_*`, `GATEWAY_OAUTH_*`)
are bound via `infra.config.json` (`$env`) for `encore build docker --config`,
or set with `encore secret set --type prod <NAME>`. See `.env.example` for the
full variable list and `docs/encore-ts/` for the Docker build recipes.
