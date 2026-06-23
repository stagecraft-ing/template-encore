# Migration: vendored spec-spine → npm `spec-spine@0.1.0`

> Audit trail for the `chore/spec-spine-npm-migration` branch. This document
> records the full 54-spec classification, the renumbering map, and every
> mechanical change, so the receiving side can reauthor or verify any decision.
> The mandate: the template must read as if it was **born on the npm
> spec-spine** — no vendored-Rust archaeology, no Express-migration
> archaeology in the living corpus. This file is the one deliberate exception
> (it is the provenance record for the rewrite itself).

## What changed, in one paragraph

The vendored Rust toolchain (`tools/spec-spine/*`, `tools/shared/*`,
`tools/vendor/*`, `crates/*`, root Cargo workspace) is deleted; governance is
now provided by the published npm package `spec-spine@0.1.0` (prebuilt
binaries, no Rust toolchain required). The spec corpus is collapsed from 54
specs (schema 2.2.0, vendored compiler) to 21 specs (schema 0.1.0, npm CLI):
toolchain specs leave with the toolchain (the spec-spine repo owns them now),
framework specs are replaced by `spec-spine init` scaffolds, migration-
narrative specs are merged into the durable subject specs they produced, and
survivors are renumbered contiguously and rewritten in present tense.

## Classification of all 54 specs

Evidence: per-spec `implementingPaths` from the committed
`.derived/codebase-index/index.json` at branch point `d6d2e01`, plus full-body
reads of every merge candidate.

### Tier B — DELETE (toolchain; the spec-spine repo owns these now) — 23

| Old spec | Why |
|---|---|
| 001-spec-compiler-mvp | vendored compiler impl |
| 002-registry-consumer-mvp | vendored consumer impl |
| 003-feature-lifecycle-mvp | compiler/consumer lifecycle semantics |
| 004-conformance-lint-mvp | vendored lint impl |
| 005-registry-consumer-contract | vendored consumer contract |
| 006-codebase-index-mvp | vendored indexer impl |
| 007-substrate-template-spec-layout | layout rule folded into new 000 §layout |
| 009-spec-code-coupling-gate | vendored gate impl; gate survives as `spec-spine couple` |
| 010-spec-lint-default-fail-on-warn | lint posture now CLI flag (`--fail-on-warn` in CI) |
| 011-spec-coupling-primary-owner | gate semantics, owned by spec-spine repo |
| 013-constitutional-invariant-freeze | registry-schema freeze, owned by spec-spine repo |
| 014-amends-aware-coupling-gate | gate semantics, owned by spec-spine repo |
| 015-spec-kind-grammar | grammar, owned by spec-spine repo |
| 016-path-co-authority | grammar, owned by spec-spine repo |
| 017-invariant-freeze-additive-evolution | freeze semantics, owned by spec-spine repo |
| 018-logical-unit-ownership-grammar | grammar, owned by spec-spine repo |
| 019-logical-unit-resolution-semantics | grammar, owned by spec-spine repo |
| 020-references-edge-provenance-grammar | grammar, owned by spec-spine repo |
| 022-v004-lint-fixture-exemption | vendored lint detail |
| 023-amends-aware-section-satisfaction-parity | gate semantics |
| 024-domain-frontmatter-field | grammar, owned by spec-spine repo |
| 025-registry-consumer-unit-grammar-authority | consumer semantics |
| 056-registry-consumer-domain-enum-reconciliation | consumer semantics |

Deleted with them: `tools/spec-spine/`, `tools/shared/`, `tools/vendor/`,
`crates/`, root `Cargo.toml`/`Cargo.lock`/`rust-toolchain.toml`, `deny.toml`
(cargo-deny policy with no remaining Rust surface),
`standards/schemas/spec-spine/*.schema.json` (registry/index schemas now ship
inside the tool).

### Framework — REPLACED by `spec-spine init` — 5

| Old spec | Replacement |
|---|---|
| 000-bootstrap-spec-system | new `specs/000-bootstrap` (init scaffold, customized) |
| 008-init-protocol-governed-reads | init's `.claude/rules/governed-artifact-reads.md` + rewritten `AGENTS.md`; adoption-level narrative folded into new 000 |
| 012-adversarial-prompt-refusal-policy | init's `.claude/rules/adversarial-prompt-refusal.md`; narrative folded into new 000 |
| 038-init-protocol-binary-invocation-paths | obsolete — binary comes from `node_modules/.bin` via npm |
| 039-substrate-bin-strategy | obsolete — same |

### Migration narrative — MERGED into durable subject specs — 5

| Old spec | Merged into (new id) |
|---|---|
| 058-generator-module-encore-reconciliation | 008-encore-generator-core (background only) |
| 063-generator-docs-encore-reconciliation | 009-user-management-module (the durable refinements) + 020-architecture-doc-governance |
| 064-retire-express-packages-tooling | nothing survives — retired paths are simply absent |
| 065-post-058-cleanup | nothing survives — final states live in the governed paths |
| 045-substrate-workspace-ci | 013-repo-ci-orchestrator (residual ci.yml topology); `ci-crates.yml` deleted with the Rust workspace |

### Survivors — RENUMBERED + rewritten born-clean — 20 new specs

| New spec | Source old spec(s) | Owns (establishes) |
|---|---|---|
| 000-bootstrap | init scaffold + 000/007/008/009/010/012/038/039 adoption narrative | `spec-spine.toml`, `standards/spec/**`, `.claude/rules/{orchestrator-rules,governed-artifact-reads,adversarial-prompt-refusal}.md`, `.github/workflows/spec-spine.yml`, Makefile spec targets, `.githooks/pre-commit` |
| 001-encore-app-architecture | 048 | `apps/api/encore.app`, tsconfig, infra.config, vitest config, Dockerfiles, `.env.example`, `apps/api/scripts/`, `apps/api/health/` |
| 002-security-data-invariants | 049 | `apps/api/lib/`, `apps/api/db/` (+ INV-1..11 catalog) |
| 003-multi-driver-auth-service | 050 | `apps/api/auth/` |
| 004-bff-gateway-proxy | 051 | `apps/api/gateway/` |
| 005-spa-static-serving | 053 (+ 062's resolution of the dual-app deferral) | `apps/api/web/` |
| 006-client-encore-integration | 052 | `apps/web/src/stores/auth.store.ts`, `apps/web-internal/src/stores/auth.store.ts`, committed typed client |
| 007-module-manifest-schema | 059 (+ 063's declarative-module outcomes) | `scripts/lib/manifest.schema.ts`, `scripts/lib/modules-ts-generator.ts`, `modules/{security-core,api-gateway,data-postgres,data-redis}/` |
| 008-encore-generator-core | 060 + 058 | `scripts/setup-app.ts`, `scripts/add-module.ts`, `scripts/remove-module.ts`, `scripts/lib/env-merger.ts`, `scripts/lib/encore-composer.ts` |
| 009-user-management-module | 061 + 063 (durable threads) | `modules/user-management/**` |
| 010-dual-app-generator | 062 | `scripts/setup-dual-app.ts`, `scripts/setup-dual-app.test.ts` |
| 011-encore-ci-cd | 054 | `.github/actions/encore-{install,build}/action.yml`, `encore-ci.yml`, `encore-cd.yml.example` |
| 012-azure-webapp-deploy | 057 | the four `deploy-*.yml` workflows |
| 013-repo-ci-orchestrator | 034 + 045 residue | `ci.yml`, `dependabot.yml`, `CODEOWNERS`, `pull_request_template.md` |
| 014-supply-chain-gates | 030 (cargo-deny removed) | `.github/workflows/ci-supply-chain.yml` |
| 015-workflow-pins-lint | 021 | `tools/lint/**` |
| 016-enterprise-actions-governance | 047 | (constraint/process spec; references ci.yml) |
| 017-ai-pr-review | 046 | `.github/workflows/ai-pr-review.yml` |
| 018-claude-skills | 026 + 035 | `.claude/skills/`, `.claude/agents/`, the two frontmatter schemas |
| 019-claude-config-governance | 027 | `.mcp.json`, `.claude/settings.json` (hashed via `[index] extra_hashed_inputs`) |
| 020-architecture-doc-governance | 055 + 063 doc threads | `CODEMAP.md`, `orchestration/`, `scripts/codemaps/`, `scripts/readmes/` (docs/ + README recorded as references — the npm gate's bypass floor exempts `docs/` and `README.md` by design) |

## Born-clean rewrite rules (applied to every survivor)

1. Present tense; the spec describes how the subsystem works, not how it came
   to be. Express-era and vendored-toolchain-era narration is dropped.
2. Frontmatter uses only the npm spec-spine grammar (`id`, `title`, `status`,
   `created`, `summary`, `owner`, `kind`, `domain`, `risk`, `implementation`,
   `depends_on`, `code_aliases` + typed edges). Old-grammar fields (`slug`,
   `approved`, `completed`, `category`, `language`, `amended`,
   `amendment_record`, `compliance`, `shape`) are dropped.
3. `status: approved`, `implementation: complete` on every spec except where
   genuinely open; `created` set to the migration date (the corpus is new).
4. Inter-spec `depends_on`/`amends` pointers retarget to new ids; amendment
   chains that only narrate the old migration collapse into final state.
5. Acceptance criteria invoking old tools (`cargo test`, `make registry`,
   `registry-consumer …`, `spec-lint --fail-on-warn`) are rewritten to the npm
   CLI (`npx spec-spine compile|lint|index|couple|registry …`).
6. Every `establishes:` path must exist on disk (the indexer fails closed on
   I-004 otherwise).

## Mechanical changes outside specs/

- **Workflows**: delete `spec-conformance.yml`, `ci-codebase-index.yml`,
  `ci-spec-code-coupling.yml`, `ci-crates.yml`; add `spec-spine.yml`
  (one job: `npm ci` → `npx spec-spine compile` → `lint --fail-on-warn` →
  `index check` → `couple --base origin/main`); rewrite `ci.yml` routing
  (constitutional gates collapse to the one spec-spine job);
  `ci-supply-chain.yml` drops the cargo-deny job, keeps npm-audit +
  workflow-pins.
- **dependabot.yml**: drop all 8 cargo manifest entries; keep npm + actions.
- **CODEOWNERS**: drop `/tools/spec-spine/` route.
- **Makefile**: all cargo targets removed; spec targets become thin
  `npx spec-spine …` wrappers.
- **`.githooks/pre-commit`**: `npx spec-spine index check` + workflow-pins.
- **`.claude/settings.json` hooks**: vendored binary invocations → npm CLI.
- **`.claude/skills/*`**: setup (npm install, not cargo build), init
  (governed reads via `npx spec-spine registry …`), validate-and-fix +
  cleanup (new Makefile surface, no crates/).
- **AGENTS.md / CLAUDE.md**: governance sections rewritten to the npm
  invocation surface.
- **`docs/spec-spine-in-detail.md`**: rewritten as a concise guide to the
  npm CLI in this template.
- **`spec-spine.toml`**: `[index] extra_hashed_inputs` gains `.claude/**`,
  `.mcp.json`, `.githooks/**`, `tools/lint/**` (preserves old specs 026/027's
  hashed-input contract under the new tool).
- **package.json (root)**: `spec-spine@0.1.0` devDependency; per-package
  `"spec-spine": { "spec": "NNN-slug" }` ownership keys.
- **`.derived/`**: old 2.2.0 artifacts deleted; regenerated at schema 0.1.0
  by the npm CLI; `build-meta.json` stays gitignored.
- **`.gitignore`**: `.env.github` added (untracked token file must never be
  committable).

## Out of scope, preserved untouched

- Pre-existing uncommitted edits to `apps/api/package.json` /
  `package-lock.json` (not ours; left out of every commit).
- The Encore application, generator, modules, SPAs, deploy workflows —
  behavior-identical; only their governing specs are rewritten.

## Verification gates (all must pass before push)

1. `npx spec-spine compile` — registry builds, validation passes
2. `npx spec-spine lint --fail-on-warn` — zero warnings
3. `npx spec-spine index` then `npx spec-spine index check` — fresh
4. `npx spec-spine couple --base origin/main` — green (this branch edits
   every owning spec alongside its code, so the gate must be satisfiable;
   any residual is waived in the PR body with rationale)
5. `npm test` / app build — Encore app unaffected
