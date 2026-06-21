# Migrating to GitHub Environment-Scoped Deployments

This guide explains how to migrate your repository's GitHub Actions deployment workflows from **repo-level suffixed secrets** to **GitHub Environment-scoped secrets and variables**.

## Why are we changing?

**Before (old approach):**
- Repo-level secrets with suffixes: `AZURE_CREDENTIALS_PUBLIC`, `AZURE_CREDENTIALS_INTERNAL`
- Repo-level variables with suffixes: `AZURE_WEBAPP_NAME_PUBLIC`, `AZURE_WEBAPP_RG_INTERNAL`
- Caller workflows had to pass each secret/variable explicitly to the reusable workflow
- Adding a new secret meant updating every caller workflow

**After (new approach):**
- GitHub Environments (e.g. `dev-public`, `uat-internal`, `production-public`)
- Each environment has unsuffixed names: `AZURE_CREDENTIALS`, `AZURE_WEBAPP_NAME`, `AZURE_WEBAPP_RG`
- Caller workflows only pass `environment: <name>` and `secrets: inherit`
- Adding a new secret only requires updating the reusable workflow — callers stay untouched


## Overview of changes

You need to do three things:

1. **Create GitHub Environments** and populate their secrets/variables
2. **Update the reusable workflow** (`deploy-azure-webapp-reusable.yml`)
3. **Update caller workflows** (e.g. `deploy-public-dev.yml`, `deploy-internal-prod.yml`)


## Step 1: Create GitHub Environments

Go to your repo → **Settings → Environments** and create the environments you need.

### Single-app repos

| Environment    | Trigger branch  | Used by          |
| -------------- | --------------- | ---------------- |
| `dev`          | `dev`           | Dev deployment   |
| `uat`          | `uat`           | UAT deployment   |
| `production`   | manual only     | Prod deployment  |

### Dual-app repos (public + internal)

| Environment           | Trigger branch  | Used by                    |
| --------------------- | --------------- | -------------------------- |
| `dev-public`          | `dev`           | Dev — public app           |
| `dev-internal`        | `dev`           | Dev — internal app         |
| `uat-public`          | `uat`           | UAT — public app           |
| `uat-internal`        | `uat`           | UAT — internal app         |
| `production-public`   | manual only     | Production — public app    |
| `production-internal` | manual only     | Production — internal app  |

### What to add to each environment

Each environment needs these three values:

| Name                | Type       | Value                                   |
| ------------------- | ---------- | --------------------------------------- |
| `AZURE_CREDENTIALS` | **Secret** | The JSON service principal credentials  |
| `AZURE_WEBAPP_NAME` | Variable   | Azure Web App name (e.g. `myapp-dev`)   |
| `AZURE_WEBAPP_RG`   | Variable   | Azure resource group name               |

The `AZURE_CREDENTIALS` secret is the same JSON format you had before:

```json
{
  "clientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientSecret": "your-secret-value",
  "subscriptionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```


## Step 2: Update the reusable workflow

Replace your existing `deploy-azure-webapp-reusable.yml` with the updated version from the template. The key changes are:

1. **Removed** `azure-webapp-name` and `azure-webapp-rg` inputs — these are now read from the environment
2. **Removed** the `secrets:` declaration block — callers use `secrets: inherit` instead
3. **Removed** `VITE_*` env variables from the build step — the BFF auth pattern handles auth server-side
4. **Added** `environment: ${{ inputs.environment }}` on the deploy job — this is how GitHub resolves environment-scoped secrets/variables

The reusable workflow now references:
- `${{ secrets.AZURE_CREDENTIALS }}` — resolved from the GitHub Environment
- `${{ vars.AZURE_WEBAPP_NAME }}` — resolved from the GitHub Environment
- `${{ vars.AZURE_WEBAPP_RG }}` — resolved from the GitHub Environment

You can copy the file directly from the template repo.


## Step 3: Update caller workflows

### Single-app repos

Each caller workflow becomes very simple. Here are the three files you need:

**`.github/workflows/deploy-azure-webapp-dev.yml`**

```yaml
name: Deploy to Dev

on:
  workflow_dispatch:
  push:
    branches: [dev]
    paths-ignore:
      - '*.md'
      - '.gitignore'
      - 'docs/**'

permissions:
  contents: read
  actions: read
  id-token: write

jobs:
  deploy:
    uses: ./.github/workflows/deploy-azure-webapp-reusable.yml
    with:
      environment: dev
    secrets: inherit
```

**`.github/workflows/deploy-azure-webapp-uat.yml`**

```yaml
name: Deploy to UAT

on:
  workflow_dispatch:
  push:
    branches: [uat]
    paths-ignore:
      - '*.md'
      - '.gitignore'
      - 'docs/**'

permissions:
  contents: read
  actions: read
  id-token: write

jobs:
  deploy:
    uses: ./.github/workflows/deploy-azure-webapp-reusable.yml
    with:
      environment: uat
    secrets: inherit
```

**`.github/workflows/deploy-azure-webapp-prod.yml`**

```yaml
name: Deploy to Production

on:
  workflow_dispatch:

permissions:
  contents: read
  actions: read
  id-token: write

jobs:
  deploy:
    uses: ./.github/workflows/deploy-azure-webapp-reusable.yml
    with:
      environment: production
    secrets: inherit
```

### Dual-app repos

For dual-app repos, you have 6 caller workflows (2 apps × 3 environments). Each one passes the compound environment name and the app directory names.

**Example: `.github/workflows/deploy-public-dev.yml`**

```yaml
name: Deploy Public App to Dev

on:
  workflow_dispatch:
  push:
    branches: [dev]
    paths-ignore:
      - '*.md'
      - '.gitignore'
      - 'docs/**'

permissions:
  contents: read
  actions: read
  id-token: write

jobs:
  deploy:
    uses: ./.github/workflows/deploy-azure-webapp-reusable.yml
    with:
      environment: dev-public
      api-app: api-public
      web-app: web-public
    secrets: inherit
```

**Example: `.github/workflows/deploy-internal-prod.yml`** (manual only)

```yaml
name: Deploy Internal App to Production

on:
  workflow_dispatch:

permissions:
  contents: read
  actions: read
  id-token: write

jobs:
  deploy:
    uses: ./.github/workflows/deploy-azure-webapp-reusable.yml
    with:
      environment: production-internal
      api-app: api-internal
      web-app: web-internal
    secrets: inherit
```

The pattern for all 6 workflows:

| Workflow file               | `environment`          | `api-app`        | `web-app`        |
| --------------------------- | ---------------------- | ---------------- | ---------------- |
| `deploy-public-dev.yml`     | `dev-public`           | `api-public`     | `web-public`     |
| `deploy-internal-dev.yml`   | `dev-internal`         | `api-internal`   | `web-internal`   |
| `deploy-public-uat.yml`     | `uat-public`           | `api-public`     | `web-public`     |
| `deploy-internal-uat.yml`   | `uat-internal`         | `api-internal`   | `web-internal`   |
| `deploy-public-prod.yml`    | `production-public`    | `api-public`     | `web-public`     |
| `deploy-internal-prod.yml`  | `production-internal`  | `api-internal`   | `web-internal`   |


## Step 4: Clean up old secrets and variables

After verifying your deployments work with the new approach, remove the old repo-level secrets and variables:

1. Go to **Settings → Secrets and variables → Actions**
2. Delete the old suffixed secrets:
   - `AZURE_CREDENTIALS_PUBLIC`, `AZURE_CREDENTIALS_INTERNAL` (or unsuffixed `AZURE_CREDENTIALS` at repo level)
   - `VITE_AZURE_AD_CLIENT_ID`, `VITE_AZURE_AD_TENANT_ID`, etc. (no longer needed — BFF handles auth server-side)
3. Delete the old suffixed variables:
   - `AZURE_WEBAPP_NAME_PUBLIC`, `AZURE_WEBAPP_NAME_INTERNAL`
   - `AZURE_WEBAPP_RG_PUBLIC`, `AZURE_WEBAPP_RG_INTERNAL`
4. Delete old caller workflow files that are no longer used


## How it works

The key insight is how `secrets: inherit` and GitHub Environments interact:

1. The **caller workflow** sets `secrets: inherit`, which passes all repo-level and environment-scoped secrets to the reusable workflow.
2. The **reusable workflow's deploy job** has `environment: ${{ inputs.environment }}`, which tells GitHub to resolve `${{ secrets.X }}` and `${{ vars.X }}` from that specific environment.
3. This means `${{ secrets.AZURE_CREDENTIALS }}` in the reusable workflow automatically resolves to the correct credentials for the target environment — no suffixes needed.

```
Caller (deploy-public-dev.yml)
  └─ environment: dev-public + secrets: inherit
      └─ Reusable workflow (deploy job)
          └─ environment: dev-public  ← GitHub resolves secrets/vars from this environment
              ├─ secrets.AZURE_CREDENTIALS  → dev-public's AZURE_CREDENTIALS
              ├─ vars.AZURE_WEBAPP_NAME     → dev-public's AZURE_WEBAPP_NAME
              └─ vars.AZURE_WEBAPP_RG       → dev-public's AZURE_WEBAPP_RG
```


## Checklist

- [ ] GitHub Environments created (Settings → Environments)
- [ ] `AZURE_CREDENTIALS` secret set on each environment
- [ ] `AZURE_WEBAPP_NAME` variable set on each environment
- [ ] `AZURE_WEBAPP_RG` variable set on each environment
- [ ] `deploy-azure-webapp-reusable.yml` updated from template
- [ ] Caller workflows updated to use `environment:` + `secrets: inherit`
- [ ] Old suffixed repo-level secrets/variables deleted
- [ ] Old caller workflow files deleted
- [ ] Test deployment via `workflow_dispatch` on each environment
