# Codemap: acme-vue-encore

> Architectural blueprint: execution flows, service graph, API surfaces, and component relationships.
> For developer onboarding and AI agent context. Reduces codebase to ~5% of tokens, ~90% of understanding.
>
> **Backend = Encore.ts.** The Express 5 BFF was retired in the Encore migration (specs 001 to 006).
> The authoritative backend specs are `specs/001-encore-app-architecture` (layout + service decomposition)
> and `specs/002-security-data-invariants` (the security/data invariant freeze). This document is a
> governed view of those specs.

---

## Project Tree

```
acme-vue-encore/
├── apps/
│   ├── api/                       Encore.ts application (standalone; excluded from npm workspaces)
│   │   ├── encore.app             App manifest (global_cors, build.docker.bundle_source)
│   │   ├── infra.config.json      Secret + SQL bindings ($env); no secret values committed
│   │   ├── Dockerfile.base        OS + helper binaries for the image base
│   │   ├── Dockerfile.hotfix      Source-only fast-path image
│   │   ├── scripts/               generate-keys.ts (RSA JWT keys), migrate.mjs, docker-build.sh
│   │   ├── lib/                   `lib` service: shared security primitives (no endpoints)
│   │   ├── db/                    `db` service: SQLDatabase("app") + migrations (no endpoints)
│   │   ├── health/                `health` service: probes + /api/v1/info + /api/v1/csp-report
│   │   ├── auth/                  `auth` service: authHandler + Gateway, multi-driver SSO, JWT
│   │   ├── gateway/               `gateway` service: BFF api.raw proxy /api/v1/data/*
│   │   └── web/                   `web` service: api.static serving the built SPA
│   │
│   ├── web/                       Vue 3 SPA: public/external user (PrimeVue)
│   │   └── src/
│   │       ├── main.ts            ENTRY POINT (frontend)
│   │       ├── router/            Routes + nav guards
│   │       ├── stores/            Pinia auth state (Encore-adapted; spec 006)
│   │       ├── views/             Page components
│   │       ├── components/        Layout (header/footer or sidebar) built on PrimeVue
│   │       └── lib/               encore-client.ts (committed typed client reference; spec 006)
│   │
│   └── web-internal/              Vue 3 SPA: internal/staff (same shape as web)
│
├── packages/                      Reusable libraries (NOT consumed by the Encore backend)
│   └── shared/                    Types, Zod schemas, constants (declared by the SPAs)
│
├── docker/                        Encore self-host docker-compose + container guide (README)
├── docs/                          Auth, deployment, development, testing, troubleshooting
└── specs/                         Spec spine: authoritative design record (000–016)
```

> Dev/runtime config lives in `apps/api/.env.example` (the Encore app's env template); there is no
> root-level `.env`. Copy it to `apps/api/.env` for local overrides.

> **Standalone backend.** `apps/api` has its own `package-lock.json` and `node_modules` and is
> **excluded** from the root npm workspaces (`apps/web`, `apps/web-internal`, `packages/*`). It imports
> no `@template/*` package; the security primitives it needs live in `apps/api/lib`. `packages/` holds
> only `shared` (types, Zod schemas, constants shared between the two SPAs).

---

## Tech Stack (Required)

All code added to this app **must** use these technologies. Do not introduce alternatives.

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Language** | TypeScript (strict) | All application/library/test code in TS. JS allowed only for config/build tooling. |
| **Frontend** | Vue 3 (Composition API + `<script setup>`) | Single-file components only. Two SPAs: `web` (public), `web-internal` (staff). |
| **State** | Pinia | Stores in `apps/web*/src/stores/`. No Vuex. |
| **Routing** | Vue Router 4 | Lazy-load views: `() => import('./views/X.vue')` |
| **Styling** | PrimeVue | `primevue` + `@primevue/themes` (Aura preset, indigo primary); component-scoped CSS. No Tailwind. |
| **Backend** | **Encore.ts** | Typed `api()` / `api.raw()` endpoints; services discovered from `encore.service.ts`; `authHandler` + `Gateway`; service `middlewares`. Replaces Express 5. |
| **Auth** | **Stateless RS256 JWT** | Access (15 min) + DB-backed refresh (7 day, rotation/revocation) in httpOnly cookies; CSRF double-submit. Multi-driver SSO (mock/rauthy). **Not** `express-session`. |
| **Validation** | Zod (SPA/packages); Encore request types (API) | No Joi, Yup, or class-validator. |
| **Persistence** | **Postgres via Encore `SQLDatabase("app")`** | `user_account`, `refresh_token`, `audit_log`. Tagged-template (auto-parameterized) queries only. Redis is optional, for rate-limit backing only (`REDIS_URL`). |
| **Build** | Vite (frontend); `encore build docker` (backend) | Backend image: `Dockerfile.base` + `encore build docker --base`. Monorepo with npm workspaces (api excluded). |
| **Testing** | Vitest (unit), Playwright (E2E) | `encore check` validates the backend graph/topology/types. |
| **Linting** | ESLint 9 + Prettier | Flat config format. |

**Do NOT introduce**: Express/`express-session` (retired), Vuex, ORMs (Prisma/TypeORM/Sequelize), Webpack, Joi/Yup, CSS-in-JS, Redux-style patterns, Tailwind CSS, string-concatenated SQL.

---

## Service Graph

```
Encore application (apps/api) ════════════════════════════════════════════
  Gateway + authHandler (auth/handler.ts)   verifies access-token cookie | Bearer → AuthData{ roles, ... }
    │
    ├── lib       no endpoints; secret() declarations + shared middleware/utilities
    │             cookie-config, cookies, csrf, jwt, secrets, security-headers,
    │             rate-limit, audit, logger (CC-006 PII guard), roles (hasRole/requireRole any-of)
    │
    ├── db        no endpoints; SQLDatabase("app") + migrations (1_extensions → 4_audit_log)
    │
    ├── health    securityHeaders only (probes/CSP are unauthenticated)
    │
    ├── auth      securityHeaders + csrfMiddleware + apiRateLimit
    │             authHandler + Gateway; drivers {mock, rauthy}; me/refresh/logout/csrf-token
    │
    ├── gateway   api.raw catch-all /api/v1/data/* (auth:true) → private backend (S2S OAuth)
    │
    └── web       api.static → apps/api/web/build (SPA history fallback)

Frontend (apps/web, apps/web-internal) ════════════════════════════════════
  Vue 3 SPA ──► axios (+ encore-client.ts typed reference) ──► /api/v1/* (Vite proxy → :4000)

Packages (reusable libs; NOT imported by apps/api) ════════════════════════
  shared   types, Zod schemas, constants
```

**Service discovery**: each directory exporting `Service(...)` via `encore.service.ts` is a service.
**Build order (SPAs + packages)**: shared → web + web-internal. The Encore app builds independently (`encore build docker`).

---

## API Surface (Type Signatures)

```typescript
// === apps/api/auth/handler.ts (Encore authHandler + Gateway) ===
interface AuthData { userID: string; email: string; name: string; roles: string[]; ssoProvider: string }
// authHandler validates the access-token cookie (or Authorization: Bearer); populates AuthData.
// Gateway({ authHandler }) gates every endpoint declared with `auth: true`.

// === apps/api/lib/jwt.ts ===
function signAccessToken(claims): Promise<string>          // RS256, ~15 min
function signRefreshToken(claims): Promise<string>         // RS256, ~7 day
function verifyAccessToken(token: string): Promise<Claims>

// === apps/api/lib/roles.ts (AUTH-007, INV-1) ===
function hasRole(roles: string[], required: string | string[]): boolean   // any-of, not a hierarchy
function requireRole(auth: AuthData, required: string | string[]): void   // throws Encore APIError if missing

// === apps/api/lib/csrf.ts (INV-4) ===
function csrfMiddleware(opts?): Middleware                 // double-submit; CSRF_MISSING / CSRF_MISMATCH at details.code

// === apps/api/db/db.ts ===
const db = new SQLDatabase("app", { migrations: "./migrations" })
// Queries use tagged templates: db.query`SELECT ... WHERE id = ${id}` (auto-parameterized; INV-2).

// === apps/api/gateway/proxy.ts (BFF, INV-10) ===
// api.raw GET/POST/PUT/PATCH/DELETE /api/v1/data/*path (auth:true):
//   path-traversal sanitisation → S2S OAuth Bearer (token-cache) → fetch private backend
//   → 5xx masked to 502, timeout to 504, per-access audit.

// === apps/web*/src/stores/auth.store.ts (Pinia; spec 006) ===
state: { user: User | null, loading: boolean, error: string | null }
getters: { isAuthenticated: boolean, hasRole(role): boolean }
actions: { fetchUser(), login(driver: string), logout(), checkStatus() }
// Reads BARE me/status payloads + Encore { code, message, details } errors;
// CSRF token fetched from GET /api/v1/auth/csrf-token body, replayed as X-CSRF-Token.
```

---

## Execution Flows

### 1. HTTP Request → Response

```
Browser / SPA
  │
  ▼
Encore Gateway              authHandler runs for `auth: true` endpoints (cookie | Bearer → AuthData)
  │                         per-service middleware: securityHeaders, csrfMiddleware, apiRateLimit
  │
  ├── /api/v1/auth/*         ───► auth service (drivers, me, refresh, logout, csrf-token)
  ├── /api/v1/data/*         ───► gateway service (api.raw proxy to private backend, auth:true)
  ├── /health, /health/*     ───► health service (liveness/readiness probes)
  ├── /api/v1/info           ───► health service (API metadata)
  ├── /api/v1/csp-report     ───► health service (CSP violation sink)
  └── /!path (non-API)       ───► web service (api.static → built SPA, history fallback)
```

### 2. Authentication (Multi-Driver, Stateless JWT)

```
Driver selection: AUTH_DRIVER env (mock | rauthy) is the default for /api/v1/auth/login.

  ├── mock      ───► GET /api/v1/auth/mock/login?user=0|1|2 ───► instant principal
  └── rauthy    ───► GET .../rauthy/login → 302 rauthy → GET .../rauthy/callback (OIDC code exchange)
                                                              │
                                              ┌───────────────┘
                                              ▼
                              issue RS256 access + refresh JWT (httpOnly cookies);
                              persist refresh-token hash in db; redirect → SPA (FRONTEND_URL)

Session lifecycle (stateless):
  GET  /api/v1/auth/me         (auth:true)  → bare MeResponse { id, email, name, roles, ssoProvider, ... }
  GET  /api/v1/auth/status                  → { authenticated, drivers }
  GET  /api/v1/auth/drivers                 → registered driver names
  GET  /api/v1/auth/csrf-token              → { token }   (replay as X-CSRF-Token on mutations)
  POST /api/v1/auth/refresh                 → rotate refresh token, mint new access cookie
  POST /api/v1/auth/logout     (auth:true)  → revoke refresh token + clear cookies

JWT keys (RS256): apps/api/keys/*.pem in dev (`npm run generate-keys`); Encore secrets in prod
  (JWT_PRIVATE_KEY / JWT_PUBLIC_KEY / JWT_REFRESH_PRIVATE_KEY / JWT_REFRESH_PUBLIC_KEY), declared in lib/secrets.ts.
```

**Driver files**: `apps/api/auth/{mock,rauthy}.ts` · **Handler/Gateway**: `apps/api/auth/handler.ts`
**Models**: `apps/api/auth/{user-model,refresh-token-model}.ts` · **Secrets**: `apps/api/lib/secrets.ts`

### 3. API Gateway (BFF Pattern, INV-10)

```
Authenticated request (auth:true)
  │
  ▼
/api/v1/data/*path         gateway/proxy.ts (api.raw; GET/POST/PUT/PATCH/DELETE)
  ├── sanitise forwarded path (traversal protection)
  ├── token-cache.ts        getAccessToken() → OAuth client-credentials (cached, deduped)
  ▼
fetch() to private backend  Authorization: Bearer {token}
  ▼
response proxied back        5xx masked to 502, timeout to 504, per-access audit
```

### 4. Build Pipeline

```
Frontend / packages          npm run build → build:packages (shared) → build:apps (web, web-internal)
                             build:web emits into apps/api/web/build (served by the web service; spec 005)

Backend (Encore)             npm run build:api → apps/api: docker build -f Dockerfile.base
                             → encore build docker --config infra.config.json --base <base>
                             dev: npm run dev:api → encore run --port=4000
                             typecheck: npm run typecheck:api → encore check
```

---

## Component Map

### API: Service decomposition

```
auth/        handler.ts (authHandler + Gateway), encore.service.ts (securityHeaders + csrfMiddleware + apiRateLimit),
             drivers.ts (discovery + default login + status), mock.ts, rauthy.ts,
             me.ts, refresh.ts, logout.ts, csrf-token.ts, user-model.ts, refresh-token-model.ts
gateway/     proxy.ts (5 api.raw data handlers), token-cache.ts (S2S OAuth), encore.service.ts
health/      api.ts (health/liveness/readiness, info, csp-report), encore.service.ts (securityHeaders)
lib/         cookie-config, cookies, csrf, jwt, secrets, security-headers, rate-limit, audit, logger, roles, env
db/          db.ts (SQLDatabase("app")), migrations/{1_extensions,2_user_account,3_refresh_token,4_audit_log}.up.sql
web/         static.ts (api.static → ./build), encore.service.ts (no middleware), build/index.html
```

### Web: Component Hierarchy (both SPAs)

```
App.vue
└── AppLayout.vue                  Skip nav link + id="main-content" on <main>
    ├── AppHeader.vue              PrimeVue header bar + user menu (web; web-internal uses a sidebar AppLayout)
    ├── <router-view />
    │   ├── HomeView.vue           Landing page
    │   ├── LoginView.vue          Auth method selection (multi-driver)
    │   ├── ProfileView.vue        User info (protected, ProgressSpinner loading state)
    │   ├── ConnectivityTestView.vue  BFF gateway connectivity test (protected)
    │   └── AboutView.vue          App info
    └── AppFooter.vue              application footer (PrimeVue, web app)

PrimeVue (per-SFC imports):  Button │ Card │ Menu │ Avatar │ Tag │ Message │ Badge │ ProgressSpinner
```

---

## Endpoints

| Method | Path | Auth | Service | Handler / Notes |
|--------|------|:----:|---------|-----------------|
| GET | `/api/v1/auth/drivers` | - | auth | list registered driver names |
| GET | `/api/v1/auth/status` | - | auth | `{ authenticated, drivers }` |
| GET | `/api/v1/auth/login` | - | auth | default driver (`AUTH_DRIVER`) |
| GET | `/api/v1/auth/mock/login` | - | auth | mock instant login (`?user=0\|1\|2`) |
| GET | `/api/v1/auth/rauthy/login` | - | auth | OIDC redirect to rauthy |
| GET | `/api/v1/auth/rauthy/callback` | - | auth | OIDC code exchange |
| GET | `/api/v1/auth/csrf-token` | - | auth | `{ token }` (replay as `X-CSRF-Token`) |
| GET | `/api/v1/auth/me` | Y | auth | current user (`MeResponse`) |
| POST | `/api/v1/auth/refresh` | - | auth | rotate refresh token → new access cookie |
| POST | `/api/v1/auth/logout` | Y | auth | revoke refresh token + clear cookies |
| GET/POST/PUT/PATCH/DELETE | `/api/v1/data/*path` | Y | gateway | BFF proxy to private backend |
| GET | `/health` | - | health | composite health |
| GET | `/health/liveness` | - | health | always 200 (process alive) |
| GET | `/health/readiness` | - | health | 200 / 503 (dependencies) |
| GET | `/api/v1/info` | - | health | API metadata |
| POST | `/api/v1/csp-report` | - | health | CSP violation sink |
| GET | `/!path` (non-API) | - | web | static SPA + history fallback |

**Response shapes** (Encore-native): typed endpoints return the bare payload (e.g. `MeResponse`); `api.raw`
handlers write JSON directly. Errors use Encore's `{ code, message, details }` shape (sub-codes such as
`CSRF_MISSING` land at `details.code`). The Express `{ success, data }` / `{ success:false, error }` envelope is retired.

---

## Persistence (`db` service)

```
SQLDatabase("app")          apps/api/db/db.ts: migrations auto-applied on `encore run` / deploy

Migrations (apps/api/db/migrations/):
  1_extensions.up.sql       Postgres extensions
  2_user_account.up.sql     one row per principal; user_roles TEXT[] (multi-role, INV-1), email-keyed,
                            sso_provider_*, attributes JSONB
  3_refresh_token.up.sql    hash-only refresh-token store (INV-7); rotation + revoked_at; ON DELETE CASCADE
  4_audit_log.up.sql        durable audit trail (INV-8): table/record/action + old/new JSONB + actor + IP/UA

Query contract (INV-2): tagged templates only: db.query`... WHERE id = ${id}`: never string concatenation.
Standalone migration runner for self-host: apps/api/scripts/migrate.mjs.
```

Redis is **not** a session store here (sessions are stateless JWT). `REDIS_URL`, when set, only swaps the
in-memory rate-limit backend (`lib/rate-limit.ts`, INV-6) for a Redis-backed one.

---

## Security Stack

```
Request ─► Encore Gateway ─► authHandler (auth:true) ─► service middleware ─► handler
                                │                          │
                                │                          ├── securityHeaders  (CSP, HSTS, Permissions-Policy)
                                │                          ├── csrfMiddleware   (double-submit; auth service)
                                │                          └── apiRateLimit     (api + auth tiers)
                                │
                                └── verifies access-token cookie | Bearer → AuthData{ roles }
                                    requireRole(auth, ...) → APIError (any-of, INV-1)

Cookies:  httpOnly │ secure │ sameSite (access + refresh + CSRF), issued by auth/service.ts; no token readable from JS (INV-3)
CSRF:     double-submit, constant-time compare; callbacks + /auth/refresh exempt (INV-4)
JWT:      RS256 access (~15m) + DB-backed refresh (~7d) rotation/revocation; hash-only refresh store (INV-7)
Logging:  PII redaction (CC-006 guard in lib/logger.ts); LOG_PII must be false in production (fail-fast)
Audit:    lib/audit.ts → audit_log, best-effort, never blocks the user flow (INV-8)
```

Security/data invariants are frozen by **spec 002** (`security-data-invariants`); `lib/` holds the
primitives, the services enforce them. AUTH-007 role-scoped **data** endpoints (INV-1) are a downstream
obligation: this app ships no domain data services to scope.

---

## User Roles

### Sources by driver

| Driver | Role source | Fallback |
|--------|-------------|----------|
| **Mock** | Hardcoded in `apps/api/auth/mock.ts` | n/a |
| **rauthy** | OIDC token/userinfo claims: `roles` → `role` → `groups` (priority order) | `RAUTHY_DEFAULT_ROLE` env (default: `user`) |

### Default roles

```
'user'       → every authenticated user (baseline access)
'admin'      → administrative functions
'developer'  → mock driver only (dev/test)
```

Roles are a **set** (`string[]`, any-of membership), never a privilege hierarchy (INV-1).

### Protecting endpoints

```typescript
// Encore endpoint with auth + role check
export const listCases = api(
  { expose: true, auth: true, method: "GET", path: "/api/v1/cases" },
  async () => {
    const auth = getAuthData()!            // populated by authHandler
    requireRole(auth, ["case-worker", "admin"])   // any-of; throws APIError if missing
    // ... scope the query to auth.roles (AUTH-007): WHERE-clause scoping in the service layer
  },
)
```

### Frontend role checks

```typescript
const { hasRole } = useAuthStore()
if (hasRole('admin')) { /* show admin UI */ }
// Router meta guard: meta: { requiresRole: 'supervisor' } → redirect /unauthorized if missing
```

### Agent instructions: customizing roles

**If the project spec defines roles:**
1. Add one mock user per role in `apps/api/auth/mock.ts` (realistic name, email, department, `attributes`).
2. Assign only the roles appropriate for that audience (a case-worker should NOT have `admin`).
3. Set `RAUTHY_DEFAULT_ROLE` to the lowest-privilege role in `apps/api/.env` (template: `apps/api/.env.example`).
4. Apply `requireRole(auth, ...)` to every protected endpoint using the spec's role strings, and scope
   data queries to `auth.roles` in the service layer (AUTH-007 / INV-1).
5. Replace the "Default roles" table above with the application's actual roles.

**If no roles defined:** keep the 3 default mock users. Use `auth: true` alone on protected endpoints.

---

## Invariants

1. **Standalone Encore backend**: one Encore app at `apps/api`, excluded from npm workspaces, self-contained (no `@template/*` imports). Services discovered from `encore.service.ts`.
2. **Multi-driver auth**: `mock`/`rauthy` coexist; `AUTH_DRIVER` sets the default. Uniform discovery/login surface.
3. **Stateless JWT, not sessions**: RS256 access + DB-backed refresh rotation in httpOnly cookies (INV-3/INV-7). No `express-session`.
4. **Postgres via `SQLDatabase`**: `user_account` / `refresh_token` / `audit_log`. Parameterized (tagged-template) queries only (INV-2). Redis is rate-limit-only.
5. **BFF pattern**: `gateway` proxies `/api/v1/data/*` to the private backend with S2S OAuth tokens, traversal sanitisation, 5xx masking, timeout to 504, audit (INV-10).
6. **PII never logged**: `lib/logger.ts` redacts (CC-006); `LOG_PII=false` in production or the app fails fast.
7. **PrimeVue UI**: all SPA UI uses PrimeVue components (Aura theme preset, registered in `main.ts`).
8. **`/api/v1` prefix retained**: the OIDC redirect URIs and the gateway contract stay stable across the migration.
9. **Single deployable**: the `web` service serves the built SPA via `api.static`; one Encore app, port 4000.

The security/data invariant freeze is **spec 002**; the architectural blueprint is **spec 001**.

---

## Quick Reference: Adding Features

**New API endpoint**:
add `apps/api/<service>/<name>.ts` exporting `api({ ... })` (or `api.raw`); it is auto-discovered. For a new
service, add a directory with `encore.service.ts`.

**New frontend page**:
`views/*.vue` → add route in `router/index.ts` → add nav link in `AppHeader.vue` (in `apps/web` and/or `apps/web-internal`).

**New auth driver**:
add `apps/api/auth/<driver>.ts` (login/callback endpoints + principal mapping) → declare its secrets in `apps/api/lib/secrets.ts` → wire it into driver discovery.

**New gateway-proxied route**:
covered by the `/api/v1/data/*` catch-all in `gateway/proxy.ts`; configure `PRIVATE_API_BASE_URL` + `GATEWAY_OAUTH_*`.

**New persisted entity**:
add a migration `apps/api/db/migrations/N_<name>.up.sql` → query via `db.query\`...\`` (tagged template).

**New unit test**:
colocate `foo.test.ts` next to `foo.ts`; run `encore check` for the backend graph and `vitest` for units.

---

## Conventions

**TypeScript**:
- Strict mode. No `any` unless unavoidable (mark with `// eslint-disable-line` + reason).
- `interface` for object shapes, `type` for unions/intersections.

**Frontend**:
- `<script setup>` for all components. No Options API.
- PrimeVue components imported per-SFC (e.g. `import Button from 'primevue/button'`); the Aura theme preset is registered once in `main.ts`.
- Lazy-load views: `component: () => import('../views/X.vue')`. Pinia for shared state.

**Backend (Encore)**:
- Endpoints are typed `api()` (request/response interfaces) or `api.raw()` (manual `Request`/`Response`, used for cookie/redirect/proxy flows).
- Business logic in the service module; secrets via `secret()` in `lib/secrets.ts`; never read raw `process.env` for secret material.
- Database access is parameterized (tagged-template) only; never concatenate SQL (INV-2).

**Security**:
- `auth: true` + `requireRole(auth, ...)` on every protected endpoint; scope data to `auth.roles` (AUTH-007 / INV-1).
- CSRF token required for state-changing requests; fetched from `/api/v1/auth/csrf-token`, replayed as `X-CSRF-Token`.
- Never log PII (the logger redacts; do not bypass it). Secrets via Encore's secret store / `infra.config.json`.

**Testing**:
- Unit tests colocated with source. `encore check` validates the backend application graph + topology + types.
- Pinia store tests use a fresh `createPinia()` per test with mocked HTTP.

---

## Further Reading

| Doc | When to read |
|-----|-------------|
| `CODEMAP.md` | Architectural overview, security model, and customization map (start here) |
| `specs/001-encore-app-architecture/spec.md` | Authoritative backend layout + service decomposition |
| `specs/002-security-data-invariants/spec.md` | The security/data invariant freeze (INV-1 – INV-11) |
| `README.md` | First-time project setup and quick start |
| `docs/AUTH-SETUP.md` | Configuring auth drivers (rauthy OIDC, Mock) on Encore |
| `docs/DEPLOYMENT.md` | Building and deploying the Encore app |
| `docs/DEVELOPMENT.md` | Local dev setup, `encore run`, hot reload, debugging |
| [PrimeVue docs](https://primevue.org/) | UI component library (Aura theme) used by both SPAs |
| `docs/TESTING.md` | Writing and running unit and E2E tests |
| `docs/TROUBLESHOOTING.md` | Diagnosing common errors and issues |
