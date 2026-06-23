/**
 * Tests for the Encore single-app generator (spec 008).
 *
 * The setup-app CLI is split into pure, exported functions (copyTemplateBase,
 * setAuthDriver, composeWithModules) so the copy + driver-selection machinery
 * is testable without spawning a subprocess. We exercise the copy against the
 * real template root (machinery dirs excluded, apps/ present, no Express, no
 * apps/api/src) and the driver selection against each profile.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  PROFILES,
  TEMPLATE_ROOT,
  copyTemplateBase,
  setAuthDriver,
  EXCLUDED_TOP_LEVEL,
} from './setup-app'

// ─── copyTemplateBase against the real template ────────────────────────────

describe('copyTemplateBase — real template copy', () => {
  let dest: string

  beforeAll(() => {
    dest = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-copy-'))
    copyTemplateBase(TEMPLATE_ROOT, dest)
  })

  afterAll(() => {
    fs.rmSync(dest, { recursive: true, force: true })
  })

  it('includes apps/ and packages/', () => {
    expect(fs.existsSync(path.join(dest, 'apps'))).toBe(true)
    expect(fs.existsSync(path.join(dest, 'apps', 'api'))).toBe(true)
    expect(fs.existsSync(path.join(dest, 'packages'))).toBe(true)
  })

  it('includes root config files', () => {
    expect(fs.existsSync(path.join(dest, 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(dest, 'eslint.config.mjs'))).toBe(true)
  })

  it('excludes every machinery top-level entry', () => {
    for (const excluded of EXCLUDED_TOP_LEVEL) {
      // node_modules/.git are skipped anywhere; the rest must be absent at top level
      expect(fs.existsSync(path.join(dest, excluded))).toBe(false)
    }
  })

  it('does not copy node_modules anywhere in the tree', () => {
    const found: string[] = []
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') {
            found.push(path.join(dir, entry.name))
            continue
          }
          walk(path.join(dir, entry.name))
        }
      }
    }
    walk(dest)
    expect(found).toEqual([])
  })

  it('keeps docs/ but excludes docs/encore-ts (template-only)', () => {
    expect(fs.existsSync(path.join(dest, 'docs'))).toBe(true)
    expect(fs.existsSync(path.join(dest, 'docs', 'encore-ts'))).toBe(false)
  })

  it('contains no apps/api/src directory (Encore has no Express src tree)', () => {
    expect(fs.existsSync(path.join(dest, 'apps', 'api', 'src'))).toBe(false)
  })

  it('keeps the tracked SPA placeholder apps/api/web/build/index.html (spec 005)', () => {
    // build/ is normally skipped by basename, but this committed placeholder is
    // required by the web service's api.static({ notFound: "./build/index.html" }).
    expect(fs.existsSync(path.join(dest, 'apps', 'api', 'web', 'build', 'index.html'))).toBe(true)
  })

  it('apps/api (the Encore backend) declares no express / express-session dependency', () => {
    const apiPkg = JSON.parse(fs.readFileSync(path.join(dest, 'apps', 'api', 'package.json'), 'utf-8'))
    const deps = { ...(apiPkg.dependencies ?? {}), ...(apiPkg.devDependencies ?? {}) }
    expect('express' in deps).toBe(false)
    expect('express-session' in deps).toBe(false)
  })

  // The generator copies the base verbatim. Spec 008 retired the Express-era
  // packages/auth (the last package.json that declared express), so a generated
  // app must contain zero express / express-session offenders anywhere.
  it('produces an app with no express dependency anywhere', () => {
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') continue
          walk(full)
        } else if (entry.name === 'package.json') {
          const pkg = JSON.parse(fs.readFileSync(full, 'utf-8'))
          const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
          if ('express' in deps || 'express-session' in deps) {
            offenders.push(path.relative(dest, full).replace(/\\/g, '/'))
          }
        }
      }
    }
    walk(dest)
    expect(offenders).toEqual([])
  })
})

// ─── setAuthDriver per profile ─────────────────────────────────────────────

describe('setAuthDriver — per profile', () => {
  let dest: string

  beforeAll(() => {
    dest = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-driver-'))
    copyTemplateBase(TEMPLATE_ROOT, dest)
  })

  afterAll(() => {
    fs.rmSync(dest, { recursive: true, force: true })
  })

  for (const [key, profile] of Object.entries(PROFILES)) {
    it(`sets AUTH_DRIVER=${profile.authDriver} for profile "${key}"`, () => {
      const ok = setAuthDriver(dest, profile.authDriver)
      expect(ok).toBe(true)
      const env = fs.readFileSync(path.join(dest, 'apps', 'api', '.env.example'), 'utf-8')
      expect(env).toMatch(new RegExp(`^AUTH_DRIVER=${profile.authDriver}$`, 'm'))
      // exactly one AUTH_DRIVER= line (replaced, not duplicated)
      const count = env.split('\n').filter((l) => /^AUTH_DRIVER=/.test(l)).length
      expect(count).toBe(1)
    })
  }
})

describe('setAuthDriver — append when absent', () => {
  let dest: string

  beforeAll(() => {
    dest = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-driver-append-'))
    fs.mkdirSync(path.join(dest, 'apps', 'api'), { recursive: true })
    fs.writeFileSync(path.join(dest, 'apps', 'api', '.env.example'), '# config\nNODE_ENV=development\n')
  })

  afterAll(() => {
    fs.rmSync(dest, { recursive: true, force: true })
  })

  it('appends AUTH_DRIVER when the file has none', () => {
    expect(setAuthDriver(dest, 'rauthy')).toBe(true)
    const env = fs.readFileSync(path.join(dest, 'apps', 'api', '.env.example'), 'utf-8')
    expect(env).toMatch(/^AUTH_DRIVER=rauthy$/m)
    expect(env).toContain('NODE_ENV=development')
  })

  it('returns false when apps/api/.env.example is absent', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-noenv-'))
    expect(setAuthDriver(empty, 'mock')).toBe(false)
    fs.rmSync(empty, { recursive: true, force: true })
  })
})

// ─── profile definitions ───────────────────────────────────────────────────

describe('PROFILES', () => {
  it('defines minimal/public/internal with the expected drivers', () => {
    expect(PROFILES.minimal.authDriver).toBe('mock')
    expect(PROFILES.public.authDriver).toBe('rauthy')
    expect(PROFILES.internal.authDriver).toBe('rauthy')
  })
})
