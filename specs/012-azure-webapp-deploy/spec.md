---
id: "012-azure-webapp-deploy"
title: "Azure Web App deploy: zip path for dev/uat/prod plus the container path example"
status: approved
created: "2026-06-10"
owner: bart
kind: governance
domain: ci-cd
risk: medium
implementation: complete
depends_on:
  - "011-encore-ci-cd"
  - "015-workflow-pins-lint"
  - "016-enterprise-actions-governance"
code_aliases: ["DEPLOY_AZURE_ZIP", "DEPLOY_ENCORE_CONTAINER"]
summary: >
  Two deployment paths for Azure App Service: (1) the zip path — the
  compiled Encore artifact (main.mjs + runtime) deployed per environment by
  the dev/uat/prod workflows over a shared reusable workflow, started with
  `node main.mjs`; (2) the container path, kept as the inert
  encore-cd.yml.example with an Azure Container Apps step. All third-party
  actions SHA-pinned and within the enterprise allow-list.
establishes:
  - ".github/workflows/deploy-azure-webapp-reusable.yml"
  - ".github/workflows/deploy-azure-webapp-dev.yml"
  - ".github/workflows/deploy-azure-webapp-uat.yml"
  - ".github/workflows/deploy-azure-webapp-prod.yml"
---

# 012 — Azure Web App deploy: zip path for dev/uat/prod plus the container path example

## 1. Purpose

This spec governs the template's two deployment paths for the Encore backend
on Azure:

1. **Azure App Service zip** — the compiled Encore artifact packaged as a
   deployment zip and started with `node main.mjs`. This path uses the familiar
   Azure App Service for Linux model and is the active, environment-gated deploy
   route for dev, uat, and production.

2. **Encore container** — `encore build docker` produces an OCI image. This
   path stays the inert `encore-cd.yml.example` (spec 011) with a documented
   Azure Container Apps deploy step. It becomes active when a downstream project
   provisions a registry and secrets and renames the file.

Neither path uses the legacy entrypoint (`dist/server.js`). The Encore
artifact (`main.mjs`) is the sole backend entrypoint.

## 2. Territory

This spec owns the four reusable and environment-specific deploy workflows
listed under `establishes`. The `encore-cd.yml.example` (the container path
template) is owned by spec 011; this spec references it.

All four active workflows pin every third-party `uses:` to a full 40-hex SHA
(spec 015) and use only allow-listed publishers (spec 016).

## 3. Behavior

### FR-001 — Zip artifact composition

The `build` job in `deploy-azure-webapp-reusable.yml` (running on
`ubuntu-latest`, GitHub-hosted) MUST produce an `app.zip` containing:

- `main.mjs` — the compiled Encore artifact (scraped from the Encore build)
- `encore-runtime.node` — the `linux/amd64` native addon from the Encore build
- `web/build/` — the built public SPA (`apps/api/web/build`)
- `node_modules/` — pruned to production dependencies
- `package.json`
- `scripts/migrate.mjs` — the standalone Encore schema runner
- `db/migrations/` — SQL schema files

The Encore artifact MUST be produced by the cancel-then-scrape method (start
`encore build docker`, scrape `.encore/build/combined/combined/main.mjs` and
the cached `linux/amd64` `encore-runtime.node`) on the GitHub-hosted builder.
The artifact is uploaded as a build artifact for consumption by the deploy job.

### FR-002 — Build/deploy split

The reusable workflow MUST separate build from deploy:

- **`build`** (`ubuntu-latest`, GitHub-hosted): all heavy work — `npm ci`,
  `build:packages`, build the selected SPA, install the Encore CLI via
  `.github/actions/encore-install`, `npm ci` in `apps/api`, scrape the Encore
  artifact, prune `node_modules`, assemble `app.zip`, upload artifact.
- **`deploy`** (`${{ inputs.runner }}`, self-hosted, environment-scoped):
  download `app.zip`, `azure/login`, run schema updates (`node scripts/migrate.mjs`,
  reading `DATABASE_URL`), set App Service app settings, `azure/webapps-deploy`
  with `startup-command: 'node main.mjs'`.

The self-hosted runner performs only what requires the deployment's network and identity:
Azure login and deploy. Docker and the Encore build never run on the
self-hosted runner.

### FR-003 — Schema application

Schema updates on the zip deploy path MUST run the standalone Encore schema
runner: `apps/api/scripts/migrate.mjs` reading `DATABASE_URL`. The root
`scripts/migrate.ts` is not used by the Encore deploy path.

### FR-004 — Reusable workflow inputs

`deploy-azure-webapp-reusable.yml` accepts:

| Input | Default | Description |
|-------|---------|-------------|
| `environment` | (required) | GitHub environment name |
| `node-version` | `24.x` | Node.js version |
| `web-app` | `web` | Selects the SPA to build; the public `apps/web` vite `outDir` targets `apps/api/web/build` directly; any other SPA's `dist` is copied into that location |
| `runner` | `self-hosted` | Self-hosted runner label for the deploy job |

The `app.zip` includes the SPA selected by `web-app`. The Encore app is the
fixed, standalone `apps/api`.

### FR-005 — Environment-specific callers

`deploy-azure-webapp-{dev,uat,prod}.yml` are thin callers of the reusable
workflow, one per GitHub environment. Their trigger shapes:

- `dev` — `workflow_dispatch` + push to `develop` branch
- `uat` — `workflow_dispatch` + push to `uat` branch
- `prod` — `workflow_dispatch` only

Each caller passes only `environment`; the `node-version`, `web-app`, and
`runner` inputs use their defaults unless a project overrides them.

### FR-006 — SHA-pinning and the allow-list

Every third-party `uses:` in the active deploy workflows MUST be pinned to a
full 40-hex SHA (spec 015) and MUST use only allow-listed publishers (spec 016:
`actions/*`, `github/*`, `azure/*`, `aquasecurity/trivy-action`). The path-local
`encore-install` composite action is exempt from the pin requirement.

Current pins:

| Action | SHA | Tag |
|--------|-----|-----|
| `actions/checkout` | `df4cb1c069e1874edd31b4311f1884172cec0e10` | v6.0.3 |
| `actions/setup-node` | `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` | v6.4.0 |
| `actions/upload-artifact` | `ea165f8d65b6e75b540449e92b4886f43607fa02` | v4 |
| `actions/download-artifact` | `d3f86a106a0bac45b974a628896c90dbdf5c8093` | v4 |
| `aquasecurity/trivy-action` | `ed142fd0673e97e23eac54620cfb913e5ce36c25` | v0.36.0 |
| `github/codeql-action/upload-sarif` | `8aad20d150bbac5944a9f9d289da16a4b0d87c1e` | v4 |
| `azure/login` | `532459ea530d8321f2fb9bb10d1e0bcf23869a43` | v3.0.0 |
| `azure/webapps-deploy` | `02a81bead70021f5284939794bcec79c271ab383` | v3 |

### FR-007 — Container path (inert)

The Encore container path stays the inert `encore-cd.yml.example` (owned by
spec 011). This spec records that the example carries a documented Azure
Container Apps deploy step (`az containerapp update --image ...`) as a
commented template. The example is not active and is not scanned by the
workflow-pins lint. Activating it requires renaming to `.yml`, provisioning
a registry and secrets, and SHA-pinning every `uses:` (spec 015).

### FR-008 — Security gate

The reusable workflow includes a `security` job running
`aquasecurity/trivy-action` (container image scan) and uploading SARIF results
via `github/codeql-action/upload-sarif`. This job MUST complete before the
deploy job starts.

## 4. Acceptance criteria

**AC-1.** `npx spec-spine lint --fail-on-warn` (via the supply-chain workflow,
spec 014) passes over all four active deploy workflows: every `uses:` is
SHA-pinned.

**AC-2.** All four deploy workflows parse as valid YAML. `npx spec-spine compile`
exits 0; `npx spec-spine index check` reports the index current (workflow files
are hashed inputs); `npx spec-spine couple --base origin/main` is clean.

**AC-3.** `encore-cd.yml.example` is absent from the workflow-pins lint scan
(the lint scans `*.yml`/`*.yaml` only).

**AC-4.** On a `linux/amd64` host with Docker and the Encore CLI available, the
cancel-then-scrape build produces `main.mjs` + `encore-runtime.node` and
`node main.mjs` serves `/health`. (Operator-verifiable step; not run in CI —
there is no Azure target in CI and the native binary cannot boot on the Windows
authoring host.)

**AC-5.** A deploy round-trip to a provisioned non-production Azure App Service
environment confirms `node main.mjs` starts cleanly and the health endpoint
responds. (First-deploy verification against a non-prod environment.)

## 5. Out of scope

- CD activation for the container path — `encore-cd.yml.example` stays inert
  until a downstream project provisions a registry, renames the file, and
  SHA-pins its `uses:`.
- Azure Container Apps as an active workflow — the example step is documented,
  not wired.
- Encore Cloud, OpenShift, and App Service for Containers — noted in
  `docs/DEPLOYMENT.md` but not given dedicated workflows.
- Internal SPA (`apps/web-internal`) in the container path — the container
  bundles whatever is in `apps/api/web/build` at build time; redirecting the
  internal SPA's vite `outDir` for the container is a downstream step.
- The `encore-cd.yml.example` file itself — owned by spec 011.
