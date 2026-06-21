/**
 * Clean Template Artifacts
 *
 * Removes template-specific files and directories that are not needed
 * after initial project setup. Run this after setup is complete.
 *
 * Usage:
 *   npx tsx scripts/clean-template.ts [--yes] [--dry-run]
 *
 * What gets removed:
 *   - modules/              Module catalog (source definitions)
 *   - node_modules/         Installed dependencies (run npm install after setup)
 *   - samples/              Sample migration SQL files (reference material)
 *   - scripts/lib/          Module orchestrator library code
 *   - scripts/integration/  Module system integration tests
 *   - scripts/codemaps/     Profile-specific CODEMAP templates
 *   - scripts/readmes/      Profile-specific README templates
 *   - scripts/setup-app.ts       Single-app setup script
 *   - scripts/setup-dual-app.ts  Dual-app setup script
 *   - scripts/clean-template.ts  This script itself
 *   - scripts/vitest.config.ts   Module test config
 *   - scripts/add-module.ts      Module installer (requires modules/ catalog)
 *   - scripts/remove-module.ts   Module remover (requires modules/ catalog)
 *   - scripts/validate-modules.ts Module validator (requires modules/ catalog)
 *   - docs/ (template-only) MODULARIZATION-SPEC.md, MODULARIZATION-OVERVIEW.md,
 *                           MODULE-DEVELOPMENT-GUIDE.md, TEMPLATE-USER-GUIDE.md,
 *                           DUAL-APP-GUIDE.md
 *   - CLAUDE.md             Claude Code project instructions
 *   - .claude/              Claude Code project settings
 *
 * What is kept:
 *   - scripts/add-module.ts       Module management (ongoing use)
 *   - scripts/remove-module.ts    Module management (ongoing use)
 *   - scripts/validate-modules.ts Module validation (ongoing use)
 *   - template.json               Module state tracking (needed by add/remove)
 *   - docs/ (project-relevant)    AUTH-SETUP, DEPLOYMENT, DEVELOPMENT, TESTING, etc.
 *   - All app code, packages/shared, Docker files
 *
 * Note: the Encore app applies migrations on `encore run` (and via
 * apps/api/scripts/migrate.mjs for self-host); the Express-era root migration
 * toolchain and the @template/config env validator were retired in spec 064.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'

// Use cwd so this script cleans wherever it is invoked from.
// When called by setup-app.ts via `execSync(..., { cwd: DEST })`, this is DEST.
// When run manually from the project root, this is the project root.
const PROJECT_ROOT = process.cwd()
const DRY_RUN = process.argv.includes('--dry-run')
const AUTO_YES = process.argv.includes('--yes')

// ---------------------------------------------------------------------------
// Artifacts to remove
// ---------------------------------------------------------------------------

/** Directories to remove entirely */
const DIRS_TO_REMOVE = [
  'modules',
  'node_modules',
  'samples',
  'scripts/lib',
  'scripts/integration',
  'scripts/codemaps',
  'scripts/readmes',
  '.claude',
]

/** Individual files to remove */
const FILES_TO_REMOVE = [
  'scripts/setup-app.ts',
  'scripts/setup-dual-app.ts',
  'scripts/clean-template.ts',
  'scripts/vitest.config.ts',
  'scripts/add-module.ts',
  'scripts/remove-module.ts',
  'scripts/validate-modules.ts',
  'docs/MODULARIZATION-SPEC.md',
  'docs/MODULARIZATION-OVERVIEW.md',
  'docs/MODULE-DEVELOPMENT-GUIDE.md',
  'docs/TEMPLATE-USER-GUIDE.md',
  'docs/DUAL-APP-GUIDE.md',
  'CLAUDE.md',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string): void {
  console.log(`  ${msg}`)
}

async function confirm(message: string): Promise<boolean> {
  if (AUTO_YES) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}

function removeDir(dirPath: string): void {
  const fullPath = path.join(PROJECT_ROOT, dirPath)
  if (!fs.existsSync(fullPath)) {
    log(`  skip: ${dirPath} (not found)`)
    return
  }
  if (DRY_RUN) {
    log(`  [dry-run] would remove ${dirPath}/`)
    return
  }
  fs.rmSync(fullPath, { recursive: true, force: true })
  log(`  removed: ${dirPath}/`)
}

function removeFile(filePath: string): void {
  const fullPath = path.join(PROJECT_ROOT, filePath)
  if (!fs.existsSync(fullPath)) {
    log(`  skip: ${filePath} (not found)`)
    return
  }
  if (DRY_RUN) {
    log(`  [dry-run] would remove ${filePath}`)
    return
  }
  fs.unlinkSync(fullPath)
  log(`  removed: ${filePath}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Clean Template Artifacts')
  console.log('========================')
  console.log('')
  console.log('This removes template-specific files that are not needed after setup:')
  console.log('')

  // Show what will be removed
  console.log('Directories:')
  for (const dir of DIRS_TO_REMOVE) {
    const exists = fs.existsSync(path.join(PROJECT_ROOT, dir))
    console.log(`  ${exists ? '✓' : '·'} ${dir}/`)
  }

  console.log('')
  console.log('Files:')
  for (const file of FILES_TO_REMOVE) {
    const exists = fs.existsSync(path.join(PROJECT_ROOT, file))
    console.log(`  ${exists ? '✓' : '·'} ${file}`)
  }

  console.log('')
  console.log('Kept (ongoing use):')
  console.log('  · scripts/add-module.ts, remove-module.ts, validate-modules.ts')
  console.log('  · template.json, docs/AUTH-SETUP.md, docs/DEPLOYMENT.md, etc.')
  console.log('')
  console.log('Note: node_modules/ will be removed — run `npm install` after cleanup.')

  if (DRY_RUN) {
    console.log('\n  [DRY RUN MODE — no changes will be made]\n')
  }

  const proceed = await confirm('\nProceed with cleanup?')
  if (!proceed) {
    console.log('Aborted.')
    process.exit(0)
  }

  console.log('')
  console.log('Removing directories...')
  for (const dir of DIRS_TO_REMOVE) {
    removeDir(dir)
  }

  console.log('')
  console.log('Removing files...')
  for (const file of FILES_TO_REMOVE) {
    removeFile(file)
  }

  // Clean up empty scripts/lib/__fixtures__ if parent was removed
  // (already handled by recursive removal of scripts/lib)

  console.log('')
  console.log('Done! Template artifacts have been removed.')
  console.log('')
  console.log('Your project is clean and ready for development.')
  console.log('Run `npm install` to reinstall dependencies.')
}

main().catch((err) => {
  console.error('Cleanup failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
