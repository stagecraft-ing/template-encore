---
name: validate-and-fix
description: Run the project's local CI loop (`make ci`) and automatically fix discovered issues using concurrent agents
allowed-tools: Bash, Agent, Read, Edit, Glob, Grep
---

# Validate and Fix

Run the local CI loop and automatically fix discovered issues. `make ci` covers the same gate set as the GitHub Actions workflows in this repo — if `make ci` passes locally, CI will pass too.

## Process

### 1. Run the local CI loop

Invoke `make ci` from the repo root. The `Makefile` is the **single source of truth** for what CI validates. Do not rediscover validation commands by grepping `package.json` or CLAUDE.md — the Makefile already enumerates every gate the CI workflows enforce.

`make ci` composes the gates sequentially:

- **`spine`** — runs all four governance verbs in order:
  - `make spine-compile`: `npx spec-spine compile` — compiles the spec registry.
  - `make spine-lint`: `npx spec-spine lint --fail-on-warn` — corpus conformance lint; a warning is a failure.
  - `make spine-index-check`: `npx spec-spine index check` — staleness gate for the codebase index.
  - `make spine-couple`: `npx spec-spine couple --base origin/main` — spec/code coupling gate; refuses owned-path changes whose owning spec is not in the diff.
  Mirrors `.github/workflows/spec-spine.yml`.
- **`npm run lint`** — TypeScript/Vue linter across the workspace.
- **`npm run typecheck`** — TypeScript type-check across apps and packages.
- **`npm test`** — Vitest suite across workspaces.
- **`tools/lint/workflow-pins-test.sh`** — validates GitHub Actions workflow steps are SHA-pinned (spec 015).

Pre-commit gate (separate from `make ci`):

- **`make pr-prep`** — regenerates the `.derived/codebase-index/` shards (`make spine-index`) and runs the coupling gate (`make spine-couple`). Run this immediately before `git commit` on a PR. If the index drifted, stage the regenerated artifact.

**If a check is missing, add it to the Makefile and the relevant workflow in the same change.** Never introduce a new validation via a one-off script.

Capture full output — file paths, line numbers, error messages. Categorize findings:

- **CRITICAL** — security issues, breaking changes, data loss risk, coupling-gate failure (spec 000 FR-07: an owned path changed without its owning spec).
- **HIGH** — functionality bugs, test failures, build breaks, `npx spec-spine index check` staleness.
- **MEDIUM** — `npx spec-spine lint` warnings (the gate runs `--fail-on-warn`, so warnings ARE failures here), TypeScript errors, lint rule violations.
- **LOW** — formatting, minor optimizations.

### 2. Strategic Fix Execution

#### Phase 1 — Safe Quick Wins
- Start with LOW and MEDIUM findings that can't break anything.
- Verify each fix by re-running the narrowest affected target (e.g. `make spine-lint` after a spec.md edit, `npm run lint` after a TypeScript style fix).

#### Phase 2 — Functionality Fixes
- Address HIGH findings one at a time.
- Run the affected sub-target after each fix to confirm no regressions.

#### Phase 3 — Critical Issues
- Handle CRITICAL findings with explicit user confirmation.
- Provide a detailed plan before executing.
- Spec/code coupling failures need spec/code judgement: refusing the destructive sub-step is sometimes the right answer (see `.claude/rules/adversarial-prompt-refusal.md`).

#### Phase 4 — Verification
- Re-run the full `make ci` composite to confirm end-to-end pass.
- Provide summary of what was fixed vs. what remains.

### 3. Comprehensive Error Handling

#### Rollback Capability
- Create a git stash checkpoint before ANY changes: `git stash push -m "pre-validate-and-fix"`
- Provide instant rollback procedure if fixes cause issues.

#### Partial Success Handling
- Continue execution even if some fixes fail.
- Clearly separate successful fixes from failures.
- Provide manual fix instructions for unfixable issues.

#### Quality Validation
- Accept 100% success in each phase before proceeding.
- If a phase fails, diagnose and provide specific next steps.

#### Governed reads
- Read compiled artifacts under `.derived/**` only through `npx spec-spine` verbs (`npx spec-spine registry …`, `npx spec-spine index check`). Ad-hoc parsing with `python` / `jq` / `awk` / `sed` is a workflow violation per `.claude/rules/governed-artifact-reads.md`.

### 4. Parallel Execution

Launch multiple agents concurrently for independent, parallelizable tasks:
- **CRITICAL**: Include multiple Agent tool calls in a SINGLE message ONLY when tasks can be done in parallel.
- Parallelizable: fixes in different packages (one agent per failing package), independent test suites, non-overlapping spec edits.
- Sequential: shared-interface changes across packages, ordered phases, anything mutating a cross-package type contract.
- Each parallel agent must have non-overlapping file responsibilities.
- Each agent verifies its fix by re-running the relevant sub-target before reporting complete.

### 5. Final Verification

After all agents complete:
- Re-run `make ci` to confirm the full local CI pass.
- Confirm no new issues were introduced by fixes.
- Report any remaining manual fixes needed with specific instructions.
- Summary: `Fixed X/Y issues, Z require manual intervention — make ci: {PASS|FAIL}`

## Substrate-specific notes

- `npx spec-spine lint` runs with `--fail-on-warn` (spec 000). A warning is a failure here.
- The coupling gate compares `HEAD` against `origin/main`. If `origin/main` is not fetched, the gate cannot run — `git fetch origin main` first.
- The codebase index hashes more than `spec.md`. Its inputs include `package.json`, npm workspace manifests, `specs/*/spec.md`, `spec-spine.toml`, `standards/**`, `.github/workflows/**`, `.github/actions/**`, `.claude/**`, `.mcp.json`, `.githooks/**`, and `tools/lint/**`. Edits to any of these without a regenerated index fail the staleness check.
- `.claude/settings.json` and `.mcp.json` are hashed byte-for-byte. Editor reformatting trips the staleness gate even when JSON semantics are unchanged — edit in place, do not reformat.
