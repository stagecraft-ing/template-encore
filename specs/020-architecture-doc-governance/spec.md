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

# 020 — Architecture documentation governance: human docs as derived views of the owning specs

## 1. Purpose

Human-authored architecture documentation is accurate when it is a faithful
derived view of the owning specs and inaccurate when it drifts from them. This
spec declares the governance contract that keeps every documentation surface
in this repository from drifting, using two complementary enforcement
mechanisms — mechanical coupling for root-level surfaces, editorial governance
for the `docs/` tree — matched to what each surface's path geometry makes
possible.

## 2. Territory

This spec owns `CODEMAP.md`, `orchestration/`, `scripts/codemaps/`, and
`scripts/readmes/`. These paths are within the coupling gate's claimed surface,
so a change to any of them without a corresponding touch to this spec causes
`npx spec-spine couple --base origin/main` to exit non-zero.

`docs/` and `README.md` sit inside the coupling gate's **built-in bypass
floor**. The gate exempts these paths by design; they are not and cannot be
mechanically coupled. Their governance is therefore editorial: each document
names the spec(s) it derives from, and a change that contradicts an owning
spec is a review-blocking defect adjudicated by human reviewers.

## 3. Behavior

### 3.1 Mechanically coupled surfaces

**FR-01**: `CODEMAP.md` MUST be kept current with the Encore service
decomposition defined by spec `001-encore-app-architecture`. It MUST describe
the six services (`lib`, `db`, `health`, `auth`, `gateway`, `web`), the
`SQLDatabase("app")`, port 4000, and the generator script layout. Any change
to the service layout in spec `001-encore-app-architecture` MUST be reflected
in `CODEMAP.md` in the same diff.

**FR-02**: `orchestration/` contains the template orchestrator guide and the
the per-step skill bodies. These documents MUST describe the Encore compile-time
service-composition model (copy-base + select auth driver + compose modules +
merge config). They MUST NOT describe any runtime-registry, middleware-chain,
or dynamic loader model. The generator pipeline described by spec
`008-encore-generator-core` is the normative source; a change to the pipeline
MUST be reflected in the affected orchestration documents in the same diff.

**FR-03**: `scripts/codemaps/` and `scripts/readmes/` contain per-profile
generated codemaps and readme templates. They MUST reflect the current Encore
service graph and the two-app dual model (spec `010-dual-app-generator`). A
change to the profile structure MUST be reflected in these directories in the
same diff.

**FR-04**: Because `CODEMAP.md`, `orchestration/`, `scripts/codemaps/`, and
`scripts/readmes/` are all `establishes` paths of this spec, the coupling gate
requires any PR that edits these surfaces to also touch this spec. This is the
mechanical lock against silent drift.

### 3.2 Editorially governed surfaces

**FR-05**: Each document in `docs/` MUST name the spec(s) it derives from,
either in a header comment or in an introductory sentence. Example: "This
document is a derived view of spec `001-encore-app-architecture`."

**FR-06**: A change to `docs/` that contradicts a statement in the named
owning spec is a **review-blocking defect**. Reviewers MUST reject such a
change and request that the owning spec be updated first (if the spec is
wrong) or that the doc change be corrected (if the doc is wrong).

**FR-07**: `README.md` is editorially governed under the same contract.
Changes to `README.md` that contradict spec `001-encore-app-architecture` or
spec `008-encore-generator-core` are review-blocking defects.

**FR-08**: The editorial governance contract applies to the following `docs/`
documents and their owning specs:

| Document | Owning spec(s) |
|----------|----------------|
| `docs/DEVELOPMENT.md` | `001-encore-app-architecture`, `003-multi-driver-auth-service` |
| `docs/AUTH-SETUP.md` | `003-multi-driver-auth-service` |
| `docs/DEPLOYMENT.md` | `011-encore-ci-cd`, `012-azure-webapp-deploy` |
| `docs/TROUBLESHOOTING.md` | `001-encore-app-architecture`, `003-multi-driver-auth-service` |
| `docs/TESTING.md` | `001-encore-app-architecture` |
| `docs/TEMPLATE-USER-GUIDE.md` | `008-encore-generator-core`, `007-module-manifest-schema` |
| `docs/MODULARIZATION-OVERVIEW.md` | `007-module-manifest-schema`, `008-encore-generator-core` |
| `docs/MODULARIZATION-SPEC.md` | `007-module-manifest-schema` |
| `docs/MODULE-DEVELOPMENT-GUIDE.md` | `007-module-manifest-schema`, `009-user-management-module` |
| `docs/DUAL-APP-GUIDE.md` | `010-dual-app-generator` |
| `docs/encore-ts/` | `001-encore-app-architecture` (provenance: these documents describe paths in the source substrate, not this template's `apps/api`; read as decision-record, not as a description of this tree) |
| `README.md` | `001-encore-app-architecture`, `008-encore-generator-core` |

### 3.3 Coupling gate geometry

The coupling gate's built-in bypass floor exempts `.github/`, `docs/`,
`README.md`, `CODEOWNERS`, lockfiles, and `.derived/`. This is a deliberate
design choice in the gate's implementation, not a gap in this spec's
governance. The editorial contract in FR-05 through FR-08 is the governance
instrument for these paths; it is enforced by reviewers, not by the gate.

The mechanically coupled paths (`CODEMAP.md`, `orchestration/`,
`scripts/codemaps/`, `scripts/readmes/`) are above the bypass floor and are
fully gate-coupled. The split between the two mechanisms is an architectural
fact, not a limitation to be closed.

## 4. Acceptance criteria

- **AC-1:** `CODEMAP.md` exists and describes the Encore service decomposition
  matching spec `001-encore-app-architecture`: six services, `SQLDatabase("app")`,
  port 4000, and the generator script layout.
- **AC-2:** Every file in `orchestration/` describes the Encore compile-time
  composition model. A search for runtime-session or dynamic-registry keywords
  across `orchestration/` returns zero matches.
- **AC-3:** `npx spec-spine couple --base origin/main` exits 0 when
  `CODEMAP.md`, `orchestration/`, `scripts/codemaps/`, and `scripts/readmes/`
  change only in a diff that also touches this spec.
- **AC-4:** At least one document in `docs/` names its owning spec in its
  header or introduction.
- **AC-5:** `npx spec-spine compile` and `npx spec-spine lint --fail-on-warn`
  exit 0 with this spec present.

## 5. Out of scope

- Governing module payload templates under `modules/**/files/` — those paths
  are governed by their owning module specs (e.g., spec `009-user-management-module`).
- Governing `standards/` documents — those are owned by the spec that
  introduces each standard.
- Automated enforcement of the editorial contract. The FR-05 through FR-08
  rules are enforced by human reviewers during code review. Automated linting
  of `docs/` content against spec claims is future work.
- Governing inline code comments that reference architecture decisions —
  those are governed by the code-owning spec, not by this spec.
