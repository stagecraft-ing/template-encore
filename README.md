# [acme-vue-encore](https://stagecraft-ing.github.io/template-encore) [![CI](https://github.com/stagecraft-ing/template-encore/actions/workflows/ci.yml/badge.svg)](https://github.com/stagecraft-ing/template-encore/actions/workflows/ci.yml)
![acme-vue-encore reference application](.github/img/template-github-banner.jpg)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-green)](https://vuejs.org/)
[![Encore.ts](https://img.shields.io/badge/Encore.ts-1.57-purple)](https://encore.dev/)
[![Node 24](https://img.shields.io/badge/Node-24.x-green)](https://nodejs.org/)
[![PrimeVue](https://img.shields.io/badge/PrimeVue-4-blue)](https://primevue.org/)

Runnable reference application: a public-facing SPA and a staff-facing SPA, both backed by a single
**Encore.ts** service cluster. The backend provides a BFF API gateway, stateless RS256 JWT auth, and
Postgres persistence. Both Vue 3 frontends are built on PrimeVue with pluggable authentication
(rauthy OIDC or Mock). TypeScript throughout.

> **Backend = Encore.ts.** The original Express 5 BFF was retired in the Encore migration (specs 001–006).
> See [`CODEMAP.md`](CODEMAP.md) for the architectural blueprint and `specs/001-encore-app-architecture` /
> `specs/002-security-data-invariants` for the authoritative backend specs.

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
dev servers concurrently. The Vite dev servers proxy `/api/*` to the API on port 4000. Docker must be
running so Encore can start the local Postgres database.

## Commands

```bash
# Development
npm run dev              # api (Encore :4000) + web + web-internal, concurrently
npm run dev:api          # Encore API only (encore run --port=4000)
npm run dev:web          # public SPA only

# Local infrastructure (docker-compose.yml at repo root)
npm run docker:up        # docker compose up -d
npm run docker:down      # docker compose down
npm run docker:logs      # docker compose logs -f

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

## Workspace Layout

```
acme-vue-encore/
├── apps/api/            Encore.ts backend (auth, db, gateway, health, lib, web services)
├── apps/web/            Vue 3 + PrimeVue SPA: public/external users
├── apps/web-internal/   Vue 3 + PrimeVue SPA: internal/staff users
├── packages/shared/     Types, Zod schemas, constants shared between the SPAs
├── docker/              Self-host docker-compose + container guide
├── docs/                Auth, deployment, development, testing, troubleshooting
└── specs/               Spec spine: design record (000–016)
```

`apps/api` has its own `package-lock.json` and `node_modules`; it is excluded from npm workspaces. The
SPAs and `packages/shared` are the npm workspace members.

## Spec-Spine Governance

The repo is governed by the [`spec-spine`](https://www.npmjs.com/package/spec-spine) CLI. Every
substantive change begins as a spec in `specs/NNN-slug/spec.md`, compiled into a deterministic registry
and reconciled against the code that claims to implement it.

```bash
make setup        # npm install (pulls the CLI), compile registry + index
make spine        # all four governance verbs: compile, lint, index check, couple
make pr-prep      # pre-commit gate: refresh index, run coupling check
make ci           # local CI loop (spine + lint + typecheck + tests + pins)
```

Active specs: 000 (bootstrap/governance), 001–006 (architecture, security invariants, auth, BFF, SPA
serving, client integration), 007–016 (CI/CD, deployment, repo orchestration, supply-chain, workflow
pins, enterprise actions, AI PR review, Claude skills, Claude config governance, documentation website).

## Documentation

| Document | Description |
|----------|-------------|
| [CODEMAP.md](CODEMAP.md) | Architecture overview, service graph, security model (start here) |
| [specs/001-encore-app-architecture](specs/001-encore-app-architecture/spec.md) | Authoritative backend layout + service decomposition |
| [specs/002-security-data-invariants](specs/002-security-data-invariants/spec.md) | Security/data invariant freeze (INV-1 – INV-11) |
| [docs/AUTH-SETUP.md](docs/AUTH-SETUP.md) | rauthy OIDC and Mock driver configuration |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Building and deploying the Encore app |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Development workflow and conventions |
| [docs/TESTING.md](docs/TESTING.md) | Testing strategy (unit / E2E) |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and solutions |
| [PrimeVue documentation](https://primevue.org/) | UI component library (Aura theme) used by both SPAs |

## Disclaimer

This is a foundational reference application for building enterprise web apps on the Vue 3 + Encore.ts
stack. It has not undergone full integration testing or hardening for production deployment. Complete
identity provider integration and a security review before deploying to production.
