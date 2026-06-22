/**
 * Single-App Setup Script (Encore.ts)
 *
 * Copies the template base (apps/, packages/, root config) into a new directory
 * and selects the auth driver for the chosen profile. Encore discovers its
 * services from the filesystem, so there is no module-list / session axis: the
 * base apps/api already ships lib/db/health/auth/gateway/web. A profile only
 * picks the default AUTH_DRIVER; optional domain modules can be composed in via
 * --with <module> (none ship by default).
 *
 * Usage:
 *   npx tsx scripts/setup-app.ts --profile <name> --dest <path> [--yes] [--dry-run] [--clean] [--no-install] [--with <module>]...
 *
 * Profiles:
 *   minimal   — mock auth (local dev)
 *   public    SAML auth (external-facing)
 *   internal  — Entra ID auth (staff-facing)
 *
 * Flags:
 *   --yes        Skip confirmation prompts
 *   --dry-run    Show the plan; make no changes
 *   --clean      No-op placeholder (no template artifacts are copied to clean)
 *   --no-install Skip npm install / encore gen client
 *   --with <m>   Compose an optional domain module (repeatable)
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { manifestSchema, type ModuleManifest } from './lib/manifest.schema'
import { composeModule } from './lib/encore-composer'

export const TEMPLATE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------------------
// Profile definitions (Encore — auth-driver axis only)
// ---------------------------------------------------------------------------

export interface Profile {
  name: string
  description: string
  authDriver: 'mock' | 'saml' | 'entra-id'
}

export const PROFILES: Record<string, Profile> = {
  minimal: {
    name: 'Minimal (Local Dev)',
    description: 'Mock auth — no external identity provider',
    authDriver: 'mock',
  },
  public: {
    name: 'Public-Facing App',
    description: 'SAML auth (your SAML IdP), external-facing',
    authDriver: 'saml',
  },
  internal: {
    name: 'Internal / Staff App',
    description: 'Entra ID auth (Azure AD) — staff-facing',
    authDriver: 'entra-id',
  },
}

// ---------------------------------------------------------------------------
// Copy: top-level entries that must NEVER be copied into a generated app.
// Everything else at the template root is copied (apps/, packages/, root
// config files). node_modules and .git are skipped anywhere in the tree.
// ---------------------------------------------------------------------------

export const EXCLUDED_TOP_LEVEL = new Set([
  'modules',
  'scripts',
  'specs',
  'standards',
  'tools',
  '.derived',
  '.claude',
  'orchestration',
  'spec-spine.toml',
  'Makefile',
  'AGENTS.md',
  'CODEMAP.md',
  'node_modules',
  '.git',
])

// Skipped anywhere in the tree (not just top level).
const SKIP_ANYWHERE = new Set(['node_modules', '.git'])

// Build-output dir basenames skipped anywhere in the tree.
const SKIP_OUTPUT_DIRS = new Set(['dist', 'build'])

// Template-relative directory paths that must be kept even though their
// basename ('build'/'dist') would otherwise be skipped. apps/api/web/build is a
// committed SPA placeholder (spec 005): the `web` service serves it via
// api.static({ dir: "./build", notFound: "./build/index.html" }) so the
// pre-build `encore run` flow has an index.html to fall back to.
const KEEP_PATHS = new Set(['apps/api/web/build'])

/**
 * Recursively copy the template base into dest, honouring the exclusion rules.
 *   - top-level entries in EXCLUDED_TOP_LEVEL are skipped
 *   - docs/encore-ts is skipped (template-only docs); the rest of docs/ is kept
 *   - node_modules/.git skipped at any depth; dist/build output dirs skipped at any depth
 */
export function copyTemplateBase(templateRoot: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })

  const walk = (srcDir: string, destDir: string, relParts: string[]): void => {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true })
    for (const entry of entries) {
      const name = entry.name
      const rel = [...relParts, name]
      const srcPath = path.join(srcDir, name)

      if (SKIP_ANYWHERE.has(name)) continue

      // Top-level exclusions
      if (relParts.length === 0 && EXCLUDED_TOP_LEVEL.has(name)) continue

      // Skip template-only docs/encore-ts/ (keep the rest of docs/)
      if (rel.length === 2 && rel[0] === 'docs' && name === 'encore-ts') continue

      if (entry.isDirectory()) {
        // Normalize separators so the comparison is platform-independent.
        const relPath = rel.join('/')
        if (SKIP_OUTPUT_DIRS.has(name) && !KEEP_PATHS.has(relPath)) continue
        const nextDest = path.join(destDir, name)
        fs.mkdirSync(nextDest, { recursive: true })
        walk(srcPath, nextDest, rel)
      } else if (entry.isFile()) {
        fs.copyFileSync(srcPath, path.join(destDir, name))
      }
      // symlinks and other types are intentionally ignored
    }
  }

  walk(templateRoot, dest, [])
}

/**
 * Set AUTH_DRIVER in <dest>/apps/api/.env.example. Replaces the existing
 * AUTH_DRIVER= line; appends one if absent. Returns true if the file was found.
 */
export function setAuthDriver(dest: string, driver: string): boolean {
  const envPath = path.join(dest, 'apps', 'api', '.env.example')
  if (!fs.existsSync(envPath)) return false

  const content = fs.readFileSync(envPath, 'utf-8')
  const lines = content.split('\n')
  let replaced = false
  const updated = lines.map((line) => {
    if (/^AUTH_DRIVER=/.test(line.trim()) || /^AUTH_DRIVER=/.test(line)) {
      replaced = true
      return `AUTH_DRIVER=${driver}`
    }
    return line
  })

  let out = updated.join('\n')
  if (!replaced) {
    out = content.trimEnd() + `\nAUTH_DRIVER=${driver}\n`
  }
  fs.writeFileSync(envPath, out, 'utf-8')
  return true
}

/** Load and parse a module manifest from the template's modules/ catalog. */
function loadModuleManifest(templateRoot: string, moduleName: string): ModuleManifest {
  const manifestPath = path.join(templateRoot, 'modules', moduleName, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Module "${moduleName}" not found at ${manifestPath}`)
  }
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  return manifestSchema.parse(raw)
}

/** Compose optional domain modules into the generated app's apps/api. */
export function composeWithModules(
  templateRoot: string,
  dest: string,
  moduleNames: string[],
): void {
  const apiDir = path.join(dest, 'apps', 'api')
  for (const moduleName of moduleNames) {
    const manifest = loadModuleManifest(templateRoot, moduleName)
    const moduleDir = path.join(templateRoot, 'modules', moduleName)
    composeModule({ moduleDir, manifest, apiDir })
  }
}

// ---------------------------------------------------------------------------
// CLI (only runs when executed directly; the functions above are unit-tested)
// ---------------------------------------------------------------------------

function parseFlagValues(argv: string[], flag: string): string[] {
  const values: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && i + 1 < argv.length) values.push(argv[i + 1])
  }
  return values
}

function parseSingleFlag(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag)
  if (idx === -1 || idx + 1 >= argv.length) return undefined
  return argv[idx + 1]
}

interface CliOptions {
  profile: Profile
  profileKey: string
  dest: string
  withModules: string[]
  dryRun: boolean
  autoYes: boolean
  clean: boolean
  noInstall: boolean
  noGit: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const profileKey = parseSingleFlag(argv, '--profile')
  const destRaw = parseSingleFlag(argv, '--dest')

  if (!profileKey || !destRaw) {
    printUsageAndExit()
  }

  const profile = PROFILES[profileKey]
  if (!profile) {
    console.error(`Error: Unknown profile "${profileKey}".`)
    console.error(`Available profiles: ${Object.keys(PROFILES).join(', ')}`)
    process.exit(1)
  }

  const noInstall = argv.includes('--no-install') || process.env.NO_INSTALL === 'true'
  return {
    profile,
    profileKey,
    dest: path.resolve(destRaw),
    withModules: parseFlagValues(argv, '--with'),
    dryRun: argv.includes('--dry-run'),
    autoYes: argv.includes('--yes'),
    clean: argv.includes('--clean'),
    noInstall,
    // `git init` is developer convenience for manual runs. Machine-driven
    // invocations (the platform's prebuilt materialization sets
    // NO_INSTALL) must NOT receive VCS state: the consumer owns
    // repository initialization. Skipped whenever the run is
    // machine-driven (noInstall) or explicitly via --no-git / NO_GIT=true.
    noGit: argv.includes('--no-git') || process.env.NO_GIT === 'true' || noInstall,
  }
}

function printUsageAndExit(): never {
  console.error('Usage: npx tsx scripts/setup-app.ts --profile <name> --dest <path> [--yes] [--dry-run] [--clean] [--no-install] [--no-git] [--with <module>]...')
  console.error('')
  console.error('Profiles:')
  for (const [key, p] of Object.entries(PROFILES)) {
    console.error(`  ${key.padEnd(10)} ${p.description}`)
  }
  process.exit(1)
}

function confirm(message: string, autoYes: boolean): Promise<boolean> {
  if (autoYes) return Promise.resolve(true)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))

  console.log('Single-App Setup (Encore.ts)')
  console.log('============================')
  console.log(`  Profile:      ${opts.profile.name}`)
  console.log(`  Description:  ${opts.profile.description}`)
  console.log(`  AUTH_DRIVER:  ${opts.profile.authDriver}`)
  console.log(`  Source:       ${TEMPLATE_ROOT}`)
  console.log(`  Dest:         ${opts.dest}`)
  if (opts.withModules.length > 0) {
    console.log(`  With modules: ${opts.withModules.join(', ')}`)
  }
  if (opts.clean) {
    console.log('  Clean:        --clean is a no-op (no template artifacts are copied)')
  }
  if (opts.dryRun) {
    console.log('\n  [DRY RUN — no changes will be made]')
    console.log(`\n  Plan:`)
    console.log(`    1. Copy template base into ${opts.dest} (excludes machinery dirs)`)
    console.log(`    2. Set AUTH_DRIVER=${opts.profile.authDriver} in apps/api/.env.example`)
    if (opts.withModules.length > 0) {
      console.log(`    3. Compose modules: ${opts.withModules.join(', ')}`)
    }
    return
  }

  if (fs.existsSync(opts.dest)) {
    const IGNORABLE = new Set(['.git', 'artifacts'])
    const entries = fs.readdirSync(opts.dest).filter((e) => !IGNORABLE.has(e))
    if (entries.length > 0) {
      throw new Error(`Destination directory "${opts.dest}" is not empty.`)
    }
  }

  const proceed = await confirm('\nProceed?', opts.autoYes)
  if (!proceed) {
    console.log('Aborted.')
    return
  }

  // 1. Copy template base
  console.log('\nStep 1: Copy template base to destination')
  copyTemplateBase(TEMPLATE_ROOT, opts.dest)
  console.log('  Template base copied')

  // 2. Set AUTH_DRIVER
  console.log('\nStep 2: Select auth driver')
  if (setAuthDriver(opts.dest, opts.profile.authDriver)) {
    console.log(`  AUTH_DRIVER=${opts.profile.authDriver} set in apps/api/.env.example`)
  } else {
    console.log('  apps/api/.env.example not found — skipped AUTH_DRIVER selection')
  }

  // 3. Compose optional domain modules
  if (opts.withModules.length > 0) {
    console.log('\nStep 3: Compose optional domain modules')
    composeWithModules(TEMPLATE_ROOT, opts.dest, opts.withModules)
    console.log(`  Composed: ${opts.withModules.join(', ')}`)
  }

  // 3b. Initialize a fresh git repo in the generated app (non-fatal).
  // The pre-P2 setup-app did this; the rewrite dropped it, leaving generated
  // apps without a repo. Best-effort: warn and continue on failure.
  // Developer-UX only — machine-driven runs skip it (see `noGit` in
  // parseArgs: the consuming platform owns repository initialization).
  if (!opts.dryRun && !opts.noGit) {
    try {
      execSync('git init', { cwd: opts.dest, stdio: 'pipe' })
      console.log('\n  Initialized destination as a git repository')
    } catch {
      console.warn('  Warning: git init failed (git not found?) — initialize the repo manually if needed')
    }
  }

  // 4. Optional install (best-effort; never hard-fail on a missing CLI)
  if (!opts.noInstall) {
    console.log('\nStep 4: Install dependencies (best-effort)')
    try {
      execSync('npm install', { cwd: opts.dest, stdio: 'inherit' })
    } catch {
      console.warn('  npm install skipped or failed (missing CLI?) — run it manually if needed')
    }
    try {
      execSync('encore gen client --output ./apps/web/src/client.ts', { cwd: opts.dest, stdio: 'inherit' })
    } catch {
      console.warn('  encore gen client skipped (encore CLI not found) — run it manually if needed')
    }
  } else {
    console.log('\nStep 4: Skipping npm install / encore gen client (--no-install)')
  }

  console.log('\nDone!')
  console.log(`
  Created ${opts.profile.name.toLowerCase()} app at: ${opts.dest}

  Profile:      ${opts.profileKey}
  AUTH_DRIVER:  ${opts.profile.authDriver}

  Next steps:
    cd ${opts.dest}
    1. Copy apps/api/.env.example to apps/api/.env and configure
    2. Run: encore run
`)
}

// Only run the CLI when executed as the entry module (keep import side-effect free for tests).
const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntry) {
  main().catch((err) => {
    console.error('Setup failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
