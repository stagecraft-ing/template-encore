# Vue.js + Encore.ts Enterprise Application Template

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-green)](https://vuejs.org/)
[![Encore.ts](https://img.shields.io/badge/Encore.ts-1.57-purple)](https://encore.dev/)
[![Node 24](https://img.shields.io/badge/Node-24.x-green)](https://nodejs.org/)
[![PrimeVue](https://img.shields.io/badge/PrimeVue-4-blue)](https://primevue.org/)

Monorepo template for enterprise applications: public-facing (external user) and internal (staff). An
**Encore.ts** backend (BFF API gateway, stateless RS256 JWT auth, Postgres) plus two Vue 3 SPAs built on
PrimeVue, with pluggable authentication (SAML 2.0, Microsoft Entra ID, Mock) and TypeScript throughout.

> **Backend = Encore.ts.** The original Express 5 BFF was retired in the Encore migration (specs 048 to 054).
> See [`CODEMAP.md`](CODEMAP.md) for the architectural blueprint and `specs/048-encore-app-architecture` /
> `specs/049-preserved-migration-invariants` for the authoritative backend specs.

## Prerequisites

- Node.js 24.x or higher
- npm 10.x or higher
- [Encore CLI](https://encore.dev/docs/install) (`apps/api` is an Encore.ts app)
- Docker (Encore provisions a local Postgres for `SQLDatabase("app")` during `encore run`)

## Quick Start

```bash
# 1. Install the SPAs + shared packages (npm workspaces)
npm install

# 2. Install the standalone Encore app and generate dev JWT keys
#    (apps/api is excluded from the workspaces; it has its own lockfile)
cd apps/api
npm install
npm run generate-keys            # writes apps/api/keys/*.pem (gitignored)
cp .env.example .env             # optional; dev fallbacks work without it
cd ../..

# 3. Run everything (api on :4000, web on :5173, web-internal on :5174)
npm run dev
```

- **Web (public)**: http://localhost:5173
- **Web (internal)**: http://localhost:5174
- **API**: http://localhost:4000
- **Health**: http://localhost:4000/health

`npm run dev` builds the shared packages, then runs the Encore API (`encore run --port=4000`) and both Vue
dev servers concurrently. The Vite dev servers proxy `/api/*` to the API on port 4000. Docker must be running
so Encore can start the local Postgres database.

## Generate a New App

> The app generator (`scripts/setup-app.ts`, `scripts/setup-dual-app.ts`) and the module system now emit
> **Encore.ts** apps. The generator reconciliation completed in specs 058-064. The commands below produce
> an Encore-based app.

```bash
# Public-facing (SAML)
npx tsx scripts/setup-app.ts --profile public --dest ../my-public-app

# Internal/staff (Entra ID)
npx tsx scripts/setup-app.ts --profile internal --dest ../my-internal-app

# Minimal (mock auth: local dev only)
npx tsx scripts/setup-app.ts --profile minimal --dest ../my-dev-app
```

Flags: `--yes` skip prompts · `--dry-run` preview · `--clean` remove template artifacts after setup.

## Commands

```bash
# Development
npm run dev              # api (Encore :4000) + web + web-internal, concurrently
npm run dev:api          # Encore API only (encore run --port=4000)
npm run dev:web          # public SPA only

# Build
npm run build            # shared packages + both SPAs (build:web emits into apps/api/web/build)
npm run build:api        # backend image: encore build docker --base (run from apps/api)

# Testing
npm test                 # vitest across workspaces
npm run test:e2e         # Playwright E2E tests
npm run typecheck        # type-check the SPAs + packages
npm run typecheck:api    # encore check (backend graph + topology + types)

# Quality
npm run lint
npm run lint:fix
npm run format

# Backend helpers (run inside apps/api)
npm run generate-keys    # RSA-2048 JWT signing keys → apps/api/keys/*.pem
npm run gen:client       # regenerate the typed client → apps/web/src/lib/encore-client.ts
```

## Documentation

| Document | Description |
|----------|-------------|
| [CODEMAP.md](CODEMAP.md) | Architecture overview, service graph, security model (start here) |
| [specs/048-encore-app-architecture](specs/048-encore-app-architecture/spec.md) | Authoritative backend layout + service decomposition |
| [specs/049-preserved-migration-invariants](specs/049-preserved-migration-invariants/spec.md) | Security/data invariant freeze (INV-1 to INV-11) |
| [docs/AUTH-SETUP.md](docs/AUTH-SETUP.md) | SAML, Entra ID, and Mock driver configuration |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Building and deploying the Encore app |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Development workflow and conventions |
| [docs/TESTING.md](docs/TESTING.md) | Testing strategy (unit / E2E) |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and solutions |
| [PrimeVue documentation](https://primevue.org/) | UI component library (Aura theme) used by both SPAs |

> The generator/module docs ([docs/TEMPLATE-USER-GUIDE.md](docs/TEMPLATE-USER-GUIDE.md),
> [docs/DUAL-APP-GUIDE.md](docs/DUAL-APP-GUIDE.md), the `MODULARIZATION-*` and `MODULE-DEVELOPMENT-GUIDE`
> docs) now describe the Encore generator and module system (reconciled in specs 058-064; governed by spec 055).

## Disclaimer

This template is a foundational framework for accelerating project setup. It has not undergone full
integration testing or hardening for production deployment. Complete identity provider integration and a
security review before deploying to production.
