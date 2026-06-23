---
id: "010-dual-app-generator"
title: "Dual-app generator: two independent Encore apps (external + staff, both rauthy OIDC)"
status: approved
created: "2026-06-10"
owner: bart
kind: feature
domain: generator
risk: medium
implementation: complete
depends_on:
  - "005-spa-static-serving"
  - "008-encore-generator-core"
  - "009-user-management-module"
code_aliases: ["DUAL_APP_GENERATOR"]
summary: >
  setup-dual-app.ts generates two independent Encore applications from one
  invocation: <dest>/public (AUTH_DRIVER=rauthy, external-facing, apps/web)
  and <dest>/internal (AUTH_DRIVER=rauthy, staff-facing,
  apps/web-internal wired into the internal app's web service). Independent
  apps (separate encore.app files, databases, and deployments) are the
  locked isolation decision.
establishes:
  - "scripts/setup-dual-app.ts"
  - "scripts/setup-dual-app.test.ts"
---

# 010 — Dual-app generator: two independent Encore apps

## 1. Purpose

Some deployments require a hard trust-zone split between external-facing
access and staff-facing access. Both trust zones authenticate against the
rauthy OIDC provider, but as fully isolated applications. `setup-dual-app.ts`
generates both applications from a single invocation, each being a complete,
independent copy of the template base with its own auth driver configured.

The locked design decision is **two independent, standalone Encore apps**:
separate `encore.app` files, separate databases, separate deploy and scale
boundaries. The external app and staff app share no runtime.

## 2. Territory

This spec owns:

- `scripts/setup-dual-app.ts` — the dual-app generator
- `scripts/setup-dual-app.test.ts` — its test suite

The generator reuses `copyTemplateBase` and `setAuthDriver` from
`scripts/setup-app.ts` (spec 008). The staff-SPA static-serving wiring touches
`apps/web-internal/vite.config.ts` (spec 005 contract) within the generated
destination only — no template-source files are modified.

## 3. Behavior

### FR-001 — Output shape

`npx tsx scripts/setup-dual-app.ts --dest <d> [--yes] [--no-install] [--no-git]`
MUST produce:

```
<d>/
  public/     complete template base copy; AUTH_DRIVER=rauthy
  internal/   complete template base copy; AUTH_DRIVER=rauthy
```

Each subdirectory is a **complete, standalone Encore app** with its own
`apps/api/encore.app`, `apps/api/infra.config.json`, SPA(s), secrets, Gateway,
and `authHandler`. Neither variant renames or patches the template source
directories; the generator produces a fresh destination tree.

### FR-002 — Auth driver configuration

The generator MUST configure auth by setting the `AUTH_DRIVER` environment
variable in `.env.example` for each variant:

- `public` → `AUTH_DRIVER=rauthy`
- `internal` → `AUTH_DRIVER=rauthy`

Selection is configuration over the in-app drivers (spec 003). No driver files
are copied, moved, or deleted. The in-app `auth` service reads `AUTH_DRIVER`
at startup to activate the appropriate driver. The two variants differ by
trust zone and deployment, not by auth driver; both authenticate against the
rauthy OIDC provider.

### FR-003 — Staff-SPA static-serving wiring

The base template's `apps/web` SPA targets `build.outDir = ../api/web/build`
in its `vite.config.ts`, so the public bundle lands where the `web` service's
`api.static` declaration expects it (spec 005).

For the **internal** variant, the staff SPA (`apps/web-internal`) MUST be
wired into the same served location:

1. `apps/web-internal/vite.config.ts` in the generated destination gains
   `build.outDir = ../api/web/build` (with `emptyOutDir: true`), mirroring
   `apps/web`.
2. The internal app's root `build:apps` script MUST target `apps/web-internal`
   only, so the staff bundle is the one that lands in `apps/api/web/build`;
   the external SPA build is not wired into the internal variant.

The **public** variant needs no patch — the base already serves `apps/web`.

### FR-004 — Independent encore check

Each generated variant MUST pass `encore check` without modification. The
Encore backend of each variant is identical to the template base apart from
`AUTH_DRIVER`; no `apps/api/src/**` tree, no port
juggling, and no runtime module loader are present.

### FR-005 — Reuse of generator core

The dual-app generator MUST reuse `copyTemplateBase` and `setAuthDriver` from
`scripts/setup-app.ts` (spec 008) rather than duplicating their logic. Each
variant is produced by one invocation of the copy-base pipeline followed by
`setAuthDriver` with the variant's driver value.

### FR-006 — CLI interface

The generator accepts:

- `--dest <path>` (required) — destination root
- `--yes` — skip interactive confirmation prompts
- `--no-install` — skip `npm install` in the generated destinations
- `--no-git` — skip the per-variant `git init` (implied by `--no-install`)

When `--dest` already exists and `--yes` is not set, the generator MUST ask
for confirmation before overwriting. With `--yes` the generator proceeds
non-interactively (suitable for CI and test automation).

### FR-007 — Per-variant `git init` skipped for machine-driven runs

After generating both variants, `setup-dual-app` runs `git init` in each
(developer-UX only, best-effort, independent repos). Like the single-app
generator (spec 008, FR-014), this per-variant init MUST be skipped for
machine-driven runs: `--no-git` / `NO_GIT=true` and dry-run suppress it,
and `--no-install` / `NO_INSTALL=true` implies `--no-git`, so a
machine-driven dual run emits zero `.git` directories. The consuming
platform's prebuilt materialization owns VCS state, and a per-variant
commit-less repo inside the larger destination tree breaks its
`git add -A` ("does not have a commit checked out"). A fully-manual run
still initializes each variant as an independent repository.

## 4. Acceptance criteria

**AC-1.** `npx tsx scripts/setup-dual-app.ts --dest <d> --yes --no-install`
produces `<d>/public` and `<d>/internal`, each a standalone Encore app;
`cd <d>/public/apps/api && encore check` exits 0; neither directory contains
`apps/api/src` or any runtime module loader.

**AC-2.** `<d>/public/apps/api/.env.example` contains `AUTH_DRIVER=rauthy`;
`<d>/internal/apps/api/.env.example` contains `AUTH_DRIVER=rauthy`.

**AC-3.** `<d>/internal/apps/web-internal/vite.config.ts` sets
`build.outDir = ../api/web/build` and `<d>/internal/package.json`'s `build:apps`
script targets `apps/web-internal`.

**AC-4.** `npm test` (vitest against `scripts/setup-dual-app.test.ts`) is green.

**AC-5.** `npx spec-spine compile` exits 0; `npx spec-spine lint --fail-on-warn`
passes; `npx spec-spine index check` reports the index current; `npx spec-spine
couple --base origin/main` is clean.

## 5. Out of scope

- A shared-trust-zone single-app two-mount deployment (Option B) — the two
  independent apps design is locked; a shared-runtime single app is not built.
- Reconciling generator documentation (`orchestration/**`, `docs/DUAL-APP-GUIDE.md`)
  — spec 020.
- The Encore container CD path for the internal SPA — the `encore-cd.yml.example`
  container path bundles whatever is in `apps/api/web/build`; redirecting the
  internal SPA's vite `outDir` for the container path is a downstream step.
- The `web-app` input for SPA selection in the container deploy path: spec 012.
