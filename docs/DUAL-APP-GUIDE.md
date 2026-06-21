# Dual-App Setup Guide

Generating two independent Encore.ts applications: one external-facing (SAML) and one staff-facing (Entra ID).

## When to Use This

Use the dual-app setup when your project needs:

- A **public website** for external users (SAML authentication via your SAML identity provider)
- An **internal website** for staff (Entra ID / Azure AD authentication)
- A hard trust-zone boundary between the two: separate Gateways, separate auth handlers, separate secrets, independent deploy and scale

If your project only needs one site, skip this entirely; the default template works as-is.

## The Encore Model: Two Independent Apps (Option A)

The dual-app generator produces **two complete, standalone Encore applications** under the destination directory:

```
<dest>/
  public/                     complete Encore app; AUTH_DRIVER=saml
    apps/
      api/                    encore.app, infra.config.json, all services
      web/                    external-facing Vue 3 SPA
      web-internal/           (present but unused; the public variant serves apps/web)
    packages/
    package.json
    ...
  internal/                   complete Encore app; AUTH_DRIVER=entra-id
    apps/
      api/                    encore.app, infra.config.json, all services
      web/                    (present but unused)
      web-internal/           staff-facing Vue 3 SPA
    packages/
    package.json
    ...
```

Each subdirectory is a fully independent Encore app: its own `apps/api` with `encore.app` and `infra.config.json`, its own Vue SPAs, its own secrets, and its own Gateway + authHandler. Neither app shares a runtime or a database connection with the other.

This is **not** two servers inside one monorepo. There are no ports 3000/3001, no `server.ts` port juggling, no `apps/api-public` / `apps/api-internal` layout, no shared `modules.ts` loader. Encore owns the listener (port 4000 per app when run independently).

## Prerequisites

- Node.js 24.x and npm 10.x
- [Encore CLI](https://encore.dev/docs/install)
- Docker (Encore provisions a local Postgres for `encore run`)
- The template cloned and dependencies installed (`npm install` at the repo root)

## Running the Setup

```bash
# Create a dual-app project (interactive confirmation)
npx tsx scripts/setup-dual-app.ts --dest /path/to/my-project

# Preview what will be created (no files written)
npx tsx scripts/setup-dual-app.ts --dest /path/to/my-project --dry-run

# Skip confirmation prompt (CI/scripting)
npx tsx scripts/setup-dual-app.ts --dest /path/to/my-project --yes

# Skip npm install
npx tsx scripts/setup-dual-app.ts --dest /path/to/my-project --yes --no-install
```

The destination directory must not exist or must be empty.

## What the Script Does

`setup-dual-app.ts` calls `copyTemplateBase` + `setAuthDriver` twice (once per variant), using the same copy-base core as `setup-app.ts`. It then calls `wireInternalSpa` for the internal variant to point the staff SPA's build output at the Encore `web` service.

### For `<dest>/public`

1. Copies the full template base (excludes generator/governance machinery: `modules/`, `scripts/`, `specs/`, `standards/`, `tools/`, `.derived/`, `.claude/`, `orchestration/`, `Cargo.*`, `Makefile`)
2. Sets `AUTH_DRIVER=saml` in `apps/api/.env.example`
3. The `apps/web` SPA already builds into `apps/api/web/build` (base config), so the `web` service serves the external-facing SPA at `/!path`

### For `<dest>/internal`

1. Copies the full template base (same exclusions)
2. Sets `AUTH_DRIVER=entra-id` in `apps/api/.env.example`
3. `wireInternalSpa` patches the internal variant so the staff SPA is served:
   - Adds `build.outDir = ../api/web/build` to `apps/web-internal/vite.config.ts` so the staff bundle lands where `apps/api/web/static.ts` reads it (`api.static({ dir: "./build" })`)
   - Repoints `build:apps` in `package.json` to `npm run build --workspace=apps/web-internal` so only the staff SPA lands in `apps/api/web/build` (no double-build with `apps/web`)

### Auth driver variant summary

| Subdirectory | `AUTH_DRIVER` | SPA served | Audience |
|-------------|--------------|-----------|----------|
| `public/` | `saml` | `apps/web` | external-facing |
| `internal/` | `entra-id` | `apps/web-internal` | staff-facing |

## Resulting Structure

```
<dest>/public/
  apps/
    api/
      encore.app
      infra.config.json          SAML secret bindings ($env references)
      .env.example               AUTH_DRIVER=saml
      lib/ db/ health/ auth/ gateway/ web/
    web/                         External-facing SPA (Vue 3 + GoA Design System)
      vite.config.ts             build.outDir -> ../api/web/build
    web-internal/                (present; not served by the public variant)
  packages/
    shared/ config/ auth/
  package.json

<dest>/internal/
  apps/
    api/
      encore.app
      infra.config.json          Entra ID secret bindings ($env references)
      .env.example               AUTH_DRIVER=entra-id
      lib/ db/ health/ auth/ gateway/ web/
    web/                         (present; not served by the internal variant)
    web-internal/                Staff-facing SPA (Vue 3 + GoA Design System)
      vite.config.ts             build.outDir -> ../api/web/build (patched by wireInternalSpa)
  packages/
    shared/ config/ auth/
  package.json                   build:apps -> apps/web-internal (patched by wireInternalSpa)
```

## Development

Each variant is a completely independent project. Run them in separate terminal windows:

```bash
# External-facing app
cd <dest>/public
cd apps/api && npm install && npm run generate-keys && cd ../..
npm install
npm run dev         # api on :4000, external web on :5173

# Staff app
cd <dest>/internal
cd apps/api && npm install && npm run generate-keys && cd ../..
npm install
npm run dev         # api on :4000, staff web on :5174
```

Each app runs on port 4000 independently. They never conflict because you run them in separate directories (or in a future deployment, on separate infrastructure).

## Configuration

After running the setup, configure each variant by editing its `apps/api/.env.example` (or `.env`) and `apps/api/infra.config.json`.

### Public variant (SAML)

The `infra.config.json` in the public variant already has `$env` placeholder bindings for `SAML_*` secrets. Supply their values via Encore's secret management or, for local dev, add them to `apps/api/.env`:

```bash
# apps/api/.env in <dest>/public
AUTH_DRIVER=saml
SAML_ENTRY_POINT=https://idp.example.com/sso
SAML_ISSUER=your-app-sp-entity-id
SAML_CERT=<IdP X.509 certificate>
SAML_CALLBACK_URL=https://your-app.example.com/api/v1/auth/saml/callback
# JWT keys: generate with: npm run generate-keys
JWT_PRIVATE_KEY=<apps/api/keys/private.pem contents>
JWT_PUBLIC_KEY=<apps/api/keys/public.pem contents>
JWT_REFRESH_PRIVATE_KEY=<apps/api/keys/refresh-private.pem contents>
JWT_REFRESH_PUBLIC_KEY=<apps/api/keys/refresh-public.pem contents>
```

### Internal variant (Entra ID)

```bash
# apps/api/.env in <dest>/internal
AUTH_DRIVER=entra-id
ENTRA_TENANT_ID=your-azure-tenant-id
ENTRA_CLIENT_ID=your-app-client-id
ENTRA_CLIENT_SECRET=your-client-secret
ENTRA_REDIRECT_URI=https://your-app.example.com/api/v1/auth/entra-id/callback
# JWT keys: generate with: npm run generate-keys
JWT_PRIVATE_KEY=...
```

See `docs/AUTH-SETUP.md` for detailed driver configuration including SAML metadata exchange and Entra ID app registration.

## Adding Domain Modules to Dual Apps

After generation, use `add-module.ts` with `--root` to compose modules into each variant independently:

```bash
# Add user-management to the internal variant only
npx tsx scripts/add-module.ts user-management --yes --root <dest>/internal

# Add it to both
npx tsx scripts/add-module.ts user-management --yes --root <dest>/public
npx tsx scripts/add-module.ts user-management --yes --root <dest>/internal
```

Each variant has its own `template.json`, its own `apps/api` directory, and its own migration set. Module composition is fully independent between variants.

## Build and Deploy

Each variant is a standalone Encore app that builds and deploys independently.

### Build a variant

```bash
cd <dest>/public
npm run build            # build SPAs + packages (external SPA -> apps/api/web/build)
npm run build:api        # encore build docker --base (apps/api)
```

```bash
cd <dest>/internal
npm run build            # build SPAs + packages (staff SPA -> apps/api/web/build via patched outDir)
npm run build:api        # encore build docker --base (apps/api)
```

### Validate the backend graph

```bash
cd <dest>/public/apps/api  && encore check
cd <dest>/internal/apps/api && encore check
```

## Differences from the Express Dual-App Model

The previous Express dual-app generator created two Express servers inside one monorepo, renamed `apps/api` to `apps/api-public` / `apps/api-internal`, juggled ports (3000/3001), patched `server.ts`, and installed separate module stacks via a temporary rename dance.

The Encore model is different in every way:

| Aspect | Express model (retired) | Encore model |
|--------|------------------------|--------------|
| Structure | One monorepo, two `apps/api-*` servers | Two fully independent Encore apps |
| Ports | 3000 (public) / 3001 (internal) | 4000 per app (independent) |
| Auth | `express-session` + runtime driver registry | Stateless RS256 JWT; `AUTH_DRIVER` config |
| Session store | Redis (public) / Postgres (internal) | None; stateless JWT + DB-backed refresh |
| Dual-app wiring | Rename directories, patch `server.ts`, install modules | Copy base twice; set `AUTH_DRIVER`; patch `vite.config.ts` outDir |
| Deployed artifact | Two Node processes in one repo | Two independent Encore Docker images |

There is no `apps/api-public`, `apps/api-internal`, `server.ts` port patching, or `apps/api/src/modules.ts` Express loader in the Encore model.

## Sharing Code Between Variants

Both variants are generated from the same template base, so they start with identical `packages/shared` and frontend component libraries. After generation they are independent; there is no shared runtime between them.

If you need to share custom types or business logic between the two apps over time:
- Copy shared types into `packages/shared/` in both variants and keep them in sync manually, or
- Extract the shared code into a separate npm package consumed by both

The SPAs in each variant are independent Vue 3 apps; shared UI components can be placed in `packages/shared` or a separate package.
