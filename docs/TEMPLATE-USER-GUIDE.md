# Template User Guide

How to use the Vue + Encore Enterprise Template to create new application repositories.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Profiles](#profiles)
- [Working with Modules](#working-with-modules)
- [How the Generator Works](#how-the-generator-works)
- [Validating Your App](#validating-your-app)
- [Customizing Your App](#customizing-your-app)
- [Troubleshooting](#troubleshooting)

---

## Overview

This template is a monorepo containing a standalone **Encore.ts** BFF API and two Vue 3 SPAs (one external-facing, one staff-facing). It uses a **module system** to compose optional domain features on top of the base app skeleton.

The base app skeleton (`apps/api`) is a complete Encore.ts application. A profile selects the authentication driver for the target environment. Optional domain feature modules are composed on top by copying self-contained Encore service directories into the generated app.

### What the base app gives you

- Encore.ts application at `apps/api` (port 4000)
- Services: `lib` (security primitives) / `db` (SQLDatabase) / `health` (probes) / `auth` (stateless RS256 JWT + multi-driver SSO) / `gateway` (BFF `/api/v1/data/*` proxy) / `web` (static SPA serving)
- Vue 3 SPAs with PrimeVue (Aura preset, indigo primary), Pinia, Vue Router 4
- Postgres via `SQLDatabase("app")` with auto-applied migrations
- Stateless RS256 JWT auth (access + DB-backed refresh rotation); httpOnly cookies; no `express-session`
- Multi-driver authentication: `mock` (local dev) / `saml` (external-facing) / `entra-id` (staff-facing); all three drivers ship in-app; a profile sets the default via `AUTH_DRIVER`
- CSRF double-submit, security headers, rate limiting (Redis-backed when `REDIS_URL` is set)
- BFF gateway: `/api/v1/data/*` catch-all proxy to a private backend with S2S OAuth tokens
- Vitest + Playwright test setup; ESLint 9 + Prettier

### What modules add

- Optional domain feature services composed at generation time (e.g. `user-management`)
- Declarative overlays for cross-cutting infrastructure (secrets, CORS entries, env vars)
- SPA views and navigation items for the added feature

Session stores (`session-store-redis`, `session-store-postgres`) and the Express auth-driver modules (`auth-saml`, `auth-entra-id`, `auth-mock` as standalone modules, `auth-core`, `service-auth`) are **retired**. Those concerns are now handled by the base app directly (stateless JWT) or by the `AUTH_DRIVER` profile axis (driver selection is configuration, not a file-copy module).

---

## Quick Start

### Create a new app

```bash
# Public-facing app (SAML auth via your SAML identity provider)
npx tsx scripts/setup-app.ts --profile public --dest ../my-public-app

# Internal/staff app (Entra ID / Azure AD)
npx tsx scripts/setup-app.ts --profile internal --dest ../my-internal-app

# Minimal (mock auth; local development only)
npx tsx scripts/setup-app.ts --profile minimal --dest ../my-dev-app
```

Add `--yes` to skip the confirmation prompt. Add `--dry-run` to preview the plan without making changes. Add `--no-install` to skip `npm install` and `encore gen client`.

After the script completes:

```bash
cd ../my-public-app
cd apps/api
cp .env.example .env    # configure secrets (SAML_*, JWT_*, etc.)
npm run generate-keys   # generate RSA JWT signing keys (dev only)
cd ../..
npm run dev             # api on :4000, web on :5173, web-internal on :5174
```

### Create a dual-app (external-facing + staff as two independent Encore apps)

```bash
npx tsx scripts/setup-dual-app.ts --dest ../my-dual-app
```

This produces two complete, independent Encore apps:

| Directory | `AUTH_DRIVER` | Audience |
|-----------|--------------|----------|
| `<dest>/public` | `saml` | external-facing |
| `<dest>/internal` | `entra-id` | staff-facing |

See [DUAL-APP-GUIDE.md](DUAL-APP-GUIDE.md) for details.

---

## Profiles

A profile sets `AUTH_DRIVER` in `apps/api/.env.example` and ensures the matching secret bindings exist in `apps/api/infra.config.json`. All three drivers ship in-app; the profile only controls which one is the default.

| Profile | `AUTH_DRIVER` | Secrets populated | Use case |
|---------|--------------|-------------------|----------|
| `minimal` | `mock` | none | local dev; mock login only |
| `public` | `saml` | `SAML_*` | external-facing (your SAML IdP) |
| `internal` | `entra-id` | `ENTRA_*` | staff-facing (Azure AD) |

`SQLDatabase("app")` is always present; there is no session store and no session-store profile axis.

Optional domain modules can be composed at generation time via `--with <module>`:

```bash
npx tsx scripts/setup-app.ts --profile internal --dest ../my-app --with user-management
```

---

## Working with Modules

### List available modules

```bash
npx tsx scripts/add-module.ts --list
```

### Install a module into an existing generated app

```bash
npx tsx scripts/add-module.ts <module-name> [--yes] [--dry-run] [--no-install]
```

`--yes` skips the confirmation prompt. `--dry-run` shows the plan without making changes. `--no-install` skips `npm install`.

**What `add-module` does:**

1. Loads and validates the module manifest against schema v2
2. Checks dependencies (`requires`, `requiresOneOf`); auto-installs missing `requires`
3. Auto-removes conflicting modules
4. Copies frontend view files (from `modules/<name>/files/`) into the project
5. Updates `template.json` (module state + file ownership tracking)
6. Copies each `services[]` directory into `apps/api/<service>/`; Encore discovers it at compile time
7. Merges `migrations[]` into `apps/api/db/migrations/` with deterministic renumbering (next free `<n>_` prefix)
8. Merges `secrets[]` into `apps/api/infra.config.json`
9. Merges `corsEntries[]` into `apps/api/encore.app` `global_cors` (JSONC-aware, comment-preserving)
10. Regenerates `apps/web/src/modules.ts` (Vue frontend nav wiring)
11. Merges `envVars` into `.env.example`
12. Applies `workspaceChanges` and `packageDeps`, then runs `npm install`

There is no generated `modules.ts` Express loader. Encore discovers the composed service directories at compile time.

### Remove a module

```bash
npx tsx scripts/remove-module.ts <module-name> [--yes] [--dry-run] [--no-install]
```

**What `remove-module` does:**

1. Checks that no other installed module depends on this one
2. Deletes all files owned by the module (tracked in `template.json`)
3. Deletes the service directories the module composed
4. Removes exactly the migration files this module added (by the recorded `composedMigrations` names)
5. Removes the module's secret bindings from `infra.config.json`
6. Removes the module's CORS contributions from `encore.app`
7. Updates `template.json`, regenerates web nav, comments out env vars, reverses package deps

**Removal is blocked** if another installed module depends on this one. Remove the dependent first:

```bash
npx tsx scripts/remove-module.ts <dependent> --yes
npx tsx scripts/remove-module.ts <module> --yes
```

### Checking installed modules

Inspect `template.json` in the project root. The `modules` map records what is installed; `composedMigrations` records the exact renumbered migration filenames added by each module so removal can undo them precisely.

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

---

## How the Generator Works

### Pipeline

`setup-app.ts` runs four steps:

1. **Copy the base Encore app.** The template is the base. Everything at the template root is copied into `--dest` except the governance and generator machinery: `modules/`, `scripts/`, `specs/`, `standards/`, `tools/`, `.derived/`, `.claude/`, `orchestration/`, `Cargo.*`, `Makefile`, `AGENTS.md`, `CODEMAP.md`. The destination is a clean Encore app plus SPAs.

2. **Select the auth driver.** The profile sets `AUTH_DRIVER` in `apps/api/.env.example`. All three drivers (`mock`/`entra-id`/`saml`) ship in-app; selection is the `AUTH_DRIVER` env plus which secrets are populated. No driver files are copied or deleted. No runtime `registerDriver` calls are emitted.

3. **Compose optional domain modules.** For each `--with <module>`, `encore-composer.ts` copies the service directory, merges migrations (renumbered), merges secrets into `infra.config.json`, and merges CORS entries into `encore.app`. Encore discovers the copied service directory at compile time.

4. **Generate the typed client.** `encore gen client` regenerates the typed client (`apps/web/src/client.ts`) when the Encore CLI is available.

### No generated loader

Encore discovers services from the filesystem. There is no `registerAllModules(app: Express)` function and no `apps/api/src/modules.ts` Express loader. The only generated file for backend composition is a comment-preserving CORS merge into `apps/api/encore.app`.

### Service composition

A feature module contributes a complete Encore service directory (e.g. `modules/user-management/files/user-management/`) that the composer copies to `apps/api/user-management/`. Once copied, Encore discovers it automatically because it contains an `encore.service.ts` exporting `new Service(...)`.

### Module manifest v2 fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Must match the directory name under `modules/` |
| `services` | `string[]` | Encore service directories the module contributes |
| `migrations` | `{ source, description? }[]` | Migration files merged (renumbered) into `db/migrations/` |
| `secrets` | `{ name, description?, required }[]` | Encore `secret()` names bound in `infra.config.json` |
| `corsEntries` | `{ field, values[] }[]` | Additions to `encore.app` `global_cors` |
| `middlewares` | `string[]` | `lib` middleware factory names the service composes (documentary) |
| `requires` | `string[]` | Hard dependencies |
| `conflicts` | `string[]` | Auto-removed on install |
| `files` | `Record<src, dest>` | Frontend view files copied into the project |
| `envVars` | `Record<key, EnvVarDef>` | Non-secret env vars merged into `.env.example` |
| `webSnippetFile` | `string?` | Vue nav registration snippet |
| `packageDeps` | `Record<workspace, Record<pkg, version>>` | npm dependencies per workspace |

The Express runtime-registry fields (`apiRegistrations`, `authDriverRegistration`, `sideEffectImports`) are removed in schema v2. They do not appear in any manifest.

### State tracking

`template.json` tracks installed modules and file ownership. The `composedMigrations` array on each module entry records the exact renumbered migration filenames, so `remove-module` can delete precisely those files without affecting other modules.

---

## Validating Your App

After generation or after adding modules, validate the backend graph:

```bash
cd <dest>/apps/api
encore check          # validate the Encore service graph, topology, and types
```

Validate the module system state:

```bash
npx tsx scripts/validate-modules.ts
```

Run the full test suite:

```bash
npm test              # vitest across workspaces
npm run typecheck     # type-check SPAs + packages
npm run typecheck:api # encore check (backend graph + types)
npm run lint
```

---

## Customizing Your App

### After generation

Develop your app on the generated Encore skeleton:

1. **Add a backend endpoint:** create `apps/api/<service>/<name>.ts` exporting `api({ ... })`. It is auto-discovered. For a new service, add a directory with `encore.service.ts`.
2. **Add a Vue view:** add a `.vue` file in `apps/web/src/views/`, register the route in `router/index.ts`, add a nav link in `AppHeader.vue`.
3. **Add a persisted entity:** add a migration `apps/api/db/migrations/N_<name>.up.sql`. Query it via tagged templates: `db.query\`SELECT ... WHERE id = ${id}\``.
4. **Add a shared type:** add to `packages/shared/src/`.

### Adding modules later

```bash
# Add user management to an existing generated app
npx tsx scripts/add-module.ts user-management --yes

# Remove it
npx tsx scripts/remove-module.ts user-management --yes
```

### Files you should NOT edit manually

| File | Why |
|------|-----|
| `apps/web/src/modules.ts` | Regenerated on every module add/remove |
| `template.json` | Managed by add/remove scripts |

`apps/api/src/modules.ts` does not exist in the Encore model. There is no Express loader.

### Auth configuration

All three drivers ship in-app. Set `AUTH_DRIVER` in `apps/api/.env.example` (or `apps/api/.env`) to choose the default. Supply the matching secrets via `apps/api/infra.config.json` (dev) or Encore's secret store (production).

For local development with mock auth: `AUTH_DRIVER=mock` (no external IdP required).
For production SAML: `AUTH_DRIVER=saml` plus `SAML_*` secrets.
For production Entra ID: `AUTH_DRIVER=entra-id` plus `ENTRA_*` secrets.

See `docs/AUTH-SETUP.md` for detailed driver configuration.

---

## Troubleshooting

### "Dependency not met" error

```
Error: Dependency not met: at least one of [...] must be installed before "<module>"
```

Install the required module first, then retry.

### "Cannot remove" error

```
Error: Cannot remove "<module>": module "<other>" requires it
```

Remove the dependent module first, then remove the one you want.

### `encore check` fails after composing a module

The module's service directory has been copied but may have a compile error. Check the Encore output for the specific service. The most common cause is a missing import or a type mismatch in the module's `model.ts`.

### Migration numbering collision

If two modules each supply a migration with the same source basename, the composer assigns unique `<n>_` prefixes sequentially. The exact assigned filename is recorded in `template.json` `composedMigrations`, so `remove-module` deletes precisely the right file.

### `npm install` fails during module operation

Files and state are updated before `npm install`. Run it manually if it fails:

```bash
npm install
```

### Encore CLI not found

The generator calls `encore gen client` best-effort and logs a warning if the CLI is absent. Install the Encore CLI (`https://encore.dev/docs/install`) and run the command manually:

```bash
encore gen client --output ./apps/web/src/client.ts
```
