/**
 * Generator regression suites.
 *
 * The Express profile-composition tests (public/private/dual auth-module
 * installs, the @template/auth index, the AUTH-003 / dual-app-controller /
 * service-auth blocks) were removed in spec 009: those modules are retired and
 * Encore profile selection (AUTH_DRIVER + infra.config secrets) is covered by
 * scripts/setup-app.test.ts. The Express dual-BFF auth surfaces
 * (bff-auth.middleware.ts / requireBffOrSessionAuth / req.session /
 * x-forwarded-user) were retired with the orchestration-doc reconciliation
 * (spec 007): there is no BFF proxy passing forwarded identity headers under
 * Encore; the authHandler populates AuthData for every authenticated caller.
 * The AUTH-007 obligation survives in Encore form and the guards below assert
 * the reconciled docs teach it. The ESLint-rule and validate-modules guards are
 * runtime-agnostic and retained as-is. The migrate.ts and validate-env.ts
 * guards were dropped with those Express-era files in spec 008.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect } from 'vitest'
import { PROJECT_ROOT } from '../lib/__fixtures__/test-helpers'

// ─── AUTH-007 (Encore) regression: scaffold-feature.md role-scoped guidance ──
//
// Defect (Express era): scaffold-feature generated BFF-proxied routes with bare
// requireAuth, so external calls forwarded from the public app 401'd, and even
// once authorized returned unscoped data to external callers. Under Encore there
// is no BFF middleware: an endpoint serving both external and staff callers uses
// requireRole with ALL roles, then scopes the SQL query in the service/model
// layer on auth.roles. These guards assert scaffold-feature.md teaches that
// Encore pattern and does not reintroduce the retired Express mechanics.

describe('AUTH-007 (Encore) regression: scaffold-feature.md role-scoped guidance', () => {
  const scaffoldSrc = path.join(PROJECT_ROOT, 'orchestration', 'skills', 'scaffold-feature.md')

  it('has an AUTH-007 role-scoped data section for multi-role endpoints', () => {
    const content = fs.readFileSync(scaffoldSrc, 'utf-8')
    expect(content).toContain('AUTH-007 Role-Scoped Data')
  })

  it('uses the Encore auth idiom (getAuthData + requireRole on auth.roles)', () => {
    const content = fs.readFileSync(scaffoldSrc, 'utf-8')
    expect(content).toContain('getAuthData()')
    expect(content).toContain('requireRole(auth.roles')
  })

  it('teaches service-layer query scoping (branch on roles, scoped query)', () => {
    const content = fs.readFileSync(scaffoldSrc, 'utf-8')
    const sectionIdx = content.indexOf('AUTH-007 Role-Scoped Data')
    expect(sectionIdx).toBeGreaterThan(-1)
    const section = content.slice(sectionIdx, sectionIdx + 3000)
    expect(section).toContain('service layer')
    expect(section).toMatch(/roles\.includes\(/)
  })
})

describe('AUTH-007 (Encore) regression: validate.md role-scoped data gate', () => {
  const validateSrc = path.join(PROJECT_ROOT, 'orchestration', 'skills', 'validate.md')

  it('has an AUTH-007 role-scoped data verification check', () => {
    const content = fs.readFileSync(validateSrc, 'utf-8')
    expect(content).toContain('AUTH-007 Role-Scoped Data Verification')
  })

  it('marks an unscoped multi-role endpoint as a BLOCKER', () => {
    const content = fs.readFileSync(validateSrc, 'utf-8')
    const idx = content.indexOf('AUTH-007 Role-Scoped Data Verification')
    const section = content.slice(idx, idx + 2000)
    expect(section).toContain('BLOCKER')
  })

  it('checks for requireRole + service-layer role branching + a scoped query', () => {
    const content = fs.readFileSync(validateSrc, 'utf-8')
    const idx = content.indexOf('AUTH-007 Role-Scoped Data Verification')
    const section = content.slice(idx, idx + 2000)
    expect(section).toContain('requireRole')
    expect(section).toMatch(/roles\.includes\(/)
    expect(section).toMatch(/WHERE /)
  })
})

// ─── no-useless-escape regression: code-quality.md documents the rule ─────────
//
// Defect: AI-generated SQL column validation test files used /[\[\]]/ — escaping \[
// inside a character class where it has no special meaning. ESLint's no-useless-escape
// fires on this pattern. The rule comes from js.configs.recommended (base JS) and is
// NOT relaxed by the test-file override, so it fires in *.test.ts files.
//
// Fix: code-quality.md now documents the rule with a do/don't regex example and
// explicitly calls out that it is active in test files.

describe('no-useless-escape regression: code-quality.md documents the rule', () => {
  const codeQualitySrc = path.join(PROJECT_ROOT, 'orchestration', 'skills', 'code-quality.md')

  it('code-quality.md lists no-useless-escape in the ESLint rules section', () => {
    const content = fs.readFileSync(codeQualitySrc, 'utf-8')
    const section1End = content.indexOf('## 2. TypeScript Strict Mode Rules')
    expect(section1End).toBeGreaterThan(-1)
    expect(content.slice(0, section1End)).toContain('no-useless-escape')
  })

  it('code-quality.md explains the rule in the context of character classes', () => {
    const content = fs.readFileSync(codeQualitySrc, 'utf-8')
    const ruleIdx = content.indexOf('no-useless-escape')
    const ruleContext = content.slice(ruleIdx, ruleIdx + 500)
    expect(ruleContext).toMatch(/character class|\[\.\.\.\]/)
  })

  it('code-quality.md has a DON\'T example showing \\[ inside a character class', () => {
    const content = fs.readFileSync(codeQualitySrc, 'utf-8')
    // In the markdown source the anti-pattern literal is: [\[ (bracket, backslash, bracket)
    expect(content).toContain('[\\[')
  })

  it('code-quality.md has a DO example showing [[ (literal [ inside a character class)', () => {
    const content = fs.readFileSync(codeQualitySrc, 'utf-8')
    // The correct pattern starts with [[ — two opening brackets, then \] to close the class
    expect(content).toContain('[[\\')
  })

  it('code-quality.md notes that no-useless-escape is active in test files', () => {
    const content = fs.readFileSync(codeQualitySrc, 'utf-8')
    // The note about test-file relaxation must mention no-useless-escape is NOT relaxed
    const testRelaxIdx = content.indexOf('Relaxed in test files')
    expect(testRelaxIdx).toBeGreaterThan(-1)
    const nearbyContent = content.slice(testRelaxIdx, testRelaxIdx + 800)
    expect(nearbyContent).toContain('no-useless-escape')
  })

  it('code-quality.md is in the Hard errors table (not just a comment)', () => {
    const content = fs.readFileSync(codeQualitySrc, 'utf-8')
    // The rule must appear in the table row format: | `no-useless-escape` |
    expect(content).toContain('| `no-useless-escape`')
  })
})

// ─── no-misleading-character-class / no-irregular-whitespace regression ──────
//
// Defect: AI-generated CSV ingest service used a literal U+FEFF BOM byte inside a
// regex instead of the \uFEFF escape sequence. The literal byte is invisible, silently
// stripped by editors on save (turning /^<BOM>/ into /^/ — matches everything), and
// triggers no-irregular-whitespace (outside [...]) or no-misleading-character-class
// (inside [...]). Both rules come from js.configs.recommended and are NOT relaxed in
// test files.
//
// Fix: code-quality.md now documents both rules with a do/don't regex example and
// the general rule-of-thumb that invisible/control chars must use \uXXXX escapes.

describe('no-misleading-character-class regression: code-quality.md documents invisible Unicode rules', () => {
  const codeQualitySrc = path.join(PROJECT_ROOT, 'orchestration', 'skills', 'code-quality.md')

  it('code-quality.md lists no-irregular-whitespace in the ESLint rules section', () => {
    const content = fs.readFileSync(codeQualitySrc, 'utf-8')
    const section1End = content.indexOf('## 2. TypeScript Strict Mode Rules')
    expect(section1End).toBeGreaterThan(-1)
    expect(content.slice(0, section1End)).toContain('no-irregular-whitespace')
  })

  it('code-quality.md lists no-misleading-character-class in the ESLint rules section', () => {
    const content = fs.readFileSync(codeQualitySrc, 'utf-8')
    const section1End = content.indexOf('## 2. TypeScript Strict Mode Rules')
    expect(content.slice(0, section1End)).toContain('no-misleading-character-class')
  })

  it('code-quality.md lists both rules as table rows (not just comments)', () => {
    const content = fs.readFileSync(codeQualitySrc, 'utf-8')
    expect(content).toContain('| `no-irregular-whitespace`')
    expect(content).toContain('| `no-misleading-character-class`')
  })

  it('code-quality.md DO example uses \\uFEFF escape sequence (not literal BOM byte)', () => {
    const content = fs.readFileSync(codeQualitySrc, 'utf-8')
    // The escape sequence text must be present in the DO example
    expect(content).toContain('\\uFEFF')
    // The file must contain no literal U+FEFF bytes (BOM as content, not file header)
    // A UTF-8 file with a BOM would start with EF BB BF; ReadFileSync strips that.
    // Any U+FEFF in the string content would be a leftover literal byte — a violation.
    const bomChar = '\uFEFF'
    expect(content).not.toContain(bomChar)
  })

  it('code-quality.md warns that literal invisible bytes are silently stripped by editors', () => {
    const content = fs.readFileSync(codeQualitySrc, 'utf-8')
    expect(content).toMatch(/silently strip|stripped.*editor|editor.*strip/i)
  })

  it('code-quality.md has a rule-of-thumb for invisible/control chars in regex', () => {
    const content = fs.readFileSync(codeQualitySrc, 'utf-8')
    expect(content).toMatch(/rule of thumb|invisible.*\\\\u|\\\\u.*invisible/i)
  })

  it('code-quality.md notes that no-irregular-whitespace and no-misleading-character-class are active in test files', () => {
    const content = fs.readFileSync(codeQualitySrc, 'utf-8')
    const relaxedIdx = content.indexOf('Relaxed in test files')
    expect(relaxedIdx).toBeGreaterThan(-1)
    const nearbyContent = content.slice(relaxedIdx, relaxedIdx + 600)
    expect(nearbyContent).toContain('no-irregular-whitespace')
    expect(nearbyContent).toContain('no-misleading-character-class')
  })
})

describe('eslint.config.mjs global ignores and plain-JS override', () => {
  const eslintConfig = path.join(PROJECT_ROOT, 'eslint.config.mjs')

  it('global ignores include artifacts/**', () => {
    const content = fs.readFileSync(eslintConfig, 'utf-8')
    expect(content).toContain("'artifacts/**'")
  })

  it('global ignores include **/*.min.js', () => {
    const content = fs.readFileSync(eslintConfig, 'utf-8')
    expect(content).toContain("'**/*.min.js'")
  })

  it('global ignores include **/*.min.css', () => {
    const content = fs.readFileSync(eslintConfig, 'utf-8')
    expect(content).toContain("'**/*.min.css'")
  })

  it('plain-JS override applies to **/*.js (not scoped to scripts/ only)', () => {
    const content = fs.readFileSync(eslintConfig, 'utf-8')
    expect(content).toContain("'**/*.js'")
    expect(content).not.toContain("'scripts/**/*.js'")
  })
})

// ─── validate-modules.ts source-level regression ──────────────────────────────

describe('validate-modules.ts structural checks', () => {
  const validateModulesSrc = path.join(PROJECT_ROOT, 'scripts', 'validate-modules.ts')

  it('uses manifestSchema.parse() to validate each module manifest (not bare JSON.parse)', () => {
    const content = fs.readFileSync(validateModulesSrc, 'utf-8')
    expect(content).toContain('manifestSchema.parse(')
  })

  it('imports loadTemplateJson from ./lib/template-json', () => {
    const content = fs.readFileSync(validateModulesSrc, 'utf-8')
    expect(content).toMatch(/from ['"]\.\/lib\/template-json['"]/)
    expect(content).toContain('loadTemplateJson')
  })

  it('imports generateWebModulesTs for generated-file verification', () => {
    const content = fs.readFileSync(validateModulesSrc, 'utf-8')
    expect(content).toContain('generateWebModulesTs')
    expect(content).not.toContain('generateApiModulesTs')
  })

  it('no longer references the retired @template/auth barrel generator', () => {
    const content = fs.readFileSync(validateModulesSrc, 'utf-8')
    expect(content).not.toContain('generateAuthIndex')
  })

  it('calls process.exit(1) when errors are found', () => {
    const content = fs.readFileSync(validateModulesSrc, 'utf-8')
    expect(content).toContain('process.exit(1)')
  })

  it('checks fileOwnership to detect orphaned or missing file tracking', () => {
    const content = fs.readFileSync(validateModulesSrc, 'utf-8')
    expect(content).toContain('fileOwnership')
  })
})

// ─── AUTH-007 (Encore) regression: template-orchestrator.md feature planning ──
//
// The orchestrator's Phase 4a feature-planning step must still detect multi-role
// endpoints (consumed by both private-authenticated staff and public-authenticated
// external pages) and require the Encore three-part fix: auth:true, requireRole with
// all roles, and service-layer query scoping. The Express bff-auth.middleware
// mechanism is retired (spec 007).

describe('AUTH-007 (Encore) regression: template-orchestrator.md feature planning', () => {
  const orchSrc = path.join(PROJECT_ROOT, 'orchestration', 'template-orchestrator.md')

  it('retains the Feature Plan step', () => {
    const content = fs.readFileSync(orchSrc, 'utf-8')
    expect(content).toContain('Convert the Build Specification endpoints into a **Feature Plan**')
  })

  it('Feature Plan area flags AUTH-007 multi-role detection', () => {
    const content = fs.readFileSync(orchSrc, 'utf-8')
    const fpIdx = content.indexOf('Convert the Build Specification endpoints into a **Feature Plan**')
    expect(fpIdx).toBeGreaterThan(-1)
    const nearby = content.slice(fpIdx, fpIdx + 3000)
    expect(nearby).toContain('AUTH-007')
  })

  it('multi-role note references private- vs public-authenticated viewTypes', () => {
    const content = fs.readFileSync(orchSrc, 'utf-8')
    const idx = content.indexOf('multi-role access pattern detection (AUTH-007)')
    expect(idx).toBeGreaterThan(-1)
    const nearby = content.slice(idx, idx + 1500)
    expect(nearby).toContain('private-authenticated')
    expect(nearby).toMatch(/public-authenticated|public.*portal/)
  })

  it('requires requireRole with all roles + service-layer data scoping (Encore)', () => {
    const content = fs.readFileSync(orchSrc, 'utf-8')
    const idx = content.indexOf('multi-role access pattern detection (AUTH-007)')
    expect(idx).toBeGreaterThan(-1)
    const nearby = content.slice(idx, idx + 1500)
    expect(nearby).toContain('requireRole')
    expect(nearby).toMatch(/role-scoped data|scope.*query|scoped/i)
  })
})
