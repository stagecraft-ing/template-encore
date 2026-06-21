import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import * as readline from 'node:readline'
import { manifestSchema, type ModuleManifest } from './lib/manifest.schema'
import {
  loadTemplateJson,
  saveTemplateJson,
  isModuleInstalled,
  addModuleToState,
  removeModuleFromState,
  getFileOwner,
  type TemplateJson,
} from './lib/template-json'
import { generateWebModulesTs } from './lib/modules-ts-generator'
import { mergeEnvVars, commentOutEnvVars } from './lib/env-merger'
import { composeModule } from './lib/encore-composer'

// Allow --root <path> or ROOT env var to override the destination project root.
// This lets the orchestrator invoke add-module.ts from the template cache
// while targeting a different destination project.
//
// PROJECT_ROOT  — destination project (template.json, apps/, packages/, .env.example)
// MODULES_ROOT  — where modules/ catalog lives (always the script's own repo)
//
// When --root is NOT set both point to the same directory (normal developer usage).
// When --root IS set PROJECT_ROOT = destination, MODULES_ROOT = template cache.
const _scriptDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const _rootArgIdx = process.argv.indexOf('--root')
const _rootOverride = _rootArgIdx !== -1 ? process.argv[_rootArgIdx + 1] : process.env.ROOT
const PROJECT_ROOT = _rootOverride ? path.resolve(_rootOverride) : _scriptDir
const MODULES_ROOT = _scriptDir

function loadModuleManifest(moduleName: string): ModuleManifest {
  const manifestPath = path.join(MODULES_ROOT, 'modules', moduleName, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Module "${moduleName}" not found at ${manifestPath}`)
  }
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  return manifestSchema.parse(raw)
}

function listAvailableModules(): void {
  const modulesDir = path.join(MODULES_ROOT, 'modules')
  if (!fs.existsSync(modulesDir)) {
    console.log('No modules directory found.')
    return
  }
  const dirs = fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  console.log('Available modules:')
  for (const dir of dirs) {
    try {
      const manifest = loadModuleManifest(dir)
      const status = manifest.status === 'planned' ? ' (planned)' : ''
      console.log(`  ${dir} — ${manifest.description}${status}`)
    } catch {
      console.log(`  ${dir} — (invalid manifest)`)
    }
  }
}

function removePackageDeps(deps: Record<string, Record<string, string>>): void {
  for (const [workspace, packages] of Object.entries(deps)) {
    const pkgPath = path.join(PROJECT_ROOT, workspace, 'package.json')
    if (!fs.existsSync(pkgPath)) continue
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    for (const dep of Object.keys(packages)) {
      if (pkg.dependencies?.[dep]) delete pkg.dependencies[dep]
      if (pkg.devDependencies?.[dep]) delete pkg.devDependencies[dep]
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
  }
}

function addPackageDeps(deps: Record<string, Record<string, string>>): void {
  for (const [workspace, packages] of Object.entries(deps)) {
    const pkgPath = path.join(PROJECT_ROOT, workspace, 'package.json')
    if (!fs.existsSync(pkgPath)) continue
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    if (!pkg.dependencies) pkg.dependencies = {}
    for (const [dep, version] of Object.entries(packages)) {
      pkg.dependencies[dep] = version
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
  }
}

function reverseWorkspaces(changes: NonNullable<ModuleManifest['workspaceChanges']>): void {
  const pkgPath = path.join(PROJECT_ROOT, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  const workspaces: string[] = pkg.workspaces ?? []

  if (changes.add) {
    pkg.workspaces = workspaces.filter((w: string) => !changes.add!.includes(w))
  }
  if (changes.remove) {
    for (const w of changes.remove) {
      if (!workspaces.includes(w)) pkg.workspaces.push(w)
    }
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
}

function applyWorkspaces(changes: NonNullable<ModuleManifest['workspaceChanges']>): void {
  const pkgPath = path.join(PROJECT_ROOT, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  const workspaces: string[] = pkg.workspaces ?? []

  if (changes.add) {
    for (const w of changes.add) {
      if (!workspaces.includes(w)) workspaces.push(w)
    }
  }
  if (changes.remove) {
    pkg.workspaces = workspaces.filter((w: string) => !changes.remove!.includes(w))
  } else {
    pkg.workspaces = workspaces
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
}

function autoRemoveModule(name: string, state: TemplateJson): TemplateJson {
  console.log(`  Auto-removing conflicting module: ${name}`)
  let conflictManifest: ModuleManifest | null = null
  try {
    conflictManifest = loadModuleManifest(name)
  } catch {
    // manifest may not exist, just remove from state
  }

  // Delete owned files
  const filesToDelete = Object.entries(state.fileOwnership)
    .filter(([, owner]) => owner === name)
    .map(([filePath]) => filePath)

  for (const filePath of filesToDelete) {
    const fullPath = path.resolve(PROJECT_ROOT, filePath)
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
      console.log(`    Deleted: ${filePath}`)
    }
  }

  const updatedState = removeModuleFromState(state, name)
  saveTemplateJson(PROJECT_ROOT, updatedState)

  if (conflictManifest) {
    if (Object.keys(conflictManifest.packageDeps).length > 0) {
      removePackageDeps(conflictManifest.packageDeps)
    }
    if (Object.keys(conflictManifest.envVars).length > 0) {
      commentOutEnvVars(PROJECT_ROOT, conflictManifest)
    }
    if (conflictManifest.workspaceChanges) {
      reverseWorkspaces(conflictManifest.workspaceChanges)
    }
  }

  return updatedState
}

function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}

async function addModule(moduleName: string, options: { skipConfirm: boolean; dryRun: boolean; noInstall: boolean }): Promise<void> {
  // Step 1: Load manifest
  console.log(`\nInstalling module: ${moduleName}`)
  const manifest = loadModuleManifest(moduleName)

  // Step 2: Validate status
  if (manifest.status !== 'stable') {
    throw new Error(`Module "${moduleName}" has status "${manifest.status}" — only stable modules can be installed`)
  }

  // Step 3: Load state
  let state = loadTemplateJson(PROJECT_ROOT)

  // Step 4: Check if already installed
  if (isModuleInstalled(state, moduleName)) {
    console.log(`  Module "${moduleName}" is already installed. Re-installing...`)
  }

  // Step 5: Check and auto-remove conflicts
  const installedConflicts = manifest.conflicts.filter((c) => isModuleInstalled(state, c))
  if (installedConflicts.length > 0) {
    console.log(`\nConflicts detected: ${installedConflicts.join(', ')}`)
    for (const conflict of installedConflicts) {
      state = autoRemoveModule(conflict, state)
    }
  }

  // Step 6: Check requires (auto-install missing dependencies)
  for (const req of manifest.requires) {
    if (!isModuleInstalled(state, req)) {
      console.log(`\n  Dependency "${req}" is not installed — installing automatically...`)
      await addModule(req, { skipConfirm: true, dryRun: options.dryRun, noInstall: options.noInstall })
      state = loadTemplateJson(PROJECT_ROOT)
    }
  }

  // Step 7: Check requiresOneOf
  for (const group of manifest.requiresOneOf) {
    const satisfied = group.some((m) => isModuleInstalled(state, m))
    if (!satisfied) {
      throw new Error(
        `Dependency not met: at least one of [${group.join(', ')}] must be installed before "${moduleName}"`,
      )
    }
  }

  // Step 8: Pre-check file destinations
  const fileEntries = Object.entries(manifest.files)
  for (const [, dest] of fileEntries) {
    const fullDest = path.resolve(PROJECT_ROOT, dest)
    if (!fs.existsSync(fullDest)) continue // New file, OK

    const owner = getFileOwner(state, dest)
    if (owner === moduleName) continue // Re-install, OK
    if (owner && manifest.requires.includes(owner)) continue // Allowed overwrite
    if (owner) {
      throw new Error(
        `File conflict: "${dest}" is owned by module "${owner}". Cannot install "${moduleName}".`,
      )
    }
    // Untracked file
    console.log(`  Warning: "${dest}" exists but is untracked. Will be overwritten.`)
  }

  // Step 9: Summary and confirmation
  console.log(`\nModule: ${manifest.name} v${manifest.version}`)
  console.log(`Description: ${manifest.description}`)
  console.log(`Files to install: ${fileEntries.length}`)
  if (manifest.authExports.length > 0) console.log(`Auth exports: ${manifest.authExports.length}`)
  if (Object.keys(manifest.envVars).length > 0)
    console.log(`Env vars: ${Object.keys(manifest.envVars).length}`)

  if (options.dryRun) {
    console.log('\n[dry-run] No changes made.')
    return
  }

  if (!options.skipConfirm) {
    const ok = await confirm('\nProceed with installation?')
    if (!ok) {
      console.log('Aborted.')
      return
    }
  }

  // Step 10: Copy files
  for (const [src, dest] of fileEntries) {
    const srcPath = path.join(MODULES_ROOT, 'modules', moduleName, 'files', src)
    const destPath = path.resolve(PROJECT_ROOT, dest)
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.copyFileSync(srcPath, destPath)
    console.log(`  Copied: ${dest}`)
  }

  // Step 11: Update template.json
  state = addModuleToState(state, moduleName, manifest.version, manifest.files)
  saveTemplateJson(PROJECT_ROOT, state)
  console.log('  Updated template.json')

  // Step 11b: Compose Encore services (copy service dirs, merge migrations/secrets/cors)
  const moduleDir = path.join(MODULES_ROOT, 'modules', moduleName)
  const apiDir = path.join(PROJECT_ROOT, 'apps', 'api')
  if (
    manifest.services.length > 0 ||
    manifest.migrations.length > 0 ||
    manifest.secrets.length > 0 ||
    manifest.corsEntries.length > 0
  ) {
    const { migrationsAdded, secretsAdded } = composeModule({ moduleDir, manifest, apiDir })
    if (manifest.services.length > 0) console.log(`  Composed services: ${manifest.services.join(', ')}`)
    if (migrationsAdded.length > 0) console.log(`  Added migrations: ${migrationsAdded.join(', ')}`)
    if (secretsAdded.length > 0) console.log(`  Added secret bindings: ${secretsAdded.join(', ')}`)
    if (manifest.corsEntries.length > 0) console.log('  Merged CORS entries into encore.app')

    // Record the exact renumbered migration filenames so a later remove deletes
    // precisely these files (and not a sibling module's collision-tail file).
    state.modules[moduleName].composedMigrations = migrationsAdded
    saveTemplateJson(PROJECT_ROOT, state)
  }

  // Step 14: Regenerate web modules.ts
  const webModulesContent = generateWebModulesTs(PROJECT_ROOT, state)
  const webModulesPath = path.join(PROJECT_ROOT, 'apps/web/src/modules.ts')
  if (webModulesContent) {
    fs.writeFileSync(webModulesPath, webModulesContent, 'utf-8')
    console.log('  Regenerated apps/web/src/modules.ts')
  }

  // Step 15: Merge env vars
  if (Object.keys(manifest.envVars).length > 0) {
    const { added, skipped } = mergeEnvVars(PROJECT_ROOT, manifest)
    if (added.length > 0) console.log(`  Added env vars: ${added.join(', ')}`)
    if (skipped.length > 0) console.log(`  Skipped existing env vars: ${skipped.join(', ')}`)
  }

  // Step 16: Apply workspace changes
  if (manifest.workspaceChanges) {
    applyWorkspaces(manifest.workspaceChanges)
    console.log('  Updated root package.json workspaces')
  }

  // Step 17: Add package deps
  if (Object.keys(manifest.packageDeps).length > 0) {
    addPackageDeps(manifest.packageDeps)
    console.log('  Added package dependencies')
  }

  // Step 18: npm install + build
  if (options.noInstall) {
    console.log('  Skipping npm install (--no-install)')
  } else {
    console.log('  Running npm install...')
    try {
      execSync('npm install', { cwd: PROJECT_ROOT, stdio: 'inherit' })
    } catch {
      console.warn('  Warning: npm install had issues. You may need to run it manually.')
    }

    console.log('  Building workspace packages...')
    try {
      execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' })
    } catch {
      console.warn('  Warning: build had issues. You may need to run `npm run build` manually.')
    }
  }

  // Show optional peers
  if (manifest.optionalPeers.length > 0) {
    const uninstalled = manifest.optionalPeers.filter((p) => !isModuleInstalled(state, p))
    if (uninstalled.length > 0) {
      console.log(`\nSuggested optional modules: ${uninstalled.join(', ')}`)
    }
  }

  console.log(`\nModule "${moduleName}" installed successfully.`)
}

// CLI entry point
const args = process.argv.slice(2)
const skipConfirm = args.includes('--yes')
const showList = args.includes('--list')
const dryRun = args.includes('--dry-run')
const noInstall = args.includes('--no-install') || process.env.NO_INSTALL === 'true'
// Exclude --root <value> from positional arg detection
const _rootIdx = args.indexOf('--root')
const _rootValueIdx = _rootIdx !== -1 ? _rootIdx + 1 : -1
const moduleName = args.find((a, i) => !a.startsWith('--') && i !== _rootValueIdx)

if (showList) {
  listAvailableModules()
} else if (!moduleName) {
  console.error('Usage: npx tsx scripts/add-module.ts <module-name> [--yes] [--list] [--dry-run] [--no-install] [--root <path>]')
  process.exit(1)
} else {
  void (async () => {
    try {
      await addModule(moduleName, { skipConfirm, dryRun, noInstall })
    } catch (err) {
      console.error(`\nError: ${(err as Error).message}`)
      process.exit(1)
    }
  })()
}
