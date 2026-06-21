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

# 018 — Claude Code skills and agents: the agentic surface

## 1. Purpose

The agentic surface of this template is the set of Claude Code skills and
pipeline agents that automate governed development workflows. Seven skills
under `.claude/skills/` and four agents under `.claude/agents/` form the
primary interaction layer for humans and automated pipelines alike. Their
shape is governed by two JSON Schema files. Because `.claude/**` is listed
in `spec-spine.toml`'s `[index] extra_hashed_inputs`, any quiet edit to a
skill or agent body is visible as index staleness on the next PR.

## 2. Territory

This spec owns the `.claude/skills/` and `.claude/agents/` directory trees
and the two frontmatter schema files under `standards/schemas/frontmatter/`.
The shared config files consumed by skills at runtime (`.mcp.json` and
`.claude/settings.json`) are owned by spec `019-claude-config-governance`.
The AGENTS.md cross-agent protocol body at the repo root is outside this
spec's territory; it is a vendor-neutral AAIF standard read by any coding
agent that opens this repository.

## 3. Behavior

### 3.1 Skill surface

**FR-01**: Seven skills MUST exist under `.claude/skills/`, each as a
`<name>/SKILL.md` file:

| Skill | Contract |
|-------|----------|
| `init` | Thin dispatcher: reads AGENTS.md § New Sessions and executes the cross-agent session-init protocol declared there. MUST NOT inline the protocol body; `wc -l .claude/skills/init/SKILL.md` MUST return fewer than 30 lines. |
| `setup` | Runs `npm install` for the root workspace, verifies `npx spec-spine --version`, then runs `npx spec-spine compile` and `npx spec-spine index` to confirm the spec-spine toolchain is functional. |
| `commit` | Prepares a governed commit: stages changes, runs the pre-commit checks, generates a conventional commit message, and confirms with the user before executing. |
| `implement-plan` | Generic plan-file executor: reads a plan document, executes each step in order with checkpoint confirmations, and writes a structured completion report. |
| `research` | Parallel-research orchestrator: dispatches concurrent sub-agent reads via the Task tool, collects results into a filesystem artifact, and surfaces a structured findings report. |
| `validate-and-fix` | Operates on the npm/TypeScript surface: runs `npm test`, `npm run typecheck`, `encore check`, and `npx spec-spine couple --base origin/main` in sequence, surfaces every failure, and iterates fixes until the suite is green or a human decision is required. |
| `cleanup` | Dead-code and dependency hygiene over the npm/TypeScript surface: detects unused exports, stale dependencies, and duplicate code across `apps/web`, `apps/web-internal`, `apps/api`, and `packages/`; degrades gracefully when optional detectors (`knip`, `jscpd`) are absent. |

**FR-02**: Skills MUST perform all governed reads through the spec-spine CLI.
Direct parsing of `.derived/**/*.json` with `jq`, `python`, `awk`, or similar
is forbidden within a skill body. The correct pattern is
`npx spec-spine registry status-report`, `npx spec-spine registry list`,
`npx spec-spine index check`, etc.

**FR-03**: The `init` skill MUST reference `AGENTS.md` by name so the
dispatch relationship is explicit. `grep -F "AGENTS.md" .claude/skills/init/SKILL.md`
MUST return at least one match.

### 3.2 Agent surface

**FR-04**: Four pipeline agents MUST exist under `.claude/agents/`, each as a
`<name>.md` file:

| Agent | Role |
|-------|------|
| `architect` | Designs solutions and produces structured plan documents consumed by the `implement-plan` skill. |
| `explorer` | Reads and summarises repository structure, spec coverage, and test surfaces without making changes. |
| `implementer` | Applies a plan produced by the architect agent, making minimal, correct code changes and verifying each step. |
| `reviewer` | Reviews changes for spec fidelity, security invariant compliance, and coupling-gate cleanliness. |

**FR-05**: Agent bodies MUST declare their role, input contract, output
contract, and any tool restrictions in their frontmatter or opening section.

### 3.3 Frontmatter schemas

**FR-06**: Two JSON Schema files govern the shape of skill and agent frontmatter:

- `standards/schemas/frontmatter/skill-frontmatter.schema.json` — required
  fields for `SKILL.md` files: `name` (must match the directory name),
  `description`, `version`.
- `standards/schemas/frontmatter/agent-frontmatter.schema.json` — required
  fields for agent markdown files: `name`, `description`, `role`.

**FR-07**: These schemas are inputs to `npx spec-spine lint`; a skill or agent
with invalid frontmatter MUST cause `npx spec-spine lint --fail-on-warn` to
exit non-zero.

### 3.4 Staleness gate

**FR-08**: `.claude/skills/` and `.claude/agents/` are enumerated in
`spec-spine.toml`'s `[index] extra_hashed_inputs` via the `.claude/**` glob.
Any edit to a skill or agent body MUST be accompanied by regenerated
`.derived/codebase-index/` index shards committed in the same diff, or
`npx spec-spine index check` will exit non-zero and the staleness gate will
block the PR.

## 4. Acceptance criteria

- **AC-1:** `ls .claude/skills/` lists exactly the seven skill directories:
  `init`, `setup`, `commit`, `implement-plan`, `research`, `validate-and-fix`,
  `cleanup`. Each contains a `SKILL.md`.
- **AC-2:** `ls .claude/agents/` lists exactly the four agent files:
  `architect.md`, `explorer.md`, `implementer.md`, `reviewer.md`.
- **AC-3:** `wc -l .claude/skills/init/SKILL.md` returns a count under 30.
  `grep -F "AGENTS.md" .claude/skills/init/SKILL.md` returns at least one match.
- **AC-4:** `grep -rEl "jq |python3? " .claude/skills/ | xargs -r grep -l ".derived/"`
  returns zero matches (no skill parses `.derived/**` ad hoc; the spec-spine
  CLI is the only governed-read surface).
- **AC-5:** `npx spec-spine compile` exits 0 with the schemas present.
- **AC-6:** `npx spec-spine index check` exits 0 (index current with respect
  to the `.claude/**` inputs).
- **AC-7:** `npx spec-spine couple --base origin/main` exits 0 with this spec
  and all four skill/agent directory additions in the same diff.

## 5. Out of scope

- **AGENTS.md** — the cross-agent session-init protocol body. Owned by
  spec `000-bootstrap`; the `init` skill is a thin dispatcher that reads it,
  not a duplicate of it.
- **`.claude/rules/`** — governed by spec `000-bootstrap` as part of the
  bootstrap scaffold.
- **`.claude/settings.json` and `.mcp.json`** — owned by spec
  `019-claude-config-governance`.
- **Adding new skills beyond the seven** — each addition is a change to the
  agentic surface and requires touching this spec.
- **User-scope skill files** (`~/.claude/skills/`) — outside the project surface
  and not governed by this spec.
