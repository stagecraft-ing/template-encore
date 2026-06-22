# Module Development Guide

How to create, test, and publish a new module for the Enterprise Application Template.

For the system design, see [MODULARIZATION-SPEC.md](MODULARIZATION-SPEC.md). For usage, see [TEMPLATE-USER-GUIDE.md](TEMPLATE-USER-GUIDE.md).

---

## Prerequisites

- Familiarity with the repo layout (`apps/api`, `apps/web`)
- Understanding of Encore.ts: `api()`, `api.raw()`, `Service(...)`, `SQLDatabase`, `authHandler`, service middlewares
- TypeScript strict mode
- Familiarity with the base app's `lib/` primitives (`requireRole`, `csrfMiddleware`, `securityHeaders`, `apiRateLimit`, `logAuditEvent`)

---

## The Encore Composition Model

Adding a feature to the template is not scaffolding Express controllers and registering them via `app.use(...)`. It is:

1. **Creating a self-contained Encore service directory** with `encore.service.ts`, typed `api()` endpoints, a `model.ts` for database queries, and `types.ts`
2. **Writing a migration** for the tables the feature owns
3. **Declaring a v2 manifest** that tells the composer what to copy and how to merge config

Encore discovers the service directory at compile time. There is no loader to regenerate, no middleware chain to order, and no runtime registry to register into.

The reference shape is `user-management` (`modules/user-management/`), which is the worked example throughout this guide.

---

## Quick Start: New Feature Module

This walkthrough creates a module that adds a `/api/v1/widgets` endpoint backed by a `widget` table.

### Step 1: Create the directory structure

```
modules/widgets/
  manifest.json
  files/
    widgets/                      Encore service directory
      encore.service.ts
      widgets.ts                  api() endpoints
      model.ts                    tagged-template queries
      types.ts                    request/response interfaces
    db/
      1_widgets.up.sql            migration
```

### Step 2: Write the migration

**`modules/widgets/files/db/1_widgets.up.sql`**

```sql
CREATE TABLE widget (
  pk_widget     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  description   TEXT,
  created_by    TEXT        NOT NULL,  -- FK to user_account.user_email_address
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_widget_created_by ON widget (created_by);
```

### Step 3: Write the types

**`modules/widgets/files/widgets/types.ts`**

```typescript
export interface WidgetSummary {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
}
```

### Step 4: Write the model

**`modules/widgets/files/widgets/model.ts`**

```typescript
import { db } from "../db/db";
import type { WidgetSummary } from "./types";

interface WidgetRow {
  pk_widget: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

function toSummary(r: WidgetRow): WidgetSummary {
  return {
    id: r.pk_widget,
    name: r.name,
    description: r.description,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export async function listWidgets(limit: number, offset: number): Promise<{ rows: WidgetSummary[]; total: number }> {
  const [{ count }] = await db.query<{ count: string }>`
    SELECT COUNT(*) as count FROM widget
  `;
  const rows = await db.query<WidgetRow>`
    SELECT * FROM widget ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
  `;
  return { rows: rows.map(toSummary), total: parseInt(count, 10) };
}
```

Tagged-template queries only. Never string-concatenate SQL (INV-2).

### Step 5: Write the endpoints

**`modules/widgets/files/widgets/widgets.ts`**

```typescript
import { api, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../lib/roles";
import * as model from "./model";
import type { WidgetSummary } from "./types";

interface ListWidgetsParams {
  page?: Query<number>;
  limit?: Query<number>;
}

interface ListWidgetsResponse {
  widgets: WidgetSummary[];
  total: number;
  page: number;
  limit: number;
}

export const listWidgets = api(
  { expose: true, auth: true, method: "GET", path: "/api/v1/widgets" },
  async ({ page, limit }: ListWidgetsParams): Promise<ListWidgetsResponse> => {
    requireRole(getAuthData()!.roles, "user", "admin");
    const p = page && page > 0 ? page : 1;
    const l = limit && limit > 0 ? Math.min(limit, 100) : 20;
    const { rows, total } = await model.listWidgets(l, (p - 1) * l);
    return { widgets: rows, total, page: p, limit: l };
  },
);
```

Every endpoint is `auth: true`. Role checks use `requireRole` from `../lib/roles` (any-of logic, INV-1). Errors use `APIError` (the `{ code, message, details }` shape), never the retired `{ success, data }` envelope.

### Step 6: Write the service declaration

**`modules/widgets/files/widgets/encore.service.ts`**

```typescript
import { Service } from "encore.dev/service";
import { securityHeaders } from "../lib/security-headers";
import { csrfMiddleware } from "../lib/csrf";
import { apiRateLimit } from "../lib/rate-limit";

export default new Service("widgets", {
  middlewares: [securityHeaders, csrfMiddleware, apiRateLimit],
});
```

Compose the same `lib` middleware chain as the `auth` service. The `middlewares` array is resolved at compile time by Encore.

### Step 7: Write the manifest

**`modules/widgets/manifest.json`**

```json
{
  "name": "widgets",
  "version": "1.0.0",
  "description": "Widget management endpoints: Encore service + migration",
  "status": "stable",
  "requires": [],
  "requiresOneOf": [],
  "optionalPeers": [],
  "conflicts": [],
  "services": ["widgets"],
  "migrations": [
    { "source": "db/1_widgets.up.sql", "description": "widget table" }
  ],
  "secrets": [],
  "corsEntries": [],
  "middlewares": ["securityHeaders", "csrfMiddleware", "apiRateLimit"],
  "files": {},
  "authExports": [],
  "packageDeps": {},
  "envVars": {}
}
```

If your module has SPA views:

```json
{
  "files": {
    "apps/web/src/views/WidgetView.vue": "apps/web/src/views/WidgetView.vue"
  },
  "webSnippetFile": "web.snippet.ts"
}
```

### Step 8: Install and verify

```bash
# Install the module into a generated app
npx tsx scripts/add-module.ts widgets --yes

# Verify
npx tsx scripts/validate-modules.ts
cd apps/api && encore check
```

After install, `apps/api/widgets/` should exist, and `apps/api/db/migrations/` should contain a renumbered `<n>_widgets.up.sql`.

---

## Manifest v2 Reference

All fields in `manifest.json` with their types and the Encore meaning.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | required | Must match the directory name under `modules/` |
| `version` | `string` | `"1.0.0"` | Semver |
| `description` | `string` | required | One-line description |
| `status` | `"stable" \| "planned"` | `"stable"` | Only `stable` modules can be installed |
| `requires` | `string[]` | `[]` | All must be installed; auto-installed if missing |
| `requiresOneOf` | `string[][]` | `[]` | At least one from each group must be present |
| `optionalPeers` | `string[]` | `[]` | Suggested after install; not enforced |
| `conflicts` | `string[]` | `[]` | Auto-removed on install |
| `services` | `string[]` | `[]` | Encore service directory names; each copied to `apps/api/<svc>/` |
| `migrations` | `{source, description?}[]` | `[]` | SQL migration files merged (renumbered) into `db/migrations/` |
| `secrets` | `{name, description?, required}[]` | `[]` | `secret()` names bound in `infra.config.json` (no values written) |
| `corsEntries` | `{field, values[]}[]` | `[]` | Additions to `encore.app` `global_cors` |
| `middlewares` | `string[]` | `[]` | Documentary: which `lib` factories the service's `encore.service.ts` uses |
| `files` | `Record<src, dest>` | `{}` | Frontend view files to copy (src relative to `files/`, dest relative to project root) |
| `authExports` | `string[]` | `[]` | Legacy field; empty in all v2 modules |
| `webSnippetFile` | `string?` | (none) | Vue nav registration snippet (path relative to module dir) |
| `packageDeps` | `Record<workspace, Record<pkg, ver>>` | `{}` | npm deps per workspace |
| `envVars` | `Record<key, EnvVarDef>` | `{}` | Non-secret env vars merged into `.env.example` |
| `workspaceChanges` | `{add?, remove?}?` | (none) | Root `package.json` workspace changes |

**Not in v2** (removed): `apiRegistrations`, `authDriverRegistration`, `sideEffectImports`. These Express runtime-registry fields have no Encore analog.

### secrets entry

```json
{
  "name": "SAML_CERT",
  "description": "SAML IdP X.509 certificate",
  "required": true
}
```

The composer adds `"SAML_CERT": { "$env": "SAML_CERT" }` to `apps/api/infra.config.json`. No secret value is ever written by the tooling.

### corsEntries entry

```json
{
  "field": "allow_origins_with_credentials",
  "values": ["https://my-extra-origin.example.com"]
}
```

The composer appends to the named `encore.app` `global_cors` field using JSONC-aware edits that preserve all `//` comments.

---

## Module Patterns

### A. Domain Feature Module (the primary pattern)

Adds typed Encore endpoints, a data model, and a migration. This is the pattern for all new business features.

**Directory layout:**

```
modules/<name>/
  manifest.json
  files/
    <service-name>/
      encore.service.ts     new Service("name", { middlewares: [...] })
      endpoints.ts          api() typed endpoints
      model.ts              tagged-template db queries
      types.ts              request/response interfaces
    db/
      1_<name>.up.sql       migration (always numbered from 1 in the source;
                             renumbered on compose)
```

**Rules:**
- All endpoints: `{ expose: true, auth: true }` + `requireRole(...)` (INV-1)
- Database: tagged-template queries only (`db.query\`...\``); never `pg.Pool` or raw SQL strings (INV-2)
- Import `db` from `../db/db` (the single shared `SQLDatabase("app")`, spec 001)
- Errors: `APIError` with `{ code, message, details }`; never `{ success, data }` envelopes
- Audit: call `logAuditEvent(...)` from `../lib/audit` on every mutation (INV-8, best-effort)
- No `express-session` or session references anywhere

**Worked example**: `modules/user-management/` implements this pattern end-to-end.

### B. Thin Declarative Overlay

Contributes only secrets, CORS entries, or env vars. No service directory. The backend function is already provided by the base app.

**Manifest pattern:**

```json
{
  "services": [],
  "migrations": [],
  "secrets": [
    { "name": "MY_SECRET_KEY", "description": "API key for the external service" }
  ],
  "corsEntries": [],
  "middlewares": [],
  "files": {},
  "envVars": {
    "MY_API_BASE_URL": {
      "required": true,
      "description": "Base URL of the external service"
    }
  }
}
```

Installing this module adds the secret binding to `infra.config.json` and the env var to `.env.example`. Removing it reverses both.

### C. Frontend Module

Adds Vue views and nav registration without adding backend endpoints. May combine with a domain feature or stand alone.

**web.snippet.ts** (path relative to module dir, declared via `webSnippetFile`):

```typescript
import { registerNavItem } from './composables/useNavigation'
import { registerRouterPlugin } from './router/registry'

registerRouterPlugin({
  name: 'widgets',
  routes: [
    { path: '/widgets', name: 'widgets', component: () => import('./views/WidgetView.vue') },
  ],
})

registerNavItem({
  id: 'nav-widgets',
  label: 'Widgets',
  to: '/widgets',
  position: 'left',
  priority: 30,
})
```

The generator splits the snippet into import lines (hoisted) and body lines (placed in the generated `apps/web/src/modules.ts`).

---

## The user-management Reference Module

`modules/user-management/` is the canonical worked example for domain feature modules. Study it alongside this guide.

**What it demonstrates:**

- Service directory structure: `encore.service.ts` + `users.ts` + `roles.ts` + `model.ts` + `types.ts`
- Composing the `lib` middleware chain (`securityHeaders`, `csrfMiddleware`, `apiRateLimit`) in `encore.service.ts`
- Typed `api()` endpoints with `auth: true` and `requireRole(getAuthData()!.roles, "admin", "user-manager")`
- Tagged-template queries (`db.query\`...\``) over the shared `SQLDatabase("app")`, importing `db` from `../db/db`
- A migration that creates tables keyed to the existing `user_account` identity (FK to base tables)
- `logAuditEvent(...)` on every mutation (INV-8)
- SPA views (`UserListView.vue`, `UserDetailView.vue`) + `web.snippet.ts` for nav registration
- A v2 `manifest.json` with `services: ["user-management"]`, `migrations: [...]`, and `requires: []` (the cross-cutting concerns it needed under Express are now the base app floor)

**What it intentionally does NOT do:**

- No `pg.Pool` / `db.Pool`; Encore manages pooling through `SQLDatabase`
- No `express-session` or `req.session` references
- No `{ success, data }` response envelopes; bare typed payloads only
- No `modules.ts` Express loader entries; Encore discovers the service directory automatically
- No `auth-core` dependency; the base `auth` service (and `lib/roles`, `lib/jwt`, etc.) is the base app floor, not a module

---

## Protecting Endpoints

Every endpoint in a feature module that requires authentication MUST be `auth: true` and MUST call `requireRole` if a role is needed:

```typescript
import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../lib/roles";

export const myEndpoint = api(
  { expose: true, auth: true, method: "GET", path: "/api/v1/widgets" },
  async (): Promise<WidgetResponse> => {
    const auth = getAuthData()!    // populated by the Encore authHandler + Gateway
    requireRole(auth.roles, "user", "admin")  // any-of; throws APIError if missing (INV-1)
    // scope your data query to auth.roles / auth.userID (AUTH-007)
    return { ... }
  },
)
```

`requireRole` is any-of: the caller must have at least one of the named roles. It throws an `APIError` (not a plain Error) if the check fails. Import it from `../lib/roles`.

---

## Writing Database Queries

Import `db` from the shared `db` service. Use tagged templates only:

```typescript
import { db } from "../db/db";

// Correct: tagged template (auto-parameterized, INV-2)
const rows = await db.query<MyRow>`
  SELECT * FROM my_table WHERE owner_id = ${userId} AND is_active = true
`;

// Correct: transaction
const rows2 = await db.begin(async (txn) => {
  await txn.exec`INSERT INTO my_table (owner_id, name) VALUES (${userId}, ${name})`;
  return txn.query<MyRow>`SELECT * FROM my_table WHERE owner_id = ${userId}`;
});

// WRONG: string concatenation (SQL injection, INV-2)
const bad = await db.query(`SELECT * FROM my_table WHERE id = '${id}'`);
```

Never use `pg.Pool`, `pg.Client`, or `DATABASE_URL` directly. Encore handles connection pooling through `SQLDatabase("app")`.

---

## Writing Audit Records (INV-8)

Every admin mutation must write an audit record. Import `logAuditEvent` from `../lib/audit`:

```typescript
import { logAuditEvent } from "../lib/audit";

// Capture old state before mutation, then pass it as oldData:
const oldRow = await model.getById(id)
await model.updateRow(id, newValues)
await logAuditEvent({
  table: "my_table",
  recordId: id,
  action: "UPDATE",
  actorId: auth.userID,
  oldData: oldRow,
  newData: newValues,
})
// logAuditEvent is best-effort (never throws); it must never block the user flow (INV-8)
```

---

## Migration Guidelines

1. Name migration files `1_<name>.up.sql` inside `modules/<name>/files/db/` (always numbered from 1 in the source; the composer renumbers to the next free prefix on merge)
2. The base app has 4 migrations (1 through 4); a module migration will land at 5 or higher when composed
3. FK references to base tables (`user_account`) are safe because base migrations always apply first
4. Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` for idempotency
5. For the `source` field in the manifest, use the path relative to `files/`: `"db/1_<name>.up.sql"`

---

## Dependency Rules

| Manifest field | Behavior |
|----------------|----------|
| `requires` | All must be installed; missing ones are auto-installed recursively |
| `requiresOneOf` | At least one module from each group must be present; not auto-installed |
| `conflicts` | Co-installed conflicting modules are auto-removed before installing yours |
| `optionalPeers` | Shown as suggestions after install; no enforcement |

Feature modules with no cross-cutting prereqs set `"requires": []`. The base app provides `lib`, `db`, `auth`, and `gateway` as the floor; they are not modules and cannot be listed in `requires`.

---

## Testing Your Module

### Validate the manifest

```bash
npx tsx scripts/validate-modules.ts
```

Checks manifest schema validity, file existence, and dependency consistency.

### Install on a generated app

```bash
# Generate a test app
npx tsx scripts/setup-app.ts --profile minimal --dest /tmp/test-app --yes --no-install

# Install your module
npx tsx scripts/add-module.ts widgets --yes --no-install --root /tmp/test-app

# Check the Encore graph
cd /tmp/test-app/apps/api
encore check
```

Verify: `apps/api/widgets/` exists, `apps/api/db/migrations/` contains the renumbered migration, `template.json` records `composedMigrations`.

### Test removal

```bash
npx tsx scripts/remove-module.ts widgets --yes --root /tmp/test-app
```

Verify: `apps/api/widgets/` is gone, the migration file is deleted, `infra.config.json` and `encore.app` are clean.

### Validate the backend graph after compose

```bash
cd /tmp/test-app/apps/api && encore check
```

This validates that the new service directory compiles cleanly, its imports resolve, and the overall service graph has no cycles or type errors.

---

## CLI Reference

### Install a module

```bash
npx tsx scripts/add-module.ts <module-name> [options]
```

| Option | Description |
|--------|-------------|
| `--yes` | Skip confirmation prompt |
| `--dry-run` | Show what would happen without making changes |
| `--list` | List all available modules |
| `--no-install` | Skip `npm install` |
| `--root <path>` | Target a different destination project |

### Remove a module

```bash
npx tsx scripts/remove-module.ts <module-name> [options]
```

| Option | Description |
|--------|-------------|
| `--yes` | Skip confirmation prompt |
| `--dry-run` | Show what would happen without making changes |
| `--no-install` | Skip `npm install` |
| `--root <path>` | Target a different destination project |

### Validate all modules

```bash
npx tsx scripts/validate-modules.ts
```

Exits with code 1 if any check fails. Use in CI pipelines.

---

## Checklist for New Feature Modules

- [ ] Directory name matches `manifest.json` `name` field
- [ ] `status` is `"stable"`
- [ ] `services[]` lists the service directory name(s)
- [ ] Each service directory has `encore.service.ts` exporting `new Service("name", { middlewares: [...] })`
- [ ] Endpoints are `{ expose: true, auth: true }` with `requireRole` where needed (INV-1)
- [ ] Database queries use tagged templates only; import `db` from `../db/db` (INV-2)
- [ ] Mutations call `logAuditEvent` (INV-8)
- [ ] Errors use `APIError` (`{ code, message, details }`); no `{ success, data }` envelopes
- [ ] No `express-session`, `app.use`, `Router()`, `pg.Pool`, or `req.session` references
- [ ] `migrations[].source` paths are relative to `files/` (e.g. `"db/1_widgets.up.sql"`)
- [ ] `secrets[]` names match the `secret("Name")` declarations in the service
- [ ] `requires: []` unless the module genuinely depends on another module (not the base app)
- [ ] `npx tsx scripts/validate-modules.ts` passes
- [ ] `encore check` passes on a generated app with the module composed
- [ ] `remove-module` fully reverses the compose (no residue)
