# Corpus authoring brief — born-on-spec-spine rewrite

> Working brief for the 20 renumbered specs (000 is authored separately).
> Source material: the old corpus snapshot at `/tmp/te-old-specs/` (read-only).
> Targets: `specs/<new-id>/spec.md` in this repo. One file per spec dir.

## Frontmatter grammar (npm spec-spine 0.1.0 — exact)

Required: `id` (must equal dir name, `^[0-9]{3}-[a-z0-9-]+$`), `title`,
`status` (draft|approved|superseded|retired), `created` (YYYY-MM-DD),
`summary` (YAML `>` block).

Optional used here: `owner`, `authors`, `kind` (architecture|feature|governance),
`domain` (governance|app|generator|ci-cd|agentic|docs), `risk`
(low|medium|high|critical), `implementation` (pending|in-progress|complete|n-a|deferred),
`depends_on` ([spec ids]), `code_aliases` ([strings]).

Ownership edges:
- `establishes:` — bare list of units. `"path/file.ts"` = file;
  `"path/dir/"` (trailing slash) = directory subtree;
  `{ kind: section, file: "Makefile", anchor: "name" }` = section.
- `references:` — list of `{ unit: <unit>, role: "<why>" }`. Non-owning.
- `constrains:` — list of `{ unit: <unit>, note: "<invariant>", target_specs: [ids] }`.
- `depends_on`, `amends`, `supersedes` — bare id lists.

DO NOT use: `implements`, `slug`, `approved`, `completed`, `closed`,
`category`, `language`, `amended`, `amendment_record`, `compliance`, `shape`,
`extends`, `refines` (none of these belong in this corpus).

## Born-clean rules (mandatory)

1. Present tense. The spec describes how the subsystem works today. It was
   never "migrated", "ported", or "reconciled" — write as if the design was
   always this way.
2. FORBIDDEN words/refs anywhere in body or frontmatter: Express, migration,
   port(ed), reconcil*, "P1"–"P6", phase, parked, retire(d/ment), vendored,
   Rust, cargo, Cargo.toml, crates/, tools/spec-spine, tools/shared,
   tools/vendor, registry-consumer, spec-compiler, codebase-indexer,
   spec-code-coupling-check, "make registry", "spec-lint", old spec ids
   (any reference like "spec 048", "spec 058"). Cross-reference ONLY new ids.
3. Tool invocations in acceptance criteria use the npm CLI:
   `npx spec-spine compile` / `lint --fail-on-warn` / `index` / `index check` /
   `couple --base origin/main` / `registry list|show|status-report|relationships`.
   App checks use `npm test`, `npm run typecheck`, `encore check`, etc.
4. Body shape: `# NNN — Title`, then `## 1. Purpose`, `## 2. Territory`
   (what it owns and why those boundaries), `## 3. Behavior` (FR-01… with
   normative MUST/SHOULD), `## 4. Acceptance criteria` (AC-1…, runnable),
   `## 5. Out of scope`. Add extra subsections under 3 freely.
5. Preserve ALL durable design content from the sources: decisions tables,
   invariant catalogs, FR semantics, security contracts, endpoint shapes,
   profile definitions. Drop ONLY the historical narration. When a source FR
   says "migrate X to Y", the rewrite says "X is Y" with the same precision.
6. `created: "2026-06-10"`, `status: approved`, `implementation: complete`,
   `owner: bart` on every spec.
7. Frontmatter is given verbatim per spec below — use it exactly (you may
   refine `summary` wording only).

## New CI topology (write specs 011/013/014/017 against THIS design)

- `.github/workflows/spec-spine.yml` (owned by spec 000): single job
  `spec-spine` — checkout (fetch-depth 0), setup-node 22, `npm ci`,
  `npx spec-spine compile`, `npx spec-spine lint --fail-on-warn`,
  `npx spec-spine index check`, `npx spec-spine couple --base origin/main`
  (PR body exported for the `Spec-Drift-Waiver:` keyword).
- `ci.yml` (spec 013): inline-git-diff change routing (no third-party filter
  action, per spec 016); constitutional always-on gates = the spec-spine
  workflow + supply-chain; routed gates = encore CI (spec 011), AI review
  (spec 017); terminal `ci-gate` aggregator required by branch protection.
- `ci-supply-chain.yml` (spec 014): two jobs — `npm-audit` (root workspace +
  apps/api) and `workflow-pins` (runs tools/lint/workflow-pins.sh, spec 015);
  weekly Monday cron + PR trigger.
- Coupling-gate facts you may state: the gate's built-in bypass floor exempts
  `.github/`, `docs/`, `README.md`, CODEOWNERS, lockfiles, `.derived/`;
  waivers are PR-body `Spec-Drift-Waiver: <reason>`; stale index exits 2.

## Assignments

### 001-encore-app-architecture  ← source: /tmp/te-old-specs/048-*/spec.md

```yaml
---
id: "001-encore-app-architecture"
title: "Encore.ts application architecture: standalone apps/api and service decomposition"
status: approved
created: "2026-06-10"
owner: bart
kind: architecture
domain: app
risk: medium
implementation: complete
code_aliases: ["ENCORE_APP", "ENCORE_API_SCAFFOLD"]
summary: >
  The backend is a standalone Encore.ts application at apps/api —
  deliberately outside the npm workspace — decomposed into lib, db, health,
  auth, gateway, and web services. Locked decisions: stateless RS256 JWT,
  a single SQLDatabase("app"), /api/v1 path prefix, port 4000, global_cors,
  and `encore build docker --base` for container images.
establishes:
  - "apps/api/encore.app"
  - "apps/api/tsconfig.json"
  - "apps/api/infra.config.json"
  - "apps/api/vitest.config.ts"
  - "apps/api/Dockerfile.base"
  - "apps/api/Dockerfile.hotfix"
  - "apps/api/.env.example"
  - "apps/api/scripts/"
  - "apps/api/health/"
references:
  - { unit: { kind: file, path: "CODEMAP.md" }, role: "derived architecture view" }
---
```

Notes: drop the parked-Express thread entirely (FR-002/SC-002 of the source
never existed here). The service-decomposition table, locked-decisions table,
and staged-future-work sections carry over as current design.

### 002-security-data-invariants  ← source: 049

```yaml
---
id: "002-security-data-invariants"
title: "Security and data invariants: the API's non-negotiable guarantees (INV-1 - INV-11)"
status: approved
created: "2026-06-10"
owner: bart
kind: governance
domain: app
risk: high
implementation: complete
depends_on: ["001-encore-app-architecture"]
code_aliases: ["SECURITY_INVARIANTS", "INV_CATALOG"]
summary: >
  Eleven non-negotiable security and data guarantees (INV-1 - INV-11) that
  every build of the template enforces: role-scoped data access,
  parameterized SQL, httpOnly cookies, CSRF, security headers, rate
  limiting, RS256 JWT with refresh rotation, audit trail, multi-driver
  auth, the BFF proxy contract, and compliance metadata tags. apps/api/lib
  and apps/api/db are the enforcement substrate.
establishes:
  - "apps/api/lib/"
  - "apps/api/db/"
---
```

Notes: keep INV-1…INV-11 numbering (specs 003/004/009 cross-reference it).
Enforcement table shows FINAL state only (where each invariant is enforced:
file/service). INV-1's role-scoped *data endpoints* are an obligation of
applications built from the template — state that plainly. No "survived the
migration" framing: these are simply the template's guarantees.

### 003-multi-driver-auth-service  ← source: 050

```yaml
---
id: "003-multi-driver-auth-service"
title: "Multi-driver auth service: Encore authHandler/Gateway, mock/rauthy OIDC SSO, JWT issuance and refresh rotation"
status: approved
created: "2026-06-10"
owner: bart
kind: feature
domain: app
risk: high
implementation: complete
depends_on: ["001-encore-app-architecture", "002-security-data-invariants"]
code_aliases: ["AUTH_SERVICE", "AUTH_GATEWAY"]
summary: >
  The auth service: a dual-mode Encore authHandler (httpOnly session cookie
  + Bearer), a Gateway binding it, two SSO drivers (mock, rauthy OIDC)
  selected by AUTH_DRIVER, RS256 JWT issuance, refresh-token rotation and
  revocation, CSRF protection, rate limiting, and auth-event audit.
establishes:
  - "apps/api/auth/"
---
```

Notes: cite the INV numbers it enforces (INV-3/4/5/6/7/8/9) against spec 002.

### 004-bff-gateway-proxy  ← source: 051

```yaml
---
id: "004-bff-gateway-proxy"
title: "BFF gateway proxy: api.raw /api/v1/data/* to the private backend"
status: approved
created: "2026-06-10"
owner: bart
kind: feature
domain: app
risk: high
implementation: complete
depends_on: ["001-encore-app-architecture", "002-security-data-invariants", "003-multi-driver-auth-service"]
code_aliases: ["BFF_PROXY", "GATEWAY_SERVICE"]
summary: >
  The gateway service: an api.raw catch-all at /api/v1/data/* proxying to
  the private backend with an S2S OAuth client-credentials token cache,
  path-traversal sanitisation, 5xx masking, upstream timeout mapped to 504,
  and per-access audit (INV-10).
establishes:
  - "apps/api/gateway/"
---
```

### 005-spa-static-serving  ← sources: 053 + the web-internal resolution in 062

```yaml
---
id: "005-spa-static-serving"
title: "SPA static serving: Encore api.static serves the Vue bundles with history fallback"
status: approved
created: "2026-06-10"
owner: bart
kind: feature
domain: app
risk: low
implementation: complete
depends_on: ["001-encore-app-architecture"]
code_aliases: ["SPA_STATIC", "WEB_SERVICE"]
summary: >
  The web service serves the built Vue SPA via api.static at /!path over
  ./build with history-API fallback to index.html and no auth middleware
  (static assets must cache normally). apps/web builds into
  apps/api/web/build; in the dual-app layout the staff SPA
  (apps/web-internal) builds into the internal app's web service the same
  way.
establishes:
  - "apps/api/web/"
---
```

### 006-client-encore-integration  ← source: 052

```yaml
---
id: "006-client-encore-integration"
title: "Client Encore integration: SPA auth stores and the committed typed client"
status: approved
created: "2026-06-10"
owner: bart
kind: feature
domain: app
risk: medium
implementation: complete
depends_on: ["001-encore-app-architecture", "003-multi-driver-auth-service", "004-bff-gateway-proxy"]
code_aliases: ["CLIENT_ENCORE_INTEGRATION"]
summary: >
  Both Vue Pinia auth stores consume Encore-native response payloads
  directly (no envelope unwrapping), obtain the CSRF token from the
  endpoint body, and target the API on port 4000 via the Vite dev proxy. A
  generated typed Encore client is committed at
  apps/web/src/lib/encore-client.ts and kept fresh by the client-staleness
  CI job (spec 011).
establishes:
  - "apps/web/src/stores/auth.store.ts"
  - "apps/web-internal/src/stores/auth.store.ts"
  - "apps/web/src/lib/encore-client.ts"
---
```

### 007-module-manifest-schema  ← source: 059 (+ the four declarative modules from 063's outcome)

```yaml
---
id: "007-module-manifest-schema"
title: "Module manifest schema: declarative service composition and the module taxonomy"
status: approved
created: "2026-06-10"
owner: bart
kind: architecture
domain: generator
risk: medium
implementation: complete
depends_on: ["001-encore-app-architecture"]
code_aliases: ["MODULE_MANIFEST_SCHEMA", "MODULE_TAXONOMY"]
summary: >
  The module manifest schema: every module under modules/ declares its
  composition declaratively — services, secrets, corsEntries, middlewares,
  migrations — consumed by the generator at compose time. Service modules
  additionally ship an Encore service directory under files/. The four
  cross-cutting modules (security-core, api-gateway, data-postgres,
  data-redis) are pure declarative payloads with no copied source files.
establishes:
  - "scripts/lib/manifest.schema.ts"
  - "scripts/lib/modules-ts-generator.ts"
  - "modules/security-core/"
  - "modules/api-gateway/"
  - "modules/data-postgres/"
  - "modules/data-redis/"
---
```

Notes: describe schema v2 as THE schema (fields, validation, what consumes
it). The taxonomy table lists current modules and their type. No
"dropped/retired fields" narration.

### 008-encore-generator-core  ← sources: 060 (+ 058 for target-architecture background, 062's composer hardening)

```yaml
---
id: "008-encore-generator-core"
title: "Encore generator core: copy-base + select-driver + merge-config"
status: approved
created: "2026-06-10"
owner: bart
kind: architecture
domain: generator
risk: medium
implementation: complete
depends_on: ["001-encore-app-architecture", "003-multi-driver-auth-service", "005-spa-static-serving", "007-module-manifest-schema"]
code_aliases: ["ENCORE_GENERATOR_CORE"]
summary: >
  The app generator: setup-app.ts scaffolds a new application by copying
  the base Encore app, selecting an auth driver by configuration, composing
  selected service modules (directory copy + declarative merge via
  encore-composer.ts, including a JSONC-aware CORS merge), merging env
  templates, and regenerating the typed client. add-module.ts /
  remove-module.ts apply the same composition incrementally. Three profiles:
  minimal, public, internal.
establishes:
  - "scripts/setup-app.ts"
  - "scripts/add-module.ts"
  - "scripts/remove-module.ts"
  - "scripts/lib/env-merger.ts"
  - "scripts/lib/encore-composer.ts"
---
```

Notes: composer behaviors from the sources are current behavior: JSONC CORS
merge, decompose warning, empty-cors-key deletion. Compile-time composition
rationale (why composition happens at generate time, not runtime) carries
over as design rationale WITHOUT naming the predecessor model.

### 009-user-management-module  ← sources: 061 + 063's durable refinements (audit oldData) + 062's hardening (INV-8 audit, createRole guard, assignAppRoles validation)

```yaml
---
id: "009-user-management-module"
title: "User-management: the reference Encore service module"
status: approved
created: "2026-06-10"
owner: bart
kind: feature
domain: generator
risk: medium
implementation: complete
depends_on: ["002-security-data-invariants", "003-multi-driver-auth-service", "007-module-manifest-schema", "008-encore-generator-core"]
code_aliases: ["USER_MANAGEMENT_MODULE"]
summary: >
  The reference service module: a self-contained user-management Encore
  service with app_role/user_role tables, typed api() admin endpoints,
  tagged-template SQL model, role catalog, audit on every mutation
  (INV-8), and its own migration. Demonstrates the shape every feature
  module follows: manifest.json + files/<service-dir>.
establishes:
  - "modules/user-management/"
---
```

Notes: the role-model decision (app-managed role catalog vs IdP-sourced
token roles) carries over. Auth driver selection is configuration-only —
state as plain fact, not as a retirement.

### 010-dual-app-generator  ← source: 062

```yaml
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
depends_on: ["005-spa-static-serving", "008-encore-generator-core", "009-user-management-module"]
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
```

### 011-encore-ci-cd  ← source: 054

```yaml
---
id: "011-encore-ci-cd"
title: "Encore CI/CD: composite actions, CI workflow, CD example, typed-client staleness gate"
status: approved
created: "2026-06-10"
owner: bart
kind: governance
domain: ci-cd
risk: medium
implementation: complete
depends_on: ["001-encore-app-architecture", "005-spa-static-serving", "013-repo-ci-orchestrator"]
code_aliases: ["ENCORE_CI", "ENCORE_CD"]
summary: >
  Encore delivery plumbing: encore-install and encore-build composite
  actions, the reusable encore-ci.yml workflow (web type-check/build,
  encore check, typed-client staleness diff with volatile-prefix
  normalisation), and the inert encore-cd.yml.example deployment recipe.
  Encore CI is dispatched from ci.yml's encore route and required by
  ci-gate.
establishes:
  - ".github/actions/encore-install/action.yml"
  - ".github/actions/encore-build/action.yml"
  - ".github/workflows/encore-ci.yml"
  - ".github/workflows/encore-cd.yml.example"
---
```

### 012-azure-webapp-deploy  ← source: 057

```yaml
---
id: "012-azure-webapp-deploy"
title: "Container deploy: zip path for dev/uat/prod plus the container path example"
status: approved
created: "2026-06-10"
owner: bart
kind: governance
domain: ci-cd
risk: medium
implementation: complete
depends_on: ["011-encore-ci-cd", "015-workflow-pins-lint", "016-enterprise-actions-governance"]
code_aliases: ["DEPLOY_ZIP", "DEPLOY_ENCORE_CONTAINER"]
summary: >
  Two deployment paths for your container host: (1) the zip path, the
  compiled Encore artifact (main.mjs + runtime) deployed per environment by
  the dev/uat/prod workflows over a shared reusable workflow, started with
  `node main.mjs`; (2) the container path, kept as the inert
  encore-cd.yml.example with a container-deploy step. All third-party
  actions SHA-pinned and within the enterprise allow-list.
establishes:
  - ".github/workflows/deploy-reusable.yml"
  - ".github/workflows/deploy-dev.yml"
  - ".github/workflows/deploy-uat.yml"
  - ".github/workflows/deploy-prod.yml"
---
```

### 013-repo-ci-orchestrator  ← sources: 034 (+ 045's surviving ci.yml topology notes)

```yaml
---
id: "013-repo-ci-orchestrator"
title: "Repo CI orchestrator: ci.yml routing, dependabot, CODEOWNERS, PR template"
status: approved
created: "2026-06-10"
owner: bart
kind: governance
domain: ci-cd
risk: low
implementation: complete
depends_on: ["000-bootstrap", "014-supply-chain-gates", "016-enterprise-actions-governance"]
code_aliases: ["CI_ORCHESTRATOR"]
summary: >
  The root CI orchestrator: ci.yml computes change routes with inline git
  diff (no third-party filter action), always runs the constitutional gates
  (the spec-spine governance workflow and supply-chain), dispatches routed
  gates (Encore CI, AI review), and aggregates everything behind the
  terminal ci-gate job that branch protection requires. Dependabot covers
  npm and github-actions ecosystems; CODEOWNERS and the PR template route
  review.
establishes:
  - ".github/workflows/ci.yml"
  - ".github/dependabot.yml"
  - ".github/CODEOWNERS"
  - ".github/pull_request_template.md"
---
```

Notes: write against the NEW topology (see "New CI topology" above).
Dependabot FR enumerates npm surfaces (root workspace, apps/api) and
github-actions — no other ecosystems.

### 014-supply-chain-gates  ← source: 030 (npm + pins only)

```yaml
---
id: "014-supply-chain-gates"
title: "Supply-chain gates: npm audit and workflow-pin enforcement"
status: approved
created: "2026-06-10"
owner: bart
kind: governance
domain: ci-cd
risk: medium
implementation: complete
depends_on: ["015-workflow-pins-lint"]
code_aliases: ["SUPPLY_CHAIN"]
summary: >
  One workflow, two gates: npm audit over every npm surface (root workspace
  and the standalone apps/api) with a high-severity failure bar, and the
  workflow-pins lint (spec 015) over .github/**. Runs on every PR and on a
  weekly Monday cron so new advisories surface on quiet weeks.
establishes:
  - ".github/workflows/ci-supply-chain.yml"
---
```

### 015-workflow-pins-lint  ← source: 021

```yaml
---
id: "015-workflow-pins-lint"
title: "Workflow-ref SHA-pinning lint"
status: approved
created: "2026-06-10"
owner: bart
kind: governance
domain: ci-cd
risk: low
implementation: complete
code_aliases: ["WORKFLOW_PINS"]
summary: >
  Every `uses:` reference across .github/** must be pinned to a full commit
  SHA. tools/lint/workflow-pins.sh is the line-oriented lint (five
  classification rules, no allow-list — the only fix for a flagged ref is
  to pin it), workflow-pins-test.sh the fixture-backed regression runner.
  The gate runs in ci-supply-chain.yml and in the opt-in pre-commit hook.
establishes:
  - "tools/lint/workflow-pins.sh"
  - "tools/lint/workflow-pins-test.sh"
  - "tools/lint/tests/fixtures/passing/action.yml"
  - "tools/lint/tests/fixtures/failing/action.yml"
references:
  - { unit: { kind: file, path: ".githooks/pre-commit" }, role: "opt-in local enforcement point (owned by spec 000)" }
---
```

### 016-enterprise-actions-governance  ← source: 047

```yaml
---
id: "016-enterprise-actions-governance"
title: "Enterprise Actions governance: the GitHub Actions allow-list, inline change-routing, and the merge queue"
status: approved
created: "2026-06-10"
owner: bart
kind: governance
domain: ci-cd
risk: low
implementation: complete
depends_on: ["015-workflow-pins-lint"]
code_aliases: ["ACTIONS_ALLOWLIST"]
summary: >
  The enterprise (EMU) constraint set for GitHub Actions: only
  allow-listed publishers may execute, so workflows route changes with
  inline git diff instead of third-party filter actions; every permitted
  third-party ref is SHA-pinned; the merge_group trigger ships inert until
  a repo admin enables the merge queue.
constrains:
  - unit: { kind: file, path: ".github/workflows/" }
    note: "every `uses:` ref must be an allow-listed publisher and SHA-pinned; no third-party change-filter actions"
    target_specs: ["011-encore-ci-cd", "012-azure-webapp-deploy", "013-repo-ci-orchestrator", "014-supply-chain-gates", "017-ai-pr-review"]
---
```

### 017-ai-pr-review  ← source: 046

```yaml
---
id: "017-ai-pr-review"
title: "AI PR review folded into ci-gate"
status: approved
created: "2026-06-10"
owner: bart
kind: governance
domain: ci-cd
risk: low
implementation: complete
depends_on: ["013-repo-ci-orchestrator", "016-enterprise-actions-governance"]
code_aliases: ["AI_PR_REVIEW"]
summary: >
  An App-free Claude review of every PR, dispatched from ci.yml and
  required by ci-gate: subscription OAuth token, pinned CLI version, diff
  over stdin, no ANTHROPIC_API_KEY, no exit-code swallowing, and a visible
  skip comment when the diff exceeds the size budget.
establishes:
  - ".github/workflows/ai-pr-review.yml"
---
```

### 018-claude-skills  ← sources: 026 + 035 (merged)

```yaml
---
id: "018-claude-skills"
title: "Claude Code skills and agents: the agentic surface"
status: approved
created: "2026-06-10"
owner: bart
kind: governance
domain: agentic
risk: low
implementation: complete
depends_on: ["000-bootstrap", "019-claude-config-governance"]
code_aliases: ["CLAUDE_SKILLS"]
summary: >
  The agentic surface: seven skills under .claude/skills/ (init, setup,
  commit, implement-plan, research, validate-and-fix, cleanup), four
  pipeline agents under .claude/agents/ (architect, explorer, implementer,
  reviewer), and the frontmatter schemas that govern their shape. Skills
  perform all governed reads through the spec-spine CLI; the whole surface
  is a hashed index input, so quiet edits trip the staleness gate.
establishes:
  - ".claude/skills/"
  - ".claude/agents/"
  - "standards/schemas/frontmatter/agent-frontmatter.schema.json"
  - "standards/schemas/frontmatter/skill-frontmatter.schema.json"
---
```

Notes: describe each skill in one or two sentences against its CURRENT
contract: setup = `npm install` + verify `npx spec-spine --version` +
compile/index; init = governed session bootstrap reading AGENTS.md and
querying `npx spec-spine registry status-report`; validate-and-fix/cleanup
operate over the npm/TypeScript surface (no Rust targets).

### 019-claude-config-governance  ← source: 027

```yaml
---
id: "019-claude-config-governance"
title: "Claude Code shared config governance: .mcp.json and .claude/settings.json as hashed inputs"
status: approved
created: "2026-06-10"
owner: bart
kind: governance
domain: agentic
risk: low
implementation: complete
depends_on: ["000-bootstrap"]
code_aliases: ["CLAUDE_CONFIG"]
summary: >
  Team-shared agentic configuration — .mcp.json (MCP servers) and
  .claude/settings.json (permissions, hooks) — is governed content: both
  files are hashed index inputs via spec-spine.toml's [index]
  extra_hashed_inputs, so a quiet edit to either is visible as index
  staleness on the PR. Files are edited in place, never reformatted (hook
  bodies are whitespace-sensitive shell strings).
establishes:
  - ".mcp.json"
  - ".claude/settings.json"
---
```

### 020-architecture-doc-governance  ← sources: 055 (+ 063's doc outcomes)

```yaml
---
id: "020-architecture-doc-governance"
title: "Architecture documentation governance: human docs as derived views of the owning specs"
status: approved
created: "2026-06-10"
owner: bart
kind: governance
domain: docs
risk: low
implementation: complete
depends_on: ["001-encore-app-architecture", "008-encore-generator-core"]
code_aliases: ["DOC_GOVERNANCE"]
summary: >
  Human-facing architecture documentation is a derived view of the owning
  specs: CODEMAP.md, the orchestration/ guides, and the codemap/readme
  generators are mechanically coupled (an edit requires touching this
  spec); docs/ and README.md sit inside the coupling gate's built-in bypass
  floor, so their fidelity is enforced editorially — each doc names the
  spec(s) it derives from, and a doc change that contradicts an owning spec
  is a review-blocking defect.
establishes:
  - "CODEMAP.md"
  - "orchestration/"
  - "scripts/codemaps/"
  - "scripts/readmes/"
references:
  - { unit: { kind: file, path: "docs/" }, role: "governed editorially; mechanically exempt via the gate's bypass floor" }
---
```

Notes: doc tier table (which doc derives from which spec, using NEW ids)
carries over, retargeted.
