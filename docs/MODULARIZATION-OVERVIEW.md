# How the Module System Works

A plain-language introduction to the template's modularization approach, aimed at developers joining the project.

---

## The Problem

We maintain one application template that needs to serve different use cases:

- **Public-facing apps**: rauthy OIDC auth (self-hosted OIDC provider), external-facing
- **Internal/staff apps**: rauthy OIDC auth (self-hosted OIDC provider), staff-facing
- **Local dev**: Mock auth, no external dependencies

Without modularization, we would need separate templates for each, leading to drift, duplicated fixes, and maintenance headaches.

## The Solution: Compile-Time Service Composition

Instead of separate templates, we have **one base Encore.ts app** with a module system. The base app is a complete, deployable Encore application. A **profile** selects the auth driver for the target environment. Optional **domain feature modules** compose additional Encore service directories on top of the base.

```
Base Encore.ts App (apps/api; always present)
  lib/      shared security primitives (securityHeaders, csrf, jwt, roles, audit, logger)
  db/       SQLDatabase("app") + base migrations
  health/   probes + info + CSP report
  auth/     authHandler + Gateway; multi-driver SSO (mock/rauthy); stateless RS256 JWT
  gateway/  BFF api.raw proxy /api/v1/data/* (S2S OAuth)
  web/      api.static serving the built SPA at /!path

+ Profile axis (sets AUTH_DRIVER in .env.example):
  minimal   mock auth; local dev, no external IdP
  public    rauthy; external-facing (rauthy OIDC)
  internal  rauthy; staff-facing (rauthy OIDC)

+ Optional domain modules composed on top:
  user-management   app-managed role catalog + admin CRUD endpoints (reference shape)
  security-core     thin declarative overlay (CORS env + documentation; backend in lib)
  api-gateway       thin declarative overlay (gateway secrets + BFF ConnectivityTestView)
  data-postgres     thin declarative overlay (SQLDatabase env documentation)
  data-redis        thin declarative overlay (REDIS_URL rate-limit env)
```

## What the Base App Already Provides

The base app is a fully working app out of the box. Run `npm run dev` immediately after cloning; no modules needed for local development.

- **Authentication**: stateless RS256 JWT (access ~15 min + DB-backed refresh ~7 day, rotation/revocation), httpOnly cookies, CSRF double-submit. Multi-driver: `mock` and `rauthy` both ship in-app. No `express-session`.
- **Persistence**: `SQLDatabase("app")` (`user_account`, `refresh_token`, `audit_log`). Tagged-template queries only (parameterized, never string-concatenated). Redis is optional, for rate-limit backing only (`REDIS_URL`).
- **Security**: `lib` provides security headers, CSRF middleware, rate limiter, JWT utilities, roles (`requireRole`, `hasRole`), audit log, PII-redacting logger.
- **BFF gateway**: `/api/v1/data/*` catch-all proxy with S2S OAuth tokens, traversal sanitisation, 5xx masking, audit.
- **SPA serving**: `web` service serves the built Vue SPA via `api.static`.

## What Modules Add

Modules add **provider-specific domain features or declarative configuration** that the base template does not ship:

| Module | What it adds |
|--------|-------------|
| `user-management` | A self-contained Encore service directory: `app_role` + `user_role` tables, admin CRUD endpoints (`/api/v1/admin/*`) behind `requireRole("admin","user-manager")`, SPA admin views |
| `security-core` | Thin declarative overlay: CORS env documentation; backend function is already in `lib` |
| `api-gateway` | Thin declarative overlay: `GATEWAY_OAUTH_*` secret declarations + ConnectivityTestView SPA view |
| `data-postgres` | Thin declarative overlay: Postgres env documentation; `SQLDatabase` is already in `db` |
| `data-redis` | Thin declarative overlay: `REDIS_URL` env declaration for the rate-limit backend selector |

**Retired modules** (no Encore analog): `session-store-postgres`, `session-store-redis` (the backend is stateless JWT; no `express-session`), `api-docs` (Encore generates OpenAPI from the app graph), `auth-core`, `auth-mock`, `auth-rauthy`, `service-auth` (driver selection is configuration, not file-copy).

Modules never modify `apps/api` core files. They either copy a complete service directory (domain features) or contribute declarative configuration (overlays).

## How It Works Internally

### 1. Module Catalog

Each module lives in `modules/<name>/` with a v2 manifest and optional source files:

```
modules/user-management/
  manifest.json                                    # v2 declaration (services, migrations, secrets, etc.)
  web.snippet.ts                                   # Vue nav registration snippet
  files/
    user-management/                               # Encore service directory
      encore.service.ts
      users.ts
      roles.ts
      model.ts
      types.ts
    db/
      1_user_management.up.sql                     # migration (renumbered on compose)
    apps/web/src/views/admin/
      UserListView.vue
      UserDetailView.vue
```

The manifest declares everything: which service directories to copy, which migrations to merge, which secrets to bind, which CORS entries to add, which env vars to merge, which frontend files to copy.

### 2. The Orchestrator Scripts

```bash
npx tsx scripts/add-module.ts <module-name> [--yes]    # Install
npx tsx scripts/remove-module.ts <module-name> [--yes] # Remove
npx tsx scripts/validate-modules.ts                    # Verify integrity
```

When you install a module, the orchestrator:

1. Checks dependencies and auto-installs missing `requires`
2. Auto-removes conflicting modules
3. Copies frontend view files
4. Calls `composeModule` (the Encore composition engine):
   - Copies `services[]` directories into `apps/api/<service>/`
   - Merges `migrations[]` into `apps/api/db/migrations/` with deterministic renumbering
   - Merges `secrets[]` into `apps/api/infra.config.json`
   - Merges `corsEntries[]` into `apps/api/encore.app` `global_cors` (JSONC-aware)
5. Regenerates `apps/web/src/modules.ts` (Vue frontend nav wiring via `generateWebModulesTs`)
6. Merges env vars, applies workspace changes, runs `npm install`

**There is no generated backend loader.** Encore discovers the copied service directory at compile time because it contains `encore.service.ts`. Composition is the filesystem.

### 3. Service Composition (The Key Concept)

The core of the module system for domain features is **directory copy + declarative config merge**:

- The composer copies `modules/user-management/files/user-management/` to `apps/api/user-management/`
- Encore discovers it at compile time (finds `encore.service.ts`)
- The migration (`1_user_management.up.sql`) is copied to `apps/api/db/migrations/5_user_management.up.sql` (renumbered to the next free prefix)
- No loader file is regenerated, no `registerAllModules` function is touched

Removing the module reverses each step: deletes `apps/api/user-management/`, deletes the recorded migration file, removes the secret bindings, removes the CORS contributions.

### 4. State Tracking

`template.json` in the project root tracks what is installed:

```json
{
  "modules": {
    "user-management": {
      "version": "2.0.0",
      "installedAt": "2026-06-08",
      "composedMigrations": ["5_user_management.up.sql"]
    }
  },
  "fileOwnership": {
    "apps/web/src/views/admin/UserListView.vue": "user-management",
    "apps/web/src/views/admin/UserDetailView.vue": "user-management"
  }
}
```

`composedMigrations` records the exact renumbered filename(s) so `remove-module` can delete precisely those files, and never a sibling module's migration that happened to share the same source basename.

File ownership prevents two modules from installing files to the same path. When a module is removed, only its owned files are deleted.

## Module Taxonomy

### Cross-cutting concerns are thin declarative overlays

The base Encore app already provides the backend function for `security-core`, `api-gateway`, `data-postgres`, and `data-redis`. Their converted manifests are thin declarative overlays: they contribute secrets, CORS entries, or env var documentation, not `apps/api/src/**` code. Installing them adjusts configuration; removing them reverses exactly those changes.

### Domain features are self-contained Encore service directories

`user-management` is the reference shape. It ships a complete Encore service directory with its own endpoints, model, types, and migration. It is the template for all future feature modules.

### Dependency rules

Modules declare dependencies in their manifest. The orchestrator enforces order:

- You **cannot install** a module without its `requires` being present (auto-installed if missing)
- You **cannot remove** a module if another installed module depends on it
- `conflicts` are auto-removed before install

## Key Principles

1. **Base app is the floor.** The base Encore.ts skeleton is a complete app; modules only add, never subtract from it
2. **Compile-time composition.** Encore discovers services from `encore.service.ts` files; no runtime registry, no generated loader
3. **Declarative config merge.** Cross-cutting concerns are `encore.app` / `infra.config.json` / `envVars` edits, not code injections
4. **Filesystem is the glue.** A domain feature module's presence in `apps/api/<service>/` is all Encore needs to include it in the graph
5. **Reversible.** Every compose operation records enough state to be fully reversed by decompose
6. **File ownership.** Every module-installed file is tracked; no orphans, no conflicts

## Files You Should Not Edit Directly

| File | Why |
|------|-----|
| `apps/web/src/modules.ts` | Regenerated on every module add/remove (frontend nav wiring) |
| `template.json` | Managed by orchestrator scripts |
| `apps/api/encore.app` (the `global_cors` block) | Managed by the JSONC-aware composer for module contributions |
| `apps/api/infra.config.json` (the `secrets` block) | Managed by the composer for module secret bindings |

`apps/api/src/modules.ts` does not exist. There is no Express loader.

## Further Reading

| Document | Audience |
|----------|----------|
| [TEMPLATE-USER-GUIDE.md](TEMPLATE-USER-GUIDE.md) | Step-by-step usage: setup commands, profiles, recipes, troubleshooting |
| [MODULE-DEVELOPMENT-GUIDE.md](MODULE-DEVELOPMENT-GUIDE.md) | How to create a new feature module |
| [MODULARIZATION-SPEC.md](MODULARIZATION-SPEC.md) | Full technical specification for the module system internals |
| [DUAL-APP-GUIDE.md](DUAL-APP-GUIDE.md) | Generating two independent Encore apps (external-facing + staff) |
