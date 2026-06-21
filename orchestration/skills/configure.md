---
id: template-configure
name: Template Configure: Apply Identity and Configuration
description: Applies app identity, environment variables, AUTH_DRIVER selection, infra.config.json secret bindings, encore.app global_cors, and the internal layout shell for the selected variant (public, internal, dual)
type: skill
variant_parameter: public | internal | dual
defers_to:
  - template-orchestrator (configuration reference, env var documentation)
---

# Template Skill: Configure

Apply all configuration changes to make the template yours. Configuration is mechanical: value substitution, renaming, env var and secret setup. No logic changes, no new feature files.

**Input** (pipeline mode): `variant`, `securityMethod`, and `templateOverrides` from the factory API Build Specification. App identity values come from `requirements/services/service-description.json` and `requirements/services/audience-identification.json`. `securityMethod` maps to the AUTH_DRIVER as: `saml` → `saml`, `entra-id` → `entra-id`, `mock` → `mock`.

**Input** (standalone mode): equivalent values supplied directly by the user: at minimum a variant, app name, and selected auth driver(s).

This skill must run before any feature scaffolding or trimming.

---

## Step 1: App Identity

### 1a. Package Names

`apps/api` is a standalone Encore application excluded from npm workspaces; it has its own `package.json` and lockfile. Update it independently of the SPA workspaces.

**Encore app (standalone):**
| File | From | To |
|------|------|----|
| `apps/api/package.json` `name` | `@template/api` | `@{org}/api` |
| `apps/api/encore.app` `id` | `vue-encore-enterprise-template` | `{app-slug}` |

**SPA workspaces:**
| File | From | To |
|------|------|----|
| `package.json` (root) | `vue-encore-enterprise-template` | `{app-slug}` |
| `apps/web/package.json` | `@template/web` | `@{org}/web` |
| `apps/web-internal/package.json` (if dual) | `@template/web-internal` | `@{org}/web-internal` |
| `packages/shared/package.json` | `@template/shared` | `@{org}/shared` |

After renaming, search for `@template/` across all TypeScript and Vue files and replace with `@{org}/`. Note: `apps/api` does not import any `@template/*` package: its shared types live in `apps/api/lib`. Only the SPA workspaces consume `packages/*`.

### 1b. README

- Replace title with actual application name
- Replace description with application purpose
- Update the apps/ports table for the active variant
- Remove or replace the template disclaimer

---

## Step 2: Environment Files

### 2a. Create Working .env Files

```bash
# Encore app (standalone; its own .env.example)
cp apps/api/.env.example apps/api/.env
```

The Encore app reads `apps/api/.env` at development time. In production, all secret values come from Encore's secret store (bound via `infra.config.json`).

### 2b. Fill Development Values

In `apps/api/.env`, set for local development:

```
NODE_ENV=development
PORT=4000
AUTH_DRIVER=mock
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=debug
LOG_PII=false
RATE_LIMIT_MAX=1000
AUTH_RATE_LIMIT_MAX=100
```

JWT signing keys are generated separately (see Step 3). The Encore app uses `infra.config.json` `$env` bindings to read the `JWT_*` env vars in development; in production they come from the Encore secret store.

**Frontend URLs by variant:**

| Variant | `FRONTEND_URL` | `encore.app` `global_cors` origins |
|---------|---------------|-------------------------------------|
| public | `http://localhost:5173` | `http://localhost:5173` + production URL |
| internal | `http://localhost:5173` | `http://localhost:5173` + production URL |
| dual (public app) | `http://localhost:5173` | `http://localhost:5173` + public production URL |
| dual (internal app) | `http://localhost:5174` | `http://localhost:5174` + internal production URL |

> **Dual variant**: Each Encore app allows only its own frontend origin in `global_cors`. Do not combine both frontend URLs in one app's `global_cors`: that defeats the trust-zone boundary.

### 2c. Dual-Stack Routing Configuration (dual variant only)

Two independent Encore apps (port 4000 each in isolation; run on separate ports or hosts in production):

```
apps/web (:5173)      -- Vite proxy --> public Encore app (:4000)  --> private backend (gateway S2S)
apps/web-internal (:5174) -- Vite proxy --> internal Encore app (:4001)  --> SQLDatabase("app")
```

Each Vite dev server (`vite.config.ts`) proxies `/api/*` to its own Encore backend. Verify these are correct after generation.

**`apps/web/vite.config.ts`**: must proxy to the public Encore app:
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:4000',
    changeOrigin: true,
  },
},
```

**`apps/web-internal/vite.config.ts`**: must proxy to the internal Encore app:
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:4001',
    changeOrigin: true,
  },
},
```

---

## Step 3: Auth Driver Configuration

The Encore app ships three auth drivers in `apps/api/auth/`: `mock`, `entra-id`, and `saml`. Driver selection is controlled by the `AUTH_DRIVER` env var: no file copies or module registrations are needed.

### Step 3a. Generate JWT Keys (development)

```bash
cd apps/api
npm run generate-keys      # writes apps/api/keys/*.pem (gitignored)
```

The generated `.pem` files are read via `$env` references in `infra.config.json` in development. In production, the PEM content is stored as Encore secrets (`JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_REFRESH_PRIVATE_KEY`, `JWT_REFRESH_PUBLIC_KEY`) declared in `apps/api/lib/secrets.ts`.

### Step 3b. Public variant (SAML driver)

In `apps/api/.env`:
```
AUTH_DRIVER=saml
SAML_ENTRY_POINT={IdP SSO URL}
SAML_ISSUER={SP entity ID}
SAML_CERT={IdP certificate, base64}
SAML_PRIVATE_KEY={SP private key, base64}
SAML_CERT_SP={SP certificate, base64}
SAML_LOGOUT_URL={IdP SLO URL}
SAML_CALLBACK_URL=http://localhost:4000/api/v1/auth/saml/callback
```

In `apps/api/infra.config.json`, bind the SAML secret env vars under `secrets`.

### Step 3c. Internal variant (Entra ID driver)

In `apps/api/.env`:
```
AUTH_DRIVER=entra-id
ENTRA_TENANT_ID={Azure tenant ID}
ENTRA_CLIENT_ID={App registration client ID}
ENTRA_CLIENT_SECRET={Client secret}
ENTRA_CALLBACK_URL=http://localhost:4000/api/v1/auth/entra-id/callback
ENTRA_DEFAULT_ROLE=user
```

In `apps/api/infra.config.json`, bind the Entra secret env vars under `secrets`.

### Step 3d. Dual variant

Configure SAML for the public Encore app and Entra ID for the internal Encore app: each in its own `apps/api/.env` and `infra.config.json`. Neither app shares an `infra.config.json` with the other.

### Step 3e. Customize Mock Users (Required)

The template ships with generic mock users in `apps/api/auth/mock.ts` (`developer`, `admin`, `user`). Replace them with mock users whose roles match the business requirements.

```typescript
// apps/api/auth/mock.ts: replace the default mockUsers array
const mockUsers = [
  {
    userID: 'mock-external-1',
    email: 'external@example.com',
    name: 'Mock External User',
    roles: ['external'],
    ssoProvider: 'mock',
  },
  {
    userID: 'mock-staff-1',
    email: 'caseworker@example.com',
    name: 'Mock Caseworker',
    roles: ['user', 'caseworker'],
    ssoProvider: 'mock',
  },
  {
    userID: 'mock-admin-1',
    email: 'admin@example.com',
    name: 'Mock Administrator',
    roles: ['user', 'admin'],
    ssoProvider: 'mock',
  },
]
```

**Rules:**
- One mock user per distinct role combination the business requirements define
- Use the exact role strings (case-sensitive) from the business requirements: these are the same strings used in `requireRole(getAuthData()!.roles, ...)` guards and `hasRole(role)` UI checks
- Set `ENTRA_DEFAULT_ROLE` in `apps/api/.env` to the lowest-privilege role
- Document the `?user=N` mapping in the project README so developers know which index corresponds to each role

---

## Step 4: infra.config.json Secret Bindings

`apps/api/infra.config.json` binds Encore `secret()` names to `$env` references for local development. In production, the secrets come from the Encore secret store.

Review the existing bindings and extend them for any secrets the application requires:

```jsonc
{
  "secrets": {
    "JwtPrivateKey": { "$env": "JWT_PRIVATE_KEY" },
    "JwtPublicKey": { "$env": "JWT_PUBLIC_KEY" },
    "JwtRefreshPrivateKey": { "$env": "JWT_REFRESH_PRIVATE_KEY" },
    "JwtRefreshPublicKey": { "$env": "JWT_REFRESH_PUBLIC_KEY" },
    "SamlPrivateKey": { "$env": "SAML_PRIVATE_KEY" },
    // ... add driver-specific and feature-specific secrets here
  },
  "sql_databases": [
    {
      "name": "app",
      "config": {
        "host": "localhost",
        "port": 5432,
        "database": "app",
        "user": "postgres",
        "password": { "$env": "DB_PASSWORD" }
      }
    }
  ]
}
```

Never commit actual secret values; use `$env` references only. Encore provisions a local Postgres instance automatically via Docker when `encore run` starts.

---

## Step 5: encore.app global_cors

Update `apps/api/encore.app` CORS origins for the production deployment:

```jsonc
{
  "id": "{app-slug}",
  "global_cors": {
    "allow_origins_with_credentials": [
      "http://localhost:5173",
      "https://{app}.example.com"
    ]
  }
}
```

> **Do NOT combine both public and internal frontend URLs in a single app's `global_cors`** (dual variant). Each Encore app allows only its own frontend. This enforces the external user/staff trust-zone boundary.

Redis (`REDIS_URL`) is an optional rate-limit backend (not a session store). If Redis is configured, Encore uses it for the `apiRateLimit` middleware; if not, the in-memory rate-limit backend is used.

---

## Step 6: Source-Level Configuration

### 6a. Router Home Route

Replace `HomeView.vue` at `/` with the app's real primary view:

**Public (`apps/web/src/router/index.ts`): external user landing page:**
```typescript
{
  path: '/',
  name: 'Home',
  component: () => import('@/views/{PrimaryLandingView}.vue'),
  // meta.requiresAuth: false: external user landing pages are unauthenticated
}
```

**Internal (`apps/web-internal/src/router/index.ts`): staff dashboard:**
```typescript
{
  path: '/',
  name: 'Home',
  component: () => import('@/views/{PrimaryDashboardView}.vue'),
  meta: { requiresAuth: true },
}
```

After updating the route, delete `HomeView.vue` following Pattern E in template-trim.

### 6b. Internal App Layout Shell (internal and dual variants only)

Internal/staff-facing apps use a fundamentally different layout: **no `goa-app-header`**: the `goa-work-side-menu` IS the chrome. The sidebar provides heading, user identity, and navigation. Layout is a flex row: `goa-work-side-menu` + card-container content area.

**This step must be done during configure: not deferred to feature scaffolding.**

**Target**: `apps/web/src/` (internal variant) or `apps/web-internal/src/` (dual variant). Do not touch the public SPA.

> **Dual variant (`apps/web-internal/`)**: The template already ships a starter shell with `goa-work-side-menu`. Do NOT skip this step because it already exists. You must still validate and customize:
> 1. **Validate**: confirm `AppLayout.vue` has no `goa-app-header`, no `.app-body` wrapper, and `.app-layout` uses flex row
> 2. **Customize**: update service name/heading, configure nav items for the project's pages
> 3. **Verify expansion**: confirm surrounding CSS does not clip the sidebar

> **Internal variant (`apps/web/src/`)**: the app starts with the public layout and must be fully swapped using the structure below.

#### 6b-1. Configure `AppLayout.vue`

```vue
<!-- apps/web{-internal}/src/components/layout/AppLayout.vue -->
<template>
  <div class="app-layout">
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <goa-work-side-menu
      :heading="serviceName"
      :user-name="user?.name"
      :user-secondary-text="user?.email"
    >
      <goa-work-side-menu-item
        v-for="item in primaryItems"
        :key="item.id"
        slot="primary"
        :icon="item.icon"
        :label="item.label"
        :url="item.to"
        :current="isCurrentRoute(item.to)"
        @click.prevent="navigateTo(item.to)"
      />
      <goa-work-side-menu-item
        v-for="item in secondaryItems"
        :key="item.id"
        slot="secondary"
        :icon="item.icon"
        :label="item.label"
        :badge="item.badge"
        @click.prevent="navigateTo(item.to)"
      />
      <goa-work-side-menu-item
        v-for="item in accountItems"
        :key="item.id"
        slot="account"
        :label="item.label"
        :url="item.to"
        @click.prevent="navigateTo(item.to)"
      />
      <goa-work-side-menu-item
        slot="account"
        label="Sign Out"
        @click.prevent="handleLogout"
      />
    </goa-work-side-menu>

    <div class="card-container">
      <div class="desktop-card-container">
        <main id="main-content" class="main-content">
          <slot />
        </main>
      </div>
    </div>
  </div>
</template>
```

> **CSS note**: There is **no `goa-app-header`** on authenticated pages. `.app-layout` is a flex ROW (not column) with `height: 100vh` and `overflow: hidden`.

```css
<style scoped>
.app-layout {
  height: 100vh;
  display: flex;
  overflow: hidden;
}

.card-container {
  flex: 1;
  padding: 16px;
  background: #f1f1f1;
  overflow: hidden;
  display: flex;
  min-width: 0;
}

.desktop-card-container {
  flex: 1;
  background: #ffffff;
  border-radius: 24px;
  border: 1px solid var(--goa-color-greyscale-200, #dcdcdc);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-width: 0;
}

.skip-link {
  position: absolute;
  top: -100%;
  left: var(--goa-space-m);
  z-index: 9999;
  padding: var(--goa-space-s) var(--goa-space-m);
  background: var(--goa-color-interactive-default);
  color: var(--goa-color-greyscale-white);
  text-decoration: none;
  border-radius: var(--goa-border-radius-m);
  font-weight: 600;
}

.skip-link:focus {
  top: var(--goa-space-m);
}
</style>
```

**Key differences from public layout:**
- **No `goa-microsite-header` and no `goa-app-header`**: sidebar is the chrome
- **`goa-work-side-menu`** provides heading, user identity, and primary navigation
- **Flat flex row**: sidebar + card-container as direct children of `.app-layout`
- **No footer**: internal apps do not use `goa-app-footer`

#### 6b-2. Verify No AppHeader in Internal Layout

Internal authenticated pages do not use `goa-app-header` or `goa-app-footer`. If an `AppHeader.vue` or `AppFooter.vue` exists in `apps/web-internal/src/components/layout/`, it must NOT be imported or used by `AppLayout.vue`. The heading and user identity are provided by `goa-work-side-menu` props.

#### 6b-3. Update `App.vue`

Verify `App.vue` passes correct props to `AppLayout`:

```vue
<!-- apps/web{-internal}/src/App.vue -->
<AppLayout
  service-name="{App Name} - Internal"
  :user="user"
  :primary-items="primaryItems"
  :secondary-items="secondaryItems"
  :account-items="accountItems"
>
```

#### Summary of layout differences

| Element | Public (`apps/web`) | Internal (`apps/web-internal`) |
|---------|--------------------|---------------------------------|
| Microsite header | `goa-microsite-header type="alpha"` | **None** |
| App header | `goa-app-header` with nav links | **None**: sidebar provides heading + user identity |
| Navigation | Header links | `goa-work-side-menu` (left sidebar, `primary`/`secondary`/`account` slots) |
| Content area | Full-width centered | Card container flex right of side menu |
| Footer | Full nav + meta sections | **None** |
| Page layout | Each view wraps in `goa-container` | Each view sits in `<main>` inside card container |

---

## Step 7: GitHub Actions (if Azure deployment)

Update `.github/workflows/`:
- Set `azure-webapp-name` to the actual Azure Web App name
- Set `azure-webapp-rg` to the actual resource group
- Flag required GitHub secrets: `AZURE_CREDENTIALS`, build-time `VITE_*` env vars

**Dual variant**: ensure separate workflows for the public and internal stacks, or use a parameterized reusable workflow.

---

## Output: Configuration Report

### Changes Made
Bulleted list of every file changed and what was changed.

### Placeholder Status

| Placeholder | Status | File | Notes |
|-------------|--------|------|-------|
| `SAML_ENTRY_POINT` | UNFILLED | `apps/api/.env` | Needs IdP URL from auth team |
| JWT keys | GENERATED | `apps/api/keys/*.pem` | Run `npm run generate-keys` |
| ... | ... | ... | ... |

### Secret Bindings
List each Encore secret declared in `lib/secrets.ts` and its `infra.config.json` `$env` mapping status.

### Required Actions Before Production
Numbered list: provide Encore production secrets, register SAML/Entra ID app in IdP, update `encore.app` CORS origins, set up database, create GitHub secrets.

---

After the report: **"Configuration complete for {variant} variant. Ready for feature scaffolding."**
