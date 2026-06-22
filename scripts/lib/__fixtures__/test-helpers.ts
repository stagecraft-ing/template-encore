import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { TemplateJson } from '../template-json'

export const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..')
export const REAL_MODULES_DIR = path.join(PROJECT_ROOT, 'modules')

export function buildEmptyState(): TemplateJson {
  return {
    templateName: 'template-encore',
    baseVersion: '3.0.0',
    modules: {},
    fileOwnership: {},
  }
}

export function buildStateWithModules(
  modules: Record<string, { version?: string; alwaysOn?: boolean; files?: Record<string, string> }>,
): TemplateJson {
  const state = buildEmptyState()
  for (const [name, opts] of Object.entries(modules)) {
    state.modules[name] = {
      version: opts.version ?? '1.0.0',
      installedAt: '2025-01-01',
      ...(opts.alwaysOn ? { alwaysOn: true } : {}),
    }
    if (opts.files) {
      for (const [, dest] of Object.entries(opts.files)) {
        state.fileOwnership[dest] = name
      }
    }
  }
  return state
}

export function createTempProjectDir(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-test-'))

  // Create minimal project structure
  fs.writeFileSync(
    path.join(tmpDir, 'template.json'),
    JSON.stringify(buildEmptyState(), null, 2) + '\n',
  )
  fs.writeFileSync(path.join(tmpDir, '.env.example'), '# Environment variables\nNODE_ENV=development\n')
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({ name: 'test-project', workspaces: ['apps/*', 'packages/*'] }, null, 2) + '\n',
  )

  // Create workspace directories and minimal package.json files. The Encore
  // base app has no apps/api/src/** tree (services are top-level dirs); module
  // payloads now land in apps/web/** (frontend) or compose Encore service dirs,
  // so only the workspace roots are pre-seeded here.
  const dirs = [
    'apps/api',
    'apps/web/src',
  ]
  for (const dir of dirs) {
    fs.mkdirSync(path.join(tmpDir, dir), { recursive: true })
  }

  fs.writeFileSync(
    path.join(tmpDir, 'apps/api/package.json'),
    JSON.stringify({ name: '@template/api', dependencies: {} }, null, 2) + '\n',
  )

  return tmpDir
}

/**
 * Copy real module manifests and create stub source files in a temp project dir.
 */
export function copyModulesToTempDir(tmpDir: string, moduleNames: string[]): void {
  for (const name of moduleNames) {
    const srcManifestPath = path.join(REAL_MODULES_DIR, name, 'manifest.json')
    if (!fs.existsSync(srcManifestPath)) continue

    // Copy manifest
    const destModuleDir = path.join(tmpDir, 'modules', name)
    fs.mkdirSync(destModuleDir, { recursive: true })
    fs.copyFileSync(srcManifestPath, path.join(destModuleDir, 'manifest.json'))

    // Create stub source files
    const manifest = JSON.parse(fs.readFileSync(srcManifestPath, 'utf-8'))
    const files: Record<string, string> = manifest.files ?? {}
    for (const src of Object.keys(files)) {
      const stubPath = path.join(destModuleDir, 'files', src)
      fs.mkdirSync(path.dirname(stubPath), { recursive: true })
      fs.writeFileSync(stubPath, '// stub\n')
    }
  }
}

export function cleanTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

export function readRealManifest(moduleName: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.join(REAL_MODULES_DIR, moduleName, 'manifest.json'), 'utf-8'),
  ) as Record<string, unknown>
}

// The auth-* / service-auth modules were retired in spec 009 (auth-driver
// selection is configuration over the in-app drivers, not file-copy modules).
// These four are the surviving cross-cutting/infra modules; their own Encore
// reconciliation is staged by the taxonomy (spec 008), not P3.
export const ALL_MODULE_NAMES = [
  'api-gateway',
  'data-postgres',
  'data-redis',
  'security-core',
]

/**
 * Recursively copy a REAL module from the repo's modules/ catalog into a temp
 * project dir (manifest + files/** + web snippet), so service-composition can
 * be exercised against the actual payload (not the stubbed files that
 * copyModulesToTempDir creates). Returns the copied module directory.
 */
export function copyRealModule(tmpDir: string, moduleName: string): string {
  const src = path.join(REAL_MODULES_DIR, moduleName)
  const dest = path.join(tmpDir, 'modules', moduleName)
  fs.cpSync(src, dest, { recursive: true })
  return dest
}

/**
 * Write a v2 (Encore) service module under `<dir>/widget/` for composer tests.
 *
 * Layout produced:
 *   <dir>/widget/manifest.json
 *   <dir>/widget/files/widget/encore.service.ts
 *   <dir>/widget/files/widget/widget.ts
 *   <dir>/widget/files/db/1_widget.up.sql
 *
 * The manifest declares one service, one migration, one secret, and one CORS
 * entry — exactly the surface composeModule / decomposeModule operate on.
 * Returns the module directory (`<dir>/widget`).
 */
export function makeFixtureServiceModule(dir: string): string {
  const moduleName = 'widget'
  const moduleDir = path.join(dir, moduleName)
  const filesDir = path.join(moduleDir, 'files')

  const manifest = {
    name: moduleName,
    version: '1.0.0',
    description: 'Fixture Encore service module for composer tests',
    status: 'stable',
    services: ['widget'],
    migrations: [{ source: 'db/1_widget.up.sql', description: 'create widget table' }],
    secrets: [{ name: 'WIDGET_API_KEY', description: 'widget upstream API key', required: true }],
    corsEntries: [{ field: 'allow_headers', values: ['X-Widget'] }],
  }

  fs.mkdirSync(path.join(filesDir, 'widget'), { recursive: true })
  fs.mkdirSync(path.join(filesDir, 'db'), { recursive: true })

  fs.writeFileSync(path.join(moduleDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  fs.writeFileSync(
    path.join(filesDir, 'widget', 'encore.service.ts'),
    "import { Service } from 'encore.dev/service'\nexport default new Service('widget')\n",
  )
  fs.writeFileSync(
    path.join(filesDir, 'widget', 'widget.ts'),
    "import { api } from 'encore.dev/api'\nexport const ping = api({ expose: true, method: 'GET', path: '/widget' }, async () => ({ ok: true }))\n",
  )
  fs.writeFileSync(
    path.join(filesDir, 'db', '1_widget.up.sql'),
    'CREATE TABLE widget ( id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL );\n',
  )

  return moduleDir
}

/**
 * Write a minimal Encore `apps/api` directory under `<dir>/apps/api` for
 * composer integration tests. Seeds db/migrations with `1_*.up.sql` and
 * `2_*.up.sql` so renumbering must pick the next free prefix (3), an
 * infra.config.json with one existing secret, and an encore.app with a
 * global_cors block. Returns the apps/api directory path.
 */
export function makeFixtureApiDir(dir: string): string {
  const apiDir = path.join(dir, 'apps', 'api')
  const migrationsDir = path.join(apiDir, 'db', 'migrations')
  fs.mkdirSync(migrationsDir, { recursive: true })

  fs.writeFileSync(path.join(migrationsDir, '1_init.up.sql'), 'CREATE TABLE init ( id BIGSERIAL PRIMARY KEY );\n')
  fs.writeFileSync(path.join(migrationsDir, '2_users.up.sql'), 'CREATE TABLE users ( id BIGSERIAL PRIMARY KEY );\n')

  const infra = {
    $schema: 'https://encore.dev/schemas/infra.schema.json',
    secrets: {
      JWT_PRIVATE_KEY: { $env: 'JWT_PRIVATE_KEY' },
    },
    sql_servers: [],
  }
  fs.writeFileSync(path.join(apiDir, 'infra.config.json'), JSON.stringify(infra, null, 2) + '\n')

  const encoreApp = {
    id: '',
    lang: 'typescript',
    global_cors: {
      allow_headers: ['Authorization', 'Content-Type'],
      allow_origins_with_credentials: ['http://localhost:5173'],
    },
  }
  fs.writeFileSync(path.join(apiDir, 'encore.app'), JSON.stringify(encoreApp, null, 2) + '\n')

  return apiDir
}
