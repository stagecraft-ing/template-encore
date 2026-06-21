# Express → Encore.ts migration plan

> **Provenance caveat (constitution Principle V; spec 058 FR-009).** This is a
> migration *decision record* distilled from the source substrate
> (`<source-project>/public/server`, with services such as `ai`,
> `notifications`, `resources`). Its paths (`template/public/server/`,
> `template/public/client/`) are NOT this template's tree: this template's
> backend is the standalone Encore app at `apps/api` (services `lib`, `db`,
> `health`, `auth`, `gateway`, `web`). Read it as evidence/provenance, not as a
> description of this repository; the authoritative architecture is `CODEMAP.md`
> and specs 048 / 058.

Scope: replace Express.js in `template/public/server/` with a fully-qualified
Encore.ts implementation while preserving functional parity. The client
(`template/public/client/`) keeps its Vue 3 + Vite + PrimeVue + Pinia stack;
only the API envelope and dev-proxy target change.

Status: planning complete; implementation in progress. Decisions below are
final unless this doc is revised.

---

## 1. References consulted

- `docs/encore-ts/encore-ts-reference.md` — distilled Encore.ts API surface.
- `docs/encore-ts/encore-custom-dockerfile.md` — cancel-then-scrape hotfix recipe.
- `docs/encore-ts/migration/` — the three migration strategy guides
  (greenfield, forklift incremental, full rewrite) distilled from
  Encore's upstream Express → Encore.ts example.
- `<local-path>/encoredev-examples/examples-main/ts/saas-starter/`: canonical SaaS-style
  Encore.ts project (backend + Next.js frontend, Clerk auth, Stripe webhooks).
- `<local-path>/encoredev-examples/examples-main/ts/middleware/`: idiomatic
  `middleware()` patterns: `rate-limiter-flexible` + `req.requestMeta as
  APICallMeta` for conditional middleware logic.
- `<local-path>/encoredev-examples/examples-main/ts/socket-io/`: Socket.io retention
  pattern (works self-hosted, not on Encore Cloud, no tracing).
- `<local-path>/<source-project>/platform/services/`: production
  Encore.ts service used as the structural model: dual-mode auth handler
  (`Header<Authorization>` + `Header<Cookie>`), per-service `encore.service.ts`,
  `SQLDatabase` + Drizzle, `encore build docker --base`, `Dockerfile.base` for
  helper binaries, `infra.config.*.json` for prod, GitHub Actions composite
  actions for CI/CD, external migration runner for Helm pre-install hooks.

## 2. Locked decisions

### §7.1 Auth handler input shape

**Decision: dual mode — `Header<"Authorization">?` + `Header<"Cookie">?` in
`AuthParams`. Parse cookie manually for the existing `access_token` httpOnly
cookie; accept `Authorization: Bearer <token>` for future API namespaces.**

Pattern lifted from `<source-project>/api/auth/handler.ts`:

```ts
interface AuthParams {
  authorization?: Header<"Authorization">;
  cookie?: Header<"Cookie">;
}
```

Preserves CLAUDE.md hard rule 7 (httpOnly cookies only for the cookie-auth
flow). The Bearer path remains optional — no existing endpoint uses it, but
adding one later does not require a handler rewrite.

### §7.2 CSRF strategy

**Decision: one shared `csrfMiddleware` factory in `lib/csrf.ts`, attached
to every service's `Service({ middlewares: […] })` array. Allow-list
matched via regex on `req.requestMeta.path`.**

Lifted from middleware example + the existing `csrfOrSkip` allow-list in
`server/src/middleware/csrf.ts`. `crypto.timingSafeEqual()` and the
double-submit pattern carry over verbatim.

### §7.3 Response envelope

**Decision: accept Encore.ts's raw response shape. Drop the Express
`{ success: true, data: … }` and `{ success: false, error: { … } }` envelopes.**

Errors return Encore's `APIError` JSON `{ code, message, details? }` natively.
Success returns the typed payload directly. The client's `lib/api.ts`
`parseApiError()` and the auth store's `body?.data ?? body` unwrap both
simplify. Matches the source-project pattern and the saas-starter example.

### §7.4 File uploads

**Decision: `api.raw` + `multer.memoryStorage()` inside the raw handler.**

Keeps the existing magic-byte validation, MIME allow-list, 10MB cap, and
UUID-rename logic intact. Endpoint signature changes from
`router.post('/upload', authenticate, csrf, upload.single('file'), …)` to
an `api.raw({ method: "POST", path: "/files/upload", expose: true, auth: true })`
with `multer({ storage: memoryStorage(), limits })(req, res, …)` invoked
manually. Auth + CSRF + rate-limit run as service middleware (so the auth
check happens before the multer parse).

### §7.5 Socket.io vs Encore streaming

**Decision: `api.streamInOut<InMessage, OutMessage>` for the AI chat. Socket.io
retention documented as an escape hatch in `02-security.md` for self-hosted
deployments that need namespaces/rooms/ack callbacks.**

The Vue client doesn't currently consume the `/ai` Socket.io namespace, so the
swap is free. The generated Encore client will give a future UI a typed
stream handle. Self-hosted Socket.io stays possible per the
`encoredev-examples/ts/socket-io` recipe.

### §7.6 Rate limiting

**Decision: `rate-limiter-flexible` inside an Encore `middleware()`. In-memory
default; `RateLimiterRedis` swap when `REDIS_URL` is set.**

Lifted from the Encore middleware example. Drops `express-rate-limit`
entirely. The four current tiers (api, auth, ai, broadcast) become four
limiter instances; the env-var configuration (`RATE_LIMIT_*_MAX`,
`RATE_LIMIT_*_WINDOW_MS`) carries over.

### §7.7 Port

**Decision: 4000.** Encore's default. Cascade across `vite.config.ts` proxy,
`.env.example` `PORT`, README port references, CSP `connectSrc`, healthcheck
URL.

### §7.8 Dockerfile path

**Decision: primary is `encore build docker --base <custom>` via a composite
action; `Dockerfile.base` carries OS + helper binaries; a
`scripts/docker-build.sh` ships as an optional fast hotfix path.**

Pattern lifted from `<source-project>/`. Three artifacts:

1. `server/Dockerfile.base` — `node:22-slim` + OS packages (`git`,
   `ca-certificates`) + any helper binaries (none in the template by
   default).
2. CI workflow runs `docker build -f Dockerfile.base -t app-base:${SHA} .`
   then `encore build docker --config infra.config.json --base
   app-base:${SHA} <image:tag>`. `encore build docker` lays the compiled
   `main.mjs`, `encore-runtime.node`, and (with `bundle_source: true`) the
   source tree on top.
3. `server/scripts/docker-build.sh` — cancel-then-scrape hotfix for
   source-only fixes against an already-published image. Documented as
   secondary, not for service-shape or dependency changes.

A standalone `server/Dockerfile` is no longer used as the primary build
artifact; we keep a minimal compatibility one referencing the fast path.

## 3. Target file tree (`template/public/server/`)

```
server/
├── encore.app                       # { lang: "typescript", global_cors, build: { docker: { bundle_source: true } } }
├── infra.config.json                # local-dev infra binding (secrets via $env)
├── package.json                     # encore.dev + rate-limiter-flexible + minimal node deps
├── tsconfig.json                    # "~encore/*": ["./encore.gen/*"] path mapping
├── vitest.config.ts                 # vitest, --passWithNoTests
├── .env.example                     # secrets + non-secret env (PORT=4000, etc.)
├── Dockerfile.base                  # OS + ca-certs + helper binaries
├── Dockerfile                       # hotfix minimal-swap variant (FROM prev published image)
├── scripts/
│   ├── docker-build.sh              # cancel-then-scrape hotfix builder
│   ├── migrate.mjs                  # prod migration runner (CI / Helm hook)
│   ├── seed.ts                      # kept; runs via tsx against DATABASE_URL
│   ├── set-role.ts                  # kept
│   └── generate-keys.ts             # kept; RSA-2048 JWT keys
├── lib/
│   ├── env.ts                       # Zod for non-secret env (slimmer than today)
│   ├── secrets.ts                   # `secret("JWT_PRIVATE_KEY")` etc. — Encore-managed
│   ├── jwt.ts                       # RS256 sign/verify (moved from utils/token.ts)
│   ├── cookies.ts                   # parse cookie header; set cookies via raw resp
│   ├── cookie-config.ts             # access/refresh/csrf cookie options (verbatim)
│   ├── csrf.ts                      # middleware factory + CSRF_EXEMPT_PATHS
│   ├── rate-limit.ts                # rate-limiter-flexible middleware factories
│   ├── security-headers.ts          # CSP/HSTS/Permissions-Policy as middleware
│   ├── errors.ts                    # pg error code → APIError map
│   ├── audit.ts                     # audit_log writer (moved from utils/audit-logger.ts)
│   ├── logger.ts                    # encore.dev/log thin wrapper
│   └── role-hierarchy.ts            # 6-tier hierarchy + legacy alias (moved from middleware/authorize.ts)
├── db/
│   ├── encore.service.ts
│   ├── db.ts                        # SQLDatabase("app", { migrations: "./migrations" })
│   └── migrations/
│       ├── 1_extensions_and_functions.up.sql      (renamed from 001_…)
│       ├── 2_user_account.up.sql
│       ├── …
│       └── 23_align_notification_message_type.up.sql
├── auth/
│   ├── encore.service.ts            # Service("auth", { middlewares: [security, rateLimit, csrf] })
│   ├── handler.ts                   # authHandler + Gateway (cookie OR bearer)
│   ├── google.ts                    # GET /auth/google + /auth/google/callback
│   ├── microsoft.ts                 # GET /auth/microsoft + /auth/microsoft/callback (tid claim verified)
│   ├── refresh.ts                   # POST /auth/refresh
│   ├── me.ts                        # GET /auth/me
│   ├── csrf-token.ts                # GET /auth/csrf-token
│   ├── logout.ts                    # POST /auth/logout
│   ├── user-model.ts                # queries via db tagged templates
│   └── refresh-token-model.ts
├── resources/                       # GET /resources, /resources/:id, /resources/:id/updates
├── service-catalogue/               # GET/POST/PUT /services
├── service-locations/               # GET /service-locations + map data
├── forms/                           # GET/POST/PUT/DELETE /forms
├── submissions/                     # GET/POST/PUT /submissions
├── files/                           # POST /files/upload (api.raw), GET /files, GET /files/:id
├── notifications/
│   ├── encore.service.ts
│   ├── api.ts                       # GET /notifications, /unread-count, PUT /:id/read, POST /broadcast
│   ├── stream.ts                    # GET /notifications/stream — api.raw + SSE
│   ├── stream-manager.ts            # singleton per-user fanout
│   └── model.ts
├── ai/
│   ├── encore.service.ts
│   ├── chat-stream.ts               # api.streamInOut<InMessage, OutMessage>
│   ├── chat-rest.ts                 # api() POST /ai/chat (REST fallback)
│   ├── analyze-image.ts             # api.raw + multer
│   ├── conversations.ts             # list/delete/get-messages/generate-title
│   ├── providers/                   # openai, anthropic, google adapters
│   └── model.ts
├── admin/
├── landing/
├── contact/
├── blog/
├── subscriptions/                   # notification subscriptions, NOT Stripe
└── health/                          # /health, /health/live, /health/ready
```

## 4. Implementation milestones

Per-commit progress is captured in git history (`git log --oneline`); the
table below tracks high-level status so a fresh session can scan it.

| # | Milestone | Scope | Status | Commit(s) |
|---|---|---|---|---|
| M1 | Scaffold | `encore.app`, `infra.config.json`, `Dockerfile.base`, `Dockerfile`, `scripts/docker-build.sh`, `scripts/migrate.mjs`, new `package.json`, new `tsconfig.json`, new `.env.example`, root `package.json` scripts, `vite.config.ts` proxy → :4000. | **DONE** | `ab24445` |
| M2 | Shared lib | `lib/*.ts` — env, secrets, jwt, cookies, cookie-config, csrf, rate-limit, security-headers, errors, audit, logger, role-hierarchy. | **DONE** | `df651a1` |
| M3 | `db/` service + migration rename | `db/encore.service.ts`, `db/db.ts`, copied `migrations/` to `db/migrations/`, renamed `NNN_X.sql` → `<n>_X.up.sql`. | **DONE** | `adc47cd` |
| M4 | `auth/` service | handler, gateway, google, microsoft, refresh, me, csrf-token, logout, user-model, refresh-token-model, service helpers. **First complete service — pattern locked.** | **DONE** | `c6237ad` |
| M5 | Domain services port | 13 services. Per-service commit seams below. | **DONE — 13 / 13** | see below |
| M5.1 | health | `/health`, `/health/live`, `/health/ready` | **DONE** | `6839933` |
| M5.2 | resources | `GET /resources`, `/resources/:id`, `/resources/:id/updates` | **DONE** | `e1e05f9` |
| M5.3 | service-catalogue | `GET /services`, `/services/:id`, `/services/categories` | **DONE** | `04171f2` |
| M5.4 | service-locations | `GET /service-locations`, `/service-locations/map`, `/service-locations/:id` | **DONE** | `941d924` |
| M5.5 | contact + blog | `POST /contact`; `GET /blog`, `/blog/:slug` | **DONE** | `e6e0b97` |
| M5.6 | landing | `GET /landing` (aggregator) | **DONE** | `bf57a28` |
| M5.7 | forms | `GET /forms/published`, `/forms/:id/schema` | **DONE** | `c637838` |
| M5.8 | submissions | drafts + submit + retract + reads (7 endpoints, owner-scoped) | **DONE** | `4bc5885` |
| M5.9 | files | `POST /files/upload` (api.raw + multer), `GET /files`, `GET /files/:id` | **DONE** | `2a7f93f` |
| M5.10 | subscriptions | `GET/POST /subscriptions`, `DELETE /subscriptions/:id` | **DONE** | `906e79b` |
| M5.11 | notifications (SSE + broadcast) | list / unread-count / mark-read / stream (api.raw + SSE) / broadcast (admin + broadcastRateLimit, inline via `consumeBroadcastLimit` so the stream isn't gated by the narrow broadcast budget) | **DONE** | `b60b30f` |
| M5.12 | ai (streaming + image + REST) | api.streamInOut chat, api.raw analyze-image, REST fallback, conversations CRUD, generate-title. SDK-based providers (`openai`, `@anthropic-ai/sdk`) replace the legacy hand-rolled https.request + SSE parser. | **DONE** | `e48083a` |
| M5.13 | admin | 35 endpoints across 9 sub-domains (dashboard, resources, service-locations, services, forms, submissions, notifications history, users, blog). Per-domain file split. `requireAdmin()` inline gate on every endpoint. Audit-log on every mutation. Broadcast NOT duplicated — unified with `/notifications/broadcast` from M5.11. | **DONE** | `3439f57` |
| M6 | Client touch-up | `lib/api.ts` envelope refactor (Encore `{ code, message, details? }` error shape; CSRF sub-code at `details.code`), `stores/auth.ts` unwrap removal (bare `MeResponse`), `/v1/*` URL prefix drop across 14 composables + ContactPage, vite proxy `/api → /` rewrite, `types/api.ts` envelope cleanup. `encore gen client` deferred to post-M8 (tsparser can't parse alongside legacy `src/`). | **DONE** | `9cf7b50` |
| M7 | CI/CD + harness docs | `.github/workflows/{ci,cd}.yml.example`, `.github/actions/encore-{install,build}/action.yml`, update CLAUDE.md, README.md, `index.html` (harness.html) template stack, `02-security.md` Encore.ts specifics, replace `.claude/guides/backend/nodejs/01-08.md` content. Run `/sync-docs` (clean). | **DONE** | `c3ee1cc` |
| M8 | Cleanup | Delete `server/src/`, `server/migrations/` (legacy), `server/openapi.yaml`. Boot-verify (`encore check` clean; `encore run` graph + topology + secrets resolve). Fix three structural issues surfaced by the parser: `ai/stream.ts` OutMessage union → interface; `files/types.ts` `Buffer` → `Uint8Array`; `lib/encore.service.ts` declared so `secret(...)` calls in `lib/secrets.ts` parse (Encore requires secrets to load from within a service). Generate typed TS client at `client/src/lib/encore-client.ts`. OpenAPI gen deferred — encore.dev v1.54.2 rejects `Record<string, unknown>` JSON-blob columns as "unknown builtin type ANY"; doc'd in §7 risks. | **DONE** | `6dc8817` |

## 5. Non-negotiables preserved

| CLAUDE.md rule | How preserved |
|---|---|
| 7 — Parameterized SQL only | `SQLDatabase` tagged-template queries are auto-parameterized. Zero string concat. |
| 7 — httpOnly cookies only | `authHandler` accepts `Header<"Cookie">`; `cookie-config.ts` retains httpOnly + secure + sameSite=lax. Bearer path optional, never replaces cookie path. |
| 8 — Migrations idempotent + auto-run | Existing 23 migrations are `IF NOT EXISTS` everywhere. Renamed and moved to `db/migrations/`. Encore applies on `encore run` and on deploy. Prod path via `scripts/migrate.mjs` for CI/Helm-hook flows. |
| 10 — Mechanical gates | Every gate in `.claude/scripts/check-*.mjs` is path-agnostic or already file-list-based. New paths picked up automatically once `/sync-docs` runs. |

## 6. Out of scope

- Drizzle ORM. We keep raw `db.queryRow` tagged templates (matching the source-project pattern).
  Drizzle is a future enhancement; not in this swap.
- Splitting `app` DB into per-service `SQLDatabase` instances. Single shared
  database for now (one `SQLDatabase("app")` under `db/`). Per-service DBs
  are a later enhancement; not in this swap.
- Removing `pg` outright. Kept for the migration runner and any code that
  needs raw `pg.Pool` access outside Encore's typed primitives.
- Removing `openid-client` and `jsonwebtoken`. Kept verbatim; called from
  `api()` handlers instead of Passport middleware.

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| File-upload size limits enforced inconsistently between `api.raw` and Encore-typed endpoints. | One shared `multer` config in `lib/upload.ts` consumed by both file and AI image endpoints. |
| OIDC callback redirect URLs hardcoded to a single API base | Keep `API_BASE_URL` env var; reuse for both Google and Microsoft callback paths. |
| Encore's auto-generated OpenAPI may not match the hand-curated `openapi.yaml` | **Partially resolved (M8).** Hand-curated file deleted. `npm run gen:openapi` script ships in `server/package.json` but fails today with `unknown builtin type ANY` on `Record<string, unknown>` JSON-blob columns (`form_schema`, `submission_data`, `metadata`, `filter_criteria`, `resource_tags`). The runtime + the TS client generator handle these fine — only the OpenAPI exporter is strict. Two paths to unblock: (a) wait for encore.dev to model TS `unknown` in its OpenAPI generator, or (b) tighten the column types to concrete shapes. The TS client at `client/src/lib/encore-client.ts` generates clean and is the de-facto API contract for the SPA. |
| Existing client expects `{ success, data }` everywhere | **Resolved (M6).** `lib/api.ts` parses Encore's `{ code, message, details? }` directly; the CSRF interceptor reads sub-codes at `body.details.code` (where `csrfMiddleware.withDetails()` lands them). Composables drop the inner `res.data.data` unwrap for single-entity endpoints; paginated responses keep `res.data.data` because the field name `data` is part of the typed wire response, not a legacy envelope. Auth store consumes `MeResponse` bare. |
| Service-to-service calls were implicit imports today (`import * as auth from '../services/auth.service'`) | Becomes typed `~encore/clients` calls. Cleaner, but requires regenerating `encore.gen/` on every shape change. CI workflow handles this. |
| Helm chart references `/health/live` and `/health/ready` paths | Health service preserves the exact paths. |

## 8. Session pickup — picking up cold

This section is for a fresh session resuming the migration. Read this
first; the rest of this doc is reference.

### Where we are

**The migration is complete.** M1–M8 landed. M6 client: `9cf7b50`.
M7 CI/CD + docs: `c3ee1cc`. M8 cleanup landed in the commit this doc
lives under.

The new Encore.ts tree at `template/public/server/` is the only tree.
Legacy `src/` and root `migrations/` are deleted. `encore check`
passes clean; `encore run` resolves the application graph, service
topology, and secrets cleanly on first boot.

### What M8 changed

- **Deleted:** `template/public/server/src/` (legacy Express tree, ~120
  files, ~25k lines). `template/public/server/migrations/` (NNN_*.sql,
  superseded by `db/migrations/<n>_*.up.sql`).
  `template/public/server/openapi.yaml` (regenerated on demand via
  `npm run gen:openapi`; see §7 risks for the open `ANY` limitation).
- **Fixed (parser-blocking structural issues surfaced by `encore check`
  once the legacy tree was gone):**
  - `ai/stream.ts` — collapsed the `OutMessage` discriminated-union TYPE
    into a single interface with `kind: "chunk" | "done" | "error"` and
    the rest of the fields optional. Encore's `api.streamInOut<In, Out>`
    requires a named interface; the parser rejects type-alias unions.
  - `files/types.ts` — `file_data: Buffer | null` → `Uint8Array | null`.
    Encore's tsparser doesn't recognize the Node global `Buffer`. Buffer
    extends Uint8Array, so model code and `resp.end(file.file_data)` in
    `api.raw` keep working; downloads bypass the typed boundary anyway.
  - `lib/encore.service.ts` — declared `lib` as a no-endpoint service.
    Encore requires `secret(...)` calls to be loaded from inside a
    service directory; `lib/secrets.ts` was at module top-level of a
    non-service dir before M8.
- **Generated:** `template/public/client/src/lib/encore-client.ts` via
  `encore gen client`. The full typed Encore API surface for the SPA.
  Committed to the template so a fresh clone has a buildable client
  without first running encore; CI regenerates on every release per
  `.github/workflows/cd.yml.example`. Composables continue to use the
  manually-typed axios wrappers from M6 — wiring `encore-client.ts`
  into the composables is a future enhancement (the typed client uses
  its own auth flow and would duplicate the existing cookie-based
  composable layer).
- **Verified:** `cd template/public/server && encore check` exits 0.
  `encore run --port=4000` resolves the application graph, topology,
  and secrets without error; full migration apply requires Docker and
  was not run end-to-end in this commit, but the load-bearing parse
  checks all pass.

### What M7 changed

- `template/public/.github/actions/encore-install/action.yml` — composite
  action: download + install + telemetry-disable + version check.
- `template/public/.github/actions/encore-build/action.yml` — composite
  action: build `Dockerfile.base`, run `encore build docker --base`, tag,
  push to the registry.
- `template/public/.github/workflows/ci.yml.example` — runs on every PR:
  client lint/type-check/vitest, server typecheck/vitest, blueteam +
  redteam-static + greenteam round 1 scans, `/sync-docs` drift check,
  `validate-active-steps`.
- `template/public/.github/workflows/cd.yml.example` — runs on push to
  `main`: install Encore CLI, `npm ci` server + client, `encore gen
  client` → typed SPA client, `npm run build` (Vite), `encore build
  docker` → GHCR push.
- `.claude/guides/backend/nodejs/01-08.md` — eight short guides rewritten
  end-to-end for Encore.ts. The new template files themselves remain the
  canonical reference; the guides explain the decisions and point.
- `.claude/standards/02-security.md` — added an "Encore.ts implementation
  notes" section near the top with one row per CLAUDE.md hard-rule
  mechanic (parameterised SQL, httpOnly cookies, CSRF, security headers,
  rate limiting, input validation, error envelope, file uploads,
  streaming, secrets, audit, migrations).
- `CLAUDE.md` (root) — added "Common commands" + "Template backend:
  Encore.ts" sections.
- `template/public/README.md` — updated quick-start to reflect Encore
  ports (4000 + 9400 dev dashboard), the new server directory layout
  (per-domain Encore services + `lib/` + `db/migrations/` with `.up.sql`),
  and the OIDC SSO via openid-client (no Passport).
- Root `README.md` + `index.html` — template stack updated from
  "Express + TS" → "Encore.ts + TS" in the headline blurb and the
  template-comparison table.

`/sync-docs` reports no drift after the changes.

### What M6 changed on the client (`template/public/client/`)

- `lib/api.ts` — `parseApiError` reads Encore's top-level `code` +
  `message`; CSRF interceptor reads sub-code at `body.details.code`
  (where `lib/csrf.ts` plants `CSRF_MISSING` / `CSRF_MISMATCH` via
  `.withDetails()`). `fetchCsrfToken` consumes the bare `{ token }`
  body.
- `stores/auth.ts` — `fetchUser` consumes bare `MeResponse` (no `data ?? body` fallback).
- `types/api.ts` — `ApiSuccessEnvelope` / `ApiErrorEnvelope` /
  `ApiPaginatedEnvelope` removed. Kept `ApiPaginationInfo` and added
  `PaginatedResponse<T>` since paginated Encore endpoints continue to
  ship `{ data: T[], pagination }` as a typed shape (not a wrapper).
- 14 composables + `ContactPage.vue` — `/v1/` prefix dropped from
  every URL (Encore endpoints are root-pathed). Single-entity reads
  switched from `res.data.data` to `res.data`. Paginated reads keep
  `res.data.data` because that `data` is the typed response field.
- `vite.config.ts` — proxy `/api` block rewrites the prefix away
  (`/api/foo` → `/foo`) so axios's `/api` baseURL still namespaces the
  browser request while reaching Encore's root-pathed endpoints.
- `useFiles.ts` `downloadUrl()` returns `/api/files/:id` (was
  `/api/v1/files/:id`); the proxy rewrite hands Encore `/files/:id`.
- `ContactPage.vue` — Express's 422 `{ error: { details: [...] } }`
  branch dropped. Encore validation failures land as 400
  `invalid_argument` with a single `message`; per-field highlighting
  would need `APIError.invalidArgument(...).withDetails({ fields })`
  server-side first.
- **Deferred at M6, generated at M8:** `lib/encore-client.ts` —
  produced by `encore gen client` after M8 deleted `src/`. Committed
  to the template for clone-and-run; CI regenerates on every release.
  The current composables continue to use the manually-typed axios
  wrappers from M6; wiring `encore-client.ts` into composables is a
  future enhancement (it uses its own auth flow and would duplicate
  the existing cookie-based layer).
- **Not in scope and intentionally left:** `reportSecurityEvent` posts
  to `/audit/security-event`; that endpoint isn't ported in the new
  service tree. The call is fire-and-forget and currently no-ops at
  runtime. M7 or M8 can decide whether to ship a corresponding Encore
  endpoint or remove the helper.

### Boot verification — passed at M8

`encore check` exits 0 on `template/public/server/`. `encore run
--port=4000` resolves the application graph, service topology, and
secrets without error. Three structural issues surfaced during the
M8 cumulative parse and were fixed inline — see "What M8 changed"
above for the list.

Full end-to-end migration apply (`encore run` to the dev-dashboard
+ all 22 migrations applied + every service listed) requires Docker
and was not run end-to-end in the M8 commit; the load-bearing parse
checks all pass and Docker pulls the Postgres image on first run.

### The patterns to follow

Every new service should look like:

```
template/public/server/<domain>/
├── encore.service.ts   # Service("<name>", { middlewares: [...] })
├── types.ts            # row interfaces + filter shapes
├── model.ts            # tagged-template queries via db
└── api.ts              # api() / api.raw() endpoint handlers
```

**Middleware composition** — pick from `lib/`:
- `securityHeaders` — always include
- `csrfMiddleware` — include when any endpoint accepts state-changing
  cookie-auth requests; safe to include unconditionally on
  authenticated services
- `apiRateLimit` — general bucket; include on most services
- `authRateLimit` — login flows only (already on auth service)
- `aiRateLimit` — AI service only
- `broadcastRateLimit` — broadcast endpoint only

**Query patterns** — when the WHERE clause is fixed, use tagged
templates (`db.queryRow\`SELECT … WHERE id = ${id}\``). When the
WHERE clause is genuinely dynamic, branch on input shape to keep each
branch a fixed-shape query; fall back to `db.rawQueryAll(sql, ...params)`
with a small SQL-string builder only for the truly polymorphic cases
(see `resources/model.ts` and `service-locations/model.ts`).

**Auth in handlers** — `import { getAuthData } from "~encore/auth"`,
then `const auth = getAuthData()!`. Owner-scope checks happen in the
endpoint, not the model (see `submissions/api.ts`).

**Errors** — `throw APIError.notFound(...)`, `APIError.permissionDenied(...)`,
`APIError.invalidArgument(...)`. Map pg errors via `lib/errors.mapDbError`.

**File uploads / raw responses** — `api.raw` + re-read `access_token`
cookie + re-verify JWT manually (authHandler doesn't run inside raw
handlers). Pattern is in `files/api.ts`.

### M5.11 / M5.12 / M5.13 — landed; pattern notes for future reference

**M5.11 notifications** (`b60b30f`) — landed with:
- `GET /notifications` (paginated, `filter=all|unread|read` — three
  fixed-shape tagged-template branches keep the query SAST-friendly)
- `GET /notifications/unread-count`
- `PUT /notifications/:id/read`
- `GET /notifications/stream` — `api.raw` + SSE. `stream-manager.ts`
  ports from `server/src/sse/notification-stream.ts` almost verbatim;
  retyped against `node:http` `ServerResponse` (not Express's
  `Response`) because `api.raw` passes node's raw response. Per-user
  `Set<ServerResponse>`, 10-conn-per-user cap with oldest-eviction,
  bfcache-safe disconnect, 30s heartbeat.
- `POST /notifications/broadcast` — admin + inline
  `consumeBroadcastLimit(auth.userID)` (added to `lib/rate-limit.ts`).
  Inline rather than service-middleware so the long-lived SSE stream
  on the same service isn't gated by the narrow broadcast budget.
- Bulk delivery insert uses `db.rawQueryAll` with positional `$N`
  params + `ON CONFLICT DO NOTHING` — same escape-hatch pattern as
  `resources/model.ts`.

**M5.12 ai** (`e48083a`) — landed with:
- `POST /ai/chat` (REST fallback, typed)
- `api.streamInOut<InMessage, OutMessage>` at `/ai/chat/stream`
  replaces the Socket.io `/ai` namespace per §7.5. Out-message uses a
  `kind`-tagged union (`chunk | done | error`) — one transport, three
  meanings.
- `POST /ai/analyze-image` — `api.raw` + multer; re-auths via the
  cookie pattern from `files/api.ts`.
- `GET /ai/conversations` + `DELETE /ai/conversations/:id` +
  `GET /ai/conversations/:id/messages` +
  `POST /ai/conversations/:id/generate-title`.
- `aiRateLimit` (service middleware, fast first reject) +
  `enforceDbRateLimit` (DB-backed `ai_message` count, durable second
  cap) defend RT-AI-001 cost-abuse.
- **Provider adoption — design note:** Encore.ts examples
  (`encoredev/examples/ts/ai-agent-api`, `ts/ai-chat`) both call the
  LLM SDKs directly inside endpoint handlers. M5.12 followed that
  pattern: the legacy hand-rolled `https.request` + SSE parser
  (`src/services/ai-providers/openai.provider.ts` + `claude.provider.ts`,
  ~500 lines) collapsed to ~250 lines of SDK calls (`openai`,
  `@anthropic-ai/sdk`) with native `for await` streaming, type-checked
  request/response shapes, and proper vision content-block handling.
  Gemini and Grok keep the `extends OpenAIProvider with baseURL`
  pattern from the legacy code — both vendors expose an
  OpenAI-compatible endpoint.
- API key sourcing matches `lib/jwt.ts`: Encore secret `AI_API_KEY`
  primary, env (`AI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`)
  fallback.

**M5.13 admin** (`3439f57`) — landed with per-domain split (the
recommended option from the previous draft). 35 endpoints, 13 files
under `template/public/server/admin/`:
- `encore.service.ts` — `securityHeaders + csrfMiddleware +
  apiRateLimit`. Role gate is inline per-endpoint via `requireAdmin()`
  (from `./helpers.ts`), which wraps `requireRole(auth.role, "admin")`
  and returns the resolved AuthData.
- `types.ts`, `model.ts` — admin-only request shapes + admin-only
  queries (dashboard counts + time series, find-by-id-no-status-filter
  variants, soft-delete writes, dynamic-WHERE listings).
- 9 endpoint files: `dashboard.ts`, `resources.ts`,
  `service-locations.ts`, `services.ts`, `forms.ts`, `submissions.ts`,
  `notifications.ts`, `users.ts`, `blog.ts`.
- **Broadcast NOT duplicated.** The legacy
  `POST /api/admin/notifications/broadcast` was unified with the
  public `POST /notifications/broadcast` at M5.11; admin clients call
  that path directly. `/admin/notifications` is read-only (broadcast
  history).
- **Contact triage not implemented.** The plan listed it, but the
  legacy `src/routes/admin.routes.ts` doesn't expose a contact-admin
  endpoint. Omitted for parity; add later if a `contact_inquiry`
  status-management endpoint is needed.
- **Submission state-machine** carried over verbatim from
  `src/services/admin.service.ts` (`submitted → in-review → approved →
  completed`, or `rejected → in-review`); invalid transitions surface
  as `APIError.invalidArgument`.
- **Self-modification blocked** across role / status / delete (auth.userID
  === target.id triggers a clean error).

### Commit style

One commit per service (or per logical sub-group for admin if you
split it). Format follows the existing M5.x commits:

```
feat(server): M5.<N> <service-name> service

<one-paragraph summary of endpoints>

<structure breakdown if non-trivial>

<call-outs: CLAUDE.md rules preserved, RA references, etc.>
```

### Verification — passed at M8

The original gate (`encore run`, confirm boot, confirm dev dashboard
lists every service) was deferred from M5.x-M7 because Encore's
tsparser walks the filesystem and there is no `.encoreignore` /
`encore.app` exclude key as of 2026-05; the legacy `src/` imports
blocked parsing before the new tree could be reached.

**M8 deleted `src/` and ran the gate.** Results:

- `cd template/public/server && npm install` — passing.
- `encore check` — exits 0 (after the three M8 fixes documented in
  "What M8 changed").
- `encore run --port=4000` — application graph, service topology, and
  secrets all resolve cleanly. Docker pulls the Encore Postgres image
  on first boot; full migration apply requires the pull to complete.
- 22 active migrations (`db/migrations/<n>_*.up.sql`) + 1 opt-in
  `.up.sql.example` ready to apply.

Adopters running this template should expect `encore run` to take
1–2 minutes on first boot (Postgres image pull); subsequent runs
boot in seconds.

After that one-shot post-M8 check passes, M6 client refactor can run
against the typed `encore-client.ts` generated from the new services.
