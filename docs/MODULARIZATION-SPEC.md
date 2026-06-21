# Modularization Specification

Complete technical specification for the Encore compile-time service-composition module system. A coding agent can use this document to reproduce the full modularization infrastructure from scratch.

---

## 1. Overview

The module system turns the Encore.ts template into a composable factory. A catalog (`modules/`) holds domain feature modules and thin declarative overlays. Install/remove CLI scripts (`scripts/add-module.ts`, `scripts/remove-module.ts`) compose or decompose them against a generated app's `apps/api` directory. A state file (`template.json`) tracks what is installed.

Composition is **compile-time and filesystem-based**: Encore discovers services from `encore.service.ts` files. There is no runtime middleware registry, no `app.use` ordering, and no generated `registerAllModules` loader. Module installation copies an Encore service directory and merges declarative config; module removal reverses those operations exactly.

### Design Principles

1. **Base app is the floor**: the base Encore skeleton is a complete deployable app; modules only add
2. **Compile-time composition**: services discovered from `encore.service.ts` at build time; no runtime registry
3. **Declarative config merge**: `encore.app` `global_cors`, `infra.config.json` secrets, `.env.example` are the merge targets; no code generation for backend wiring
4. **Reversible**: every compose operation is fully reversed by decompose using recorded state
5. **File ownership**: `template.json` prevents two modules from overwriting each other's files
6. **Frontend nav wiring**: the only generated file is `apps/web/src/modules.ts` (Vue nav registration); the backend has no equivalent

---

## 2. Directory Layout

```
<project-root>/
  modules/                          Module catalog
    <module-name>/
      manifest.json                 Module declaration (schema v2)
      web.snippet.ts                Optional: frontend nav registration code
      files/                        Source files
        <service-name>/             Encore service directory (domain features)
          encore.service.ts
          api-file.ts
          model.ts
          types.ts
        db/                         Migration files (renumbered on compose)
          1_<name>.up.sql
        apps/web/src/views/         SPA view files (frontend modules)
          ...

  scripts/
    setup-app.ts                    Single-app generator (copy-base + profile)
    setup-dual-app.ts               Dual-app generator (two independent Encore apps)
    add-module.ts                   Compose a module into a generated app
    remove-module.ts                Decompose a module from a generated app
    validate-modules.ts             CI integrity check
    lib/
      manifest.schema.ts            Zod schema v2 for manifest.json
      template-json.ts              Read/write template.json state
      encore-composer.ts            Compose/decompose Encore service dirs + config merges
      modules-ts-generator.ts       Regenerate apps/web/src/modules.ts (frontend only)
      env-merger.ts                 Merge/comment-out env vars in .env.example

  template.json                     Module installation state
  apps/api/
    encore.app                      Encore app manifest (global_cors managed by composer)
    infra.config.json               Secret + SQL bindings (secrets managed by composer)
    db/migrations/                  All migrations (base + module-contributed, renumbered)
    <service>/                      Encore service directories (base + module-contributed)
      encore.service.ts
      ...
  apps/web/src/
    modules.ts                      AUTO-GENERATED: frontend nav wiring; do not edit
```

---

## 3. State File: template.json

Tracks installed modules, file ownership, and composed migration filenames. Validated by Zod on load.

### Schema

```typescript
import { z } from 'zod'

const moduleEntrySchema = z.object({
  version: z.string(),
  installedAt: z.string().optional(),          // ISO date (YYYY-MM-DD)
  alwaysOn: z.boolean().optional(),             // true = cannot be removed
  composedMigrations: z.array(z.string()).optional(),
  // exact renumbered migration filenames added by composeModule;
  // decomposeModule deletes precisely these (never a sibling's file)
})

const templateJsonSchema = z.object({
  templateName: z.string().default('template-encore'),
  baseVersion: z.string().default('3.0.0'),
  description: z.string().optional(),
  modules: z.record(z.string(), moduleEntrySchema).default({}),
  fileOwnership: z.record(z.string(), z.string()).default({}),
  // Key = file path relative to repo root; Value = module name that owns the file
})

type TemplateJson = z.infer<typeof templateJsonSchema>
```

### Example

```json
{
  "templateName": "template-encore",
  "baseVersion": "4.0.0",
  "modules": {
    "user-management": {
      "version": "2.0.0",
      "installedAt": "2026-06-08",
      "composedMigrations": ["5_user_management.up.sql"]
    }
  },
  "fileOwnership": {
    "apps/web/src/views/admin/UserListView.vue": "user-management",
    "apps/web/src/views/admin/UserDetailView.vue": "user-management"
  }
}
```

### Utility Functions

```typescript
function loadTemplateJson(projectRoot: string): TemplateJson
function saveTemplateJson(projectRoot: string, data: TemplateJson): void
function isModuleInstalled(state: TemplateJson, moduleName: string): boolean
function getInstalledModules(state: TemplateJson): string[]    // excludes alwaysOn
function getAllModules(state: TemplateJson): string[]           // includes alwaysOn
function addModuleToState(state, name, version, files): TemplateJson
function removeModuleFromState(state, name): TemplateJson
function getFileOwner(state: TemplateJson, filePath: string): string | null
```

---

## 4. Module Manifest Schema v2

Each module has `modules/<name>/manifest.json`. Validated by Zod on load (`scripts/lib/manifest.schema.ts`).

### Full Schema

```typescript
import { z } from 'zod'

const secretSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  required: z.boolean().default(true),
})

const corsEntrySchema = z.object({
  field: z.enum([
    'allow_headers', 'expose_headers',
    'allow_origins_with_credentials', 'allow_origins_without_credentials',
  ]),
  values: z.array(z.string()),
})

const migrationSchema = z.object({
  source: z.string(),      // path relative to module's files/ root (e.g. "db/1_init.up.sql")
  description: z.string().optional(),
})

const envVarSchema = z.object({
  value: z.string().optional(),
  required: z.boolean(),
  description: z.string(),
  sensitive: z.boolean().optional(),
})

const manifestSchema = z.object({
  // Identity
  name: z.string().min(1),
  version: z.string().default('1.0.0'),
  description: z.string(),
  status: z.enum(['stable', 'planned']).default('stable'),

  // Dependency rules
  requires: z.array(z.string()).default([]),          // all must be present (auto-installed)
  requiresOneOf: z.array(z.array(z.string())).default([]),  // at least one per group
  optionalPeers: z.array(z.string()).default([]),     // shown as suggestions after install
  conflicts: z.array(z.string()).default([]),         // auto-removed on install

  // Frontend file mappings (modules/<name>/files/<src> -> project <dest>)
  files: z.record(z.string(), z.string()).default({}),

  // Auth package re-exports (legacy; empty in v2 modules since auth-barrel is retired)
  authExports: z.array(z.string()).default([]),

  // --- Encore service-composition contract (v2) ---
  services: z.array(z.string()).default([]),
  // Encore service directory names the module contributes.
  // Each is copied from modules/<name>/files/<service>/ to apps/api/<service>/.
  // Encore discovers it at compile time (encore.service.ts).

  secrets: z.array(secretSchema).default([]),
  // Encore secret() names bound in apps/api/infra.config.json ($env references).
  // No secret values are ever written.

  corsEntries: z.array(corsEntrySchema).default([]),
  // Additions to apps/api/encore.app global_cors (JSONC-aware, comment-preserving).

  middlewares: z.array(z.string()).default([]),
  // Documentary: which lib middleware factories the contributed service composes.
  // Not used for code generation; the service's own encore.service.ts declares them.

  migrations: z.array(migrationSchema).default([]),
  // Migration files merged into apps/api/db/migrations/ with deterministic renumbering.
  // The next free <n>_ prefix is assigned; the exact filename is recorded in composedMigrations.

  // npm dependencies
  packageDeps: z.record(z.string(), z.record(z.string(), z.string())).default({}),

  // Non-secret environment variables
  envVars: z.record(z.string(), envVarSchema).default({}),

  // Frontend nav registration snippet
  webSnippetFile: z.string().optional(),

  // Root package.json workspace changes
  workspaceChanges: z.object({
    add: z.array(z.string()).optional(),
    remove: z.array(z.string()).optional(),
  }).optional(),
})

type ModuleManifest = z.infer<typeof manifestSchema>
```

**Removed from schema v2** (Express runtime-registry fields; no Encore analog):
- `apiRegistrations`: the ordered Express `app.use` / route registry
- `authDriverRegistration`: the runtime priority-sorted driver registry
- `sideEffectImports`: provider registration via import side effects

### Example: Domain Feature Module (user-management)

```json
{
  "name": "user-management",
  "version": "2.0.0",
  "description": "App-managed user + role CRUD as an Encore service (spec 061)",
  "status": "stable",
  "requires": [],
  "conflicts": [],
  "services": ["user-management"],
  "migrations": [
    { "source": "db/1_user_management.up.sql", "description": "app_role + user_role tables" }
  ],
  "secrets": [],
  "corsEntries": [],
  "middlewares": ["securityHeaders", "csrfMiddleware", "apiRateLimit"],
  "files": {
    "apps/web/src/views/admin/UserListView.vue": "apps/web/src/views/admin/UserListView.vue",
    "apps/web/src/views/admin/UserDetailView.vue": "apps/web/src/views/admin/UserDetailView.vue"
  },
  "authExports": [],
  "webSnippetFile": "web.snippet.ts",
  "packageDeps": {},
  "envVars": {
    "USER_MGMT_DEFAULT_ROLE": {
      "value": "user",
      "required": false,
      "description": "Default app-managed role for new users"
    }
  }
}
```

### Example: Thin Declarative Overlay (api-gateway)

```json
{
  "name": "api-gateway",
  "version": "2.0.0",
  "description": "BFF gateway declarative overlay: secret bindings + connectivity test view",
  "status": "stable",
  "requires": [],
  "conflicts": [],
  "services": [],
  "migrations": [],
  "secrets": [
    { "name": "GATEWAY_OAUTH_CLIENT_ID",     "description": "OAuth client ID for S2S token" },
    { "name": "GATEWAY_OAUTH_CLIENT_SECRET", "description": "OAuth client secret" },
    { "name": "GATEWAY_OAUTH_TOKEN_URL",     "description": "Token endpoint URL" }
  ],
  "corsEntries": [],
  "middlewares": [],
  "files": {
    "apps/web/src/views/ConnectivityTestView.vue": "apps/web/src/views/ConnectivityTestView.vue"
  },
  "authExports": [],
  "webSnippetFile": "web.snippet.ts",
  "packageDeps": {},
  "envVars": {
    "PRIVATE_API_BASE_URL": {
      "required": true,
      "description": "Base URL of the private backend the gateway proxies to"
    },
    "GATEWAY_TIMEOUT_MS": {
      "value": "30000",
      "required": false,
      "description": "Gateway proxy timeout in milliseconds"
    }
  }
}
```

---

## 5. Encore Composition Engine (scripts/lib/encore-composer.ts)

The composition engine (`composeModule` / `decomposeModule`) carries all filesystem and config-merge I/O. It is split into pure functions (no I/O, unit-testable) and thin I/O wrappers.

### Pure functions

```typescript
// Migration renumbering
function nextMigrationPrefix(existingFilenames: string[]): number
// Returns max existing <n>_ prefix + 1 (or 1 when none).

function renumberMigration(filename: string, prefix: number): string
// e.g. renumberMigration('1_init.up.sql', 5) -> '5_init.up.sql'

// Secret merge
function mergeSecrets(
  current: Record<string, { $env: string }>,
  secrets: { name: string }[],
): Record<string, { $env: string }>
// Idempotent: adds { name: { $env: name } } for each missing secret.

function removeSecrets(
  current: Record<string, { $env: string }>,
  names: string[],
): Record<string, { $env: string }>

// CORS merge
function mergeCors(
  current: Record<string, string[]>,
  entries: { field: string; values: string[] }[],
): Record<string, string[]>
// Appends values to each named global_cors field (deduplicated, order-preserving).

function removeCors(
  current: Record<string, string[]>,
  entries: { field: string; values: string[] }[],
): Record<string, string[]>
```

### Path-traversal guards

```typescript
function assertSafeServiceName(service: string): void
// Throws if `service` is not a single safe path segment
// (prevents "../../etc" escapes when --with accepts third-party modules).

function assertWithinBase(baseDir: string, targetPath: string): void
// Throws unless targetPath resolves within baseDir.
```

### composeModule

```typescript
function composeModule(opts: {
  moduleDir: string   // path to modules/<name>/
  manifest: ModuleManifest
  apiDir: string      // path to apps/api/ in the destination
}): { migrationsAdded: string[]; secretsAdded: string[] }
```

Steps:

1. **Service directories**: for each `manifest.services[]`, copies `<moduleDir>/files/<service>/` to `<apiDir>/<service>/`. Validates each service name with `assertSafeServiceName`.
2. **Migrations**: for each `manifest.migrations[]`, asserts the source is within `files/`, renumbers to the next free prefix, copies to `<apiDir>/db/migrations/<n>_<basename>.up.sql`. Returns the exact filenames added as `migrationsAdded`.
3. **Secrets**: merges `manifest.secrets[]` into `<apiDir>/infra.config.json` as `{ name: { $env: name } }` (no secret values written). Returns newly added names as `secretsAdded`.
4. **CORS**: merges `manifest.corsEntries[]` into `<apiDir>/encore.app` `global_cors`. The read/write is JSONC-aware (`jsonc-parser`): reads with `parse` (comment-tolerant), writes with `modify` + `applyEdits` so all `//` comments and unrelated formatting are preserved. Only the specific fields a module contributes are rewritten.

### decomposeModule

```typescript
function decomposeModule(opts: {
  moduleDir: string
  manifest: ModuleManifest
  apiDir: string
  composedMigrations?: string[]  // recorded from composeModule's migrationsAdded
}): void
```

Reverses each compose step:

1. Deletes `<apiDir>/<service>/` for each `manifest.services[]`
2. Deletes exactly the filenames listed in `composedMigrations` from `<apiDir>/db/migrations/`. If `composedMigrations` is absent but `manifest.migrations` is non-empty, warns loudly (does not silently orphan files or use a heuristic that could delete a sibling module's migration)
3. Removes the module's secret names from `infra.config.json`
4. Removes the module's CORS values from `encore.app` (JSONC-aware); deletes a field that becomes empty after removal rather than leaving `"field": []`

---

## 6. Auto-Generated Files

### 6a. Frontend web modules.ts

File: `scripts/lib/modules-ts-generator.ts`

**`generateWebModulesTs(projectRoot, state)`** regenerates `apps/web/src/modules.ts` (Vue nav registration). It is the only auto-generated file in the Encore module system.

Algorithm:
1. Emit `import { registerNavItem } from './composables/useNavigation'`
2. Emit base nav items (Home, About)
3. For each installed module with a `webSnippetFile`: read the snippet from `modules/<name>/<webSnippetFile>`, extract import lines (deduplicated), extract non-import body lines
4. Returns `null` if no modules with snippets are installed (caller deletes the file)

**There is no `generateApiModulesTs` function.** The Express backend loader that emitted `registerAllModules(app: Express)` was retired in spec 059. There is no `apps/api/src/modules.ts` and no equivalent generated file in the Encore backend.

### 6b. Env-var merger

File: `scripts/lib/env-merger.ts`

**`mergeEnvVars(projectRoot, manifest)`**: appends new `envVars` entries to `apps/api/.env.example` under a `# --- <module-name> ---` section header. Skips keys that already exist.

**`commentOutEnvVars(projectRoot, manifest)`**: comments out the module's env var lines on removal.

Non-secret env vars live in `.env.example`. Secret material is bound in `infra.config.json` (`$env` references) via the composer, never in `.env.example`. The env merger does not duplicate the `infra.config.json` path.

---

## 7. Orchestrator: add-module.ts

**CLI**: `npx tsx scripts/add-module.ts <module-name> [--yes] [--list] [--dry-run] [--no-install] [--root <path>]`

### Installation Flow

```
1.  Load manifest from modules/<name>/manifest.json (Zod v2 parse)
2.  Validate status === 'stable'
3.  Load template.json state
4.  Check if already installed (warn, allow re-install)
5.  Check conflicts; auto-remove conflicting modules:
      - Delete owned files (from state.fileOwnership)
      - Remove from template.json
      - Remove packageDeps, comment out envVars, reverse workspaceChanges
6.  Check requires; auto-install each missing dependency recursively
7.  Check requiresOneOf; at least one from each group must be present
8.  Pre-check file destinations (conflict / untracked / re-install logic)
9.  Show summary; prompt for confirmation (unless --yes)
10. Copy files (manifest.files: src -> dest)
11. Update template.json (add module entry + file ownership)
12. Compose Encore services (composeModule):
      - Copy services[] directories to apps/api/<service>/
      - Merge migrations[] (renumbered) into apps/api/db/migrations/
      - Merge secrets[] into apps/api/infra.config.json
      - Merge corsEntries[] into apps/api/encore.app
      - Record migrationsAdded in state.modules[name].composedMigrations
13. Regenerate apps/web/src/modules.ts (generateWebModulesTs)
14. Merge envVars into .env.example
15. Apply workspaceChanges to root package.json
16. Add packageDeps to relevant package.json files
17. Run npm install
```

Note: there is no step to regenerate `apps/api/src/modules.ts` or `packages/auth/src/index.ts`. Those Express-era generated files do not exist in the Encore model.

### --root flag

`--root <path>` points `PROJECT_ROOT` (the destination app) to a different directory than `MODULES_ROOT` (the template with the module catalog). This allows the orchestrator to be invoked from the template cache while targeting a generated app.

---

## 8. Orchestrator: remove-module.ts

**CLI**: `npx tsx scripts/remove-module.ts <module-name> [--yes] [--dry-run] [--no-install] [--root <path>]`

### Removal Flow

```
1.  Load template.json state
2.  Check module is installed
3.  Check not alwaysOn
4.  Load manifest
5.  Check reverse dependencies:
      - For each other installed module:
        - If it has this module in requires -> BLOCK
        - If it has a requiresOneOf group containing this module and no alternative is installed -> BLOCK
6.  Collect owned files from state.fileOwnership
7.  Show summary; prompt for confirmation (unless --yes)
8.  Delete owned files
9.  Clean empty parent directories
10. Decompose Encore services (decomposeModule):
      - Delete service dirs
      - Delete composed migrations (exact filenames from state.modules[name].composedMigrations)
      - Remove secret bindings from infra.config.json
      - Remove CORS entries from encore.app
11. Update template.json (remove module + file ownership entries)
12. Regenerate apps/web/src/modules.ts (or delete it if no snippets remain)
13. Comment out envVars in .env.example
14. Reverse workspaceChanges in root package.json
15. Remove packageDeps from relevant package.json files
16. Run npm install
```

---

## 9. Orchestrator: validate-modules.ts

**CLI**: `npx tsx scripts/validate-modules.ts`

Exits with code 1 if any check fails. Designed for CI.

### Checks Performed

1. **template.json validity**: loads and validates against the Zod schema
2. **Module catalog manifests**: every `modules/<dir>/manifest.json` is valid against schema v2; `name` matches the directory; all source files in `files/` and `services[]` source directories exist; `webSnippetFile` exists if declared
3. **File ownership**: every file in `state.fileOwnership` exists on disk; its owner module is installed
4. **Dependencies**: for every installed module: all `requires` are installed; at least one from each `requiresOneOf` group; no `conflicts` co-installed
5. **Generated files match**: `apps/web/src/modules.ts` matches `generateWebModulesTs()` output

---

## 10. Module Taxonomy

The 13 original Express modules have been reduced to 5 remaining modules with clear Encore dispositions:

| Module | Encore disposition | Backend function |
|--------|-------------------|-----------------|
| `user-management` | Self-contained Encore service directory | Owned by the module (app_role, user_role tables; admin endpoints) |
| `security-core` | Thin declarative overlay | Already in `apps/api/lib` (security headers, rate-limit, csrf, logger) |
| `api-gateway` | Thin declarative overlay | Already in `apps/api/gateway` (spec 051); module contributes secrets + ConnectivityTestView |
| `data-postgres` | Thin declarative overlay | Already in `apps/api/db` (`SQLDatabase("app")`); module documents env knobs |
| `data-redis` | Thin declarative overlay | Rate-limit backend only (`REDIS_URL` in `lib/rate-limit`); module declares the env var |

**Retired** (spec 059/061):

| Module | Retirement reason |
|--------|------------------|
| `session-store-postgres` | `connect-pg-simple` for `express-session`; no Encore analog (INV-3/INV-7: backend is stateless JWT) |
| `session-store-redis` | `connect-redis` for `express-session`; Redis is rate-limit backing only now |
| `api-docs` | Encore generates OpenAPI from the app graph (`encore gen client --lang=openapi`) |
| `auth-core` | Folded into `apps/api/auth/`; always-present Encore service |
| `auth-mock` | Driver ships in `apps/api/auth/mock.ts`; selected by `AUTH_DRIVER=mock` |
| `auth-entra-id` | Driver ships in `apps/api/auth/entra-id.ts`; selected by `AUTH_DRIVER=entra-id` |
| `auth-saml` | Driver ships in `apps/api/auth/saml.ts`; selected by `AUTH_DRIVER=saml` |
| `service-auth` | S2S OAuth lives in `apps/api/gateway/token-cache.ts` (spec 051) |

---

## 11. Generator Integration

`setup-app.ts` and `setup-dual-app.ts` drive the same composition engine used by `add-module.ts`:

```typescript
import { composeModule } from './lib/encore-composer'
import { copyTemplateBase, setAuthDriver } from './setup-app'

// setup-app.ts pipeline:
// 1. copyTemplateBase(templateRoot, dest)       // copy base skeleton
// 2. setAuthDriver(dest, profile.authDriver)    // set AUTH_DRIVER in .env.example
// 3. for each --with <module>:
//      composeModule({ moduleDir, manifest, apiDir })
// 4. encore gen client (best-effort)
```

`setup-dual-app.ts` calls `copyTemplateBase` + `setAuthDriver` twice (once per variant), then calls `wireInternalSpa` to point `apps/web-internal/vite.config.ts` at `apps/api/web/build`.

---

## 12. Script Compatibility Notes

The root `package.json` does not have `"type": "module"`. Scripts run via `tsx` in CJS compatibility mode.

Use `fileURLToPath` instead of `import.meta.dirname`:

```typescript
const scriptDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
```

Wrap top-level async work in an async IIFE or use `main().catch(...)`:

```typescript
main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
```

Import paths within Encore service files use `.js` extension even though sources are `.ts` (required for ESM resolution at runtime):

```typescript
import { db } from "../db/db"       // Encore resolves .ts; no extension needed in service files
import type { AppRole } from "./types"
```

---

## 13. Implementation Checklist

To implement this module system on a new repository:

1. **Create `scripts/lib/` utilities**: `manifest.schema.ts` (v2 Zod schema), `template-json.ts` (state CRUD), `encore-composer.ts` (compose/decompose engine), `modules-ts-generator.ts` (frontend-only `generateWebModulesTs`), `env-merger.ts`
2. **Create `scripts/add-module.ts`** with the flow above
3. **Create `scripts/remove-module.ts`** with reverse-dependency checks
4. **Create `scripts/validate-modules.ts`** with all check categories
5. **Create `template.json`** with an empty `modules` map
6. **Extract domain features into `modules/` catalog**: create `manifest.json` + `files/<service>/` for each feature module; create `manifest.json` only (no service files) for declarative overlays
7. **Do NOT** create `apps/api/src/modules.ts`, a middleware registry, or a route registry. There is no Express loader.
8. **Do NOT** create `packages/auth/src/index.ts` as a generated barrel. The `@template/auth` barrel generator is retired.

---

*This specification is self-contained. A coding agent reading only this document should be able to implement the complete Encore compile-time service-composition module system.*
