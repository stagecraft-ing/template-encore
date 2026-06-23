# Migrating to GitHub Environment-Scoped Deployments

This guide explains how to migrate your repository's GitHub Actions deployment workflows from **repo-level suffixed secrets** to **GitHub Environment-scoped secrets and variables**.

## Why are we changing?

**Before (old approach):**
- Repo-level secrets with suffixes: `DEPLOY_CREDENTIALS_PUBLIC`, `DEPLOY_CREDENTIALS_INTERNAL`
- Repo-level variables with suffixes: `WEBAPP_NAME_PUBLIC`, `WEBAPP_GROUP_INTERNAL`
- Caller workflows had to pass each secret/variable explicitly to the reusable workflow
- Adding a new secret meant updating every caller workflow

**After (new approach):**
- GitHub Environments (e.g. `dev-public`, `uat-internal`, `production-public`)
- Each environment has unsuffixed names: `DEPLOY_CREDENTIALS`, `WEBAPP_NAME`, `WEBAPP_GROUP`
- Caller workflows only pass `environment: <name>` and `secrets: inherit`
- Adding a new secret only requires updating the reusable workflow; callers stay untouched


## Overview of changes

You need to do three things:

1. **Create GitHub Environments** and populate their secrets/variables
2. **Update the reusable workflow** (`deploy-reusable.yml`)
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
| `dev-public`          | `dev`           | Dev, public app            |
| `dev-internal`        | `dev`           | Dev, internal app          |
| `uat-public`          | `uat`           | UAT, public app            |
| `uat-internal`        | `uat`           | UAT, internal app          |
| `production-public`   | manual only     | Production, public app     |
| `production-internal` | manual only     | Production, internal app   |

### What to add to each environment

Each environment needs these three values:

| Name                 | Type       | Value                                       |
| -------------------- | ---------- | ------------------------------------------- |
| `DEPLOY_CREDENTIALS` | **Secret** | The deploy credentials for your host        |
| `WEBAPP_NAME`        | Variable   | App/service name (e.g. `myapp-dev`)         |
| `WEBAPP_GROUP`       | Variable   | Resource group / namespace name             |

The `DEPLOY_CREDENTIALS` secret is whatever credential format your container host or app host expects (for
example a JSON service-principal blob or an API token). It is the same format you used before.


## Step 2: Update the reusable workflow

Replace your existing `deploy-reusable.yml` with the updated version from the template. The key changes are:

1. **Removed** `webapp-name` and `webapp-group` inputs; these are now read from the environment
2. **Removed** the `secrets:` declaration block; callers use `secrets: inherit` instead
3. **Removed** `VITE_*` env variables from the build step; the BFF auth pattern handles auth server-side
4. **Added** `environment: ${{ inputs.environment }}` on the deploy job; this is how GitHub resolves environment-scoped secrets/variables

The reusable workflow now references:
- `${{ secrets.DEPLOY_CREDENTIALS }}`, resolved from the GitHub Environment
- `${{ vars.WEBAPP_NAME }}`, resolved from the GitHub Environment
- `${{ vars.WEBAPP_GROUP }}`, resolved from the GitHub Environment

You can copy the file directly from the template repo.


## Step 3: Update caller workflows

### Single-app repos

Each caller workflow becomes very simple. Here are the three files you need:

**`.github/workflows/deploy-dev.yml`**

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
    uses: ./.github/workflows/deploy-reusable.yml
    with:
      environment: dev
    secrets: inherit
```

**`.github/workflows/deploy-uat.yml`**

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
    uses: ./.github/workflows/deploy-reusable.yml
    with:
      environment: uat
    secrets: inherit
```

**`.github/workflows/deploy-prod.yml`**

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
    uses: ./.github/workflows/deploy-reusable.yml
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
    uses: ./.github/workflows/deploy-reusable.yml
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
    uses: ./.github/workflows/deploy-reusable.yml
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
   - `DEPLOY_CREDENTIALS_PUBLIC`, `DEPLOY_CREDENTIALS_INTERNAL` (or unsuffixed `DEPLOY_CREDENTIALS` at repo level)
   - any `VITE_*` auth client/issuer secrets (no longer needed; the BFF handles auth server-side)
3. Delete the old suffixed variables:
   - `WEBAPP_NAME_PUBLIC`, `WEBAPP_NAME_INTERNAL`
   - `WEBAPP_GROUP_PUBLIC`, `WEBAPP_GROUP_INTERNAL`
4. Delete old caller workflow files that are no longer used


## How it works

The key insight is how `secrets: inherit` and GitHub Environments interact:

1. The **caller workflow** sets `secrets: inherit`, which passes all repo-level and environment-scoped secrets to the reusable workflow.
2. The **reusable workflow's deploy job** has `environment: ${{ inputs.environment }}`, which tells GitHub to resolve `${{ secrets.X }}` and `${{ vars.X }}` from that specific environment.
3. This means `${{ secrets.DEPLOY_CREDENTIALS }}` in the reusable workflow automatically resolves to the correct credentials for the target environment; no suffixes needed.

```
Caller (deploy-public-dev.yml)
  └─ environment: dev-public + secrets: inherit
      └─ Reusable workflow (deploy job)
          └─ environment: dev-public  ← GitHub resolves secrets/vars from this environment
              ├─ secrets.DEPLOY_CREDENTIALS  → dev-public's DEPLOY_CREDENTIALS
              ├─ vars.WEBAPP_NAME            → dev-public's WEBAPP_NAME
              └─ vars.WEBAPP_GROUP           → dev-public's WEBAPP_GROUP
```


## Checklist

- [ ] GitHub Environments created (Settings → Environments)
- [ ] `DEPLOY_CREDENTIALS` secret set on each environment
- [ ] `WEBAPP_NAME` variable set on each environment
- [ ] `WEBAPP_GROUP` variable set on each environment
- [ ] `deploy-reusable.yml` updated from template
- [ ] Caller workflows updated to use `environment:` + `secrets: inherit`
- [ ] Old suffixed repo-level secrets/variables deleted
- [ ] Old caller workflow files deleted
- [ ] Test deployment via `workflow_dispatch` on each environment
