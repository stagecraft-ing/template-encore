<template>
  <div class="about-view">
    <h1 class="page-title">
      About This Template
    </h1>

    <goa-callout
      type="success"
      heading="Production Ready"
    >
      <strong>Status:</strong> Core implementation phases complete. This template is documented and ready for production use in enterprise applications. E2E test files and GitHub Actions CI/CD pipeline are pending.
    </goa-callout>

    <goa-spacer vspacing="l" />

    <goa-container>
      <h2 class="section-title">
        Enterprise Application Template
      </h2>
      <p class="lead-text">
        This template provides a production-ready foundation for enterprise applications (both public-facing and internal) with official GoA Design System integration, multi-driver authentication (SAML 2.0, Microsoft Entra ID, Mock), BFF API gateway pattern, and comprehensive security features.
      </p>

      <goa-spacer vspacing="l" />

      <h3 class="subsection-title">
        Monorepo Structure
      </h3>
      <p>This template uses npm workspaces to organize code into reusable packages and applications:</p>
      <ul class="feature-list">
        <li><strong>apps/web:</strong> Vue 3 frontend with Vite and GoA components</li>
        <li><strong>apps/api:</strong> Encore.ts backend (services + BFF API gateway)</li>
        <li><strong>packages/shared:</strong> Shared types, Zod schemas, and constants</li>
      </ul>

      <goa-spacer vspacing="l" />

      <h3 class="subsection-title">
        Architecture
      </h3>
      <p>This template uses a BFF (Backend-for-Frontend) pattern:</p>
      <ul class="feature-list">
        <li><strong>Modular:</strong> Add/remove features via Encore service modules and declarative config</li>
        <li><strong>API Gateway:</strong> Proxies authenticated requests to backend services using OAuth Client Credentials</li>
        <li><strong>Persistence:</strong> Postgres via Encore SQLDatabase; DB-backed refresh token rotation (no server sessions)</li>
      </ul>

      <goa-spacer vspacing="l" />

      <h3 class="subsection-title">
        Key Features
      </h3>
      <ul class="feature-list">
        <li><strong>Type Safety:</strong> TypeScript strict mode throughout, Zod runtime validation</li>
        <li><strong>Modern Stack:</strong> Vue 3 Composition API, Encore.ts</li>
        <li><strong>GoA Design System:</strong> Official @abgov/web-components with Vue wrappers</li>
        <li><strong>Multi-Driver Auth:</strong> SAML 2.0 (your SAML IdP), Microsoft Entra ID, Mock; multiple drivers can coexist</li>
        <li><strong>Security Hardening:</strong> Security headers, CORS, rate limiting, CSRF protection</li>
        <li><strong>Container Build:</strong> Encore container build (<code>encore build docker</code>) + self-host compose for local containerised use</li>
        <li><strong>Production Ready:</strong> Stateless JWT auth (no server sessions), error handling, health checks, logging</li>
      </ul>
    </goa-container>

    <goa-spacer vspacing="l" />

    <!-- Technology Stack -->
    <section>
      <h2 class="section-title">
        Technology Stack
      </h2>
      <div class="card-grid">
        <goa-card>
          <h3>Frontend</h3>
          <p>Vue 3, Vite, TypeScript, Pinia, Vue Router, @abgov/web-components</p>
        </goa-card>

        <goa-card>
          <h3>Backend</h3>
          <p>Encore.ts, TypeScript, Node.js 24+, stateless RS256 JWT</p>
        </goa-card>

        <goa-card>
          <h3>Persistence</h3>
          <p>Postgres via Encore SQLDatabase; Redis (optional) for rate-limit backing</p>
        </goa-card>

        <goa-card>
          <h3>Authentication</h3>
          <p>@node-saml/passport-saml (SAML 2.0)</p>
        </goa-card>

        <goa-card>
          <h3>Validation</h3>
          <p>Zod (runtime), TypeScript (compile-time)</p>
        </goa-card>

        <goa-card>
          <h3>Testing</h3>
          <p>Vitest, Playwright, encore check</p>
        </goa-card>
      </div>
    </section>

    <goa-spacer vspacing="xl" />

    <!-- Implementation Phases -->
    <section>
      <h2 class="section-title">
        Implementation Phases
      </h2>

      <goa-callout
        type="success"
        heading="Phase 1: Foundation"
      >
        <ul>
          <li>Monorepo structure with npm workspaces</li>
          <li>TypeScript configuration across all packages</li>
          <li>Vue 3 + Vite development server</li>
          <li>Encore API with health endpoint</li>
          <li>Encore container build (apps/api/Dockerfile.base + encore build docker)</li>
        </ul>
      </goa-callout>

      <goa-spacer vspacing="m" />

      <goa-callout
        type="success"
        heading="Phase 2: GoA Components and UI Shell"
      >
        <ul>
          <li>GoA web components registered and configured</li>
          <li>Vue wrapper components (Button, Input, Modal)</li>
          <li>TypeScript declarations for all components</li>
          <li>Layout system (AppLayout, AppHeader, AppFooter)</li>
          <li>Views (Home, Login, Profile, About)</li>
          <li>Vue Router with navigation and guards</li>
        </ul>
      </goa-callout>

      <goa-spacer vspacing="m" />

      <goa-callout
        type="success"
        heading="Phase 3: Mock Authentication"
      >
        <ul>
          <li>BFF authentication architecture implemented</li>
          <li>Mock driver with 3 test users (Developer, Admin, User)</li>
          <li>Stateless JWT + DB-backed refresh (SQLDatabase)</li>
          <li>Auth via authHandler + requireRole (auth:true endpoints)</li>
          <li>Pinia auth store with Vue Router guards</li>
        </ul>
      </goa-callout>

      <goa-spacer vspacing="m" />

      <goa-callout
        type="success"
        heading="Phase 4: Production Authentication + API Gateway"
      >
        <ul>
          <li>SAML 2.0 driver for external users (@node-saml/passport-saml)</li>
          <li>In-app drivers in apps/api/auth selected by AUTH_DRIVER</li>
          <li>AUTH_DRIVER env var for switching drivers</li>
          <li>BFF API gateway with OAuth Client Credentials (S2S auth)</li>
          <li>Proxy routes for private backend communication</li>
        </ul>
      </goa-callout>

      <goa-spacer vspacing="m" />

      <goa-callout
        type="success"
        heading="Phase 5: Configuration and Validation"
      >
        <ul>
          <li>Encore secrets via infra.config.json + secret() declarations</li>
          <li>Zod schemas for Web environment variables</li>
          <li>Type-safe config loader with runtime validation</li>
          <li>Deployment presets (apps/api/.env.example)</li>
          <li>npm run typecheck:api (encore check) for backend graph validation</li>
        </ul>
      </goa-callout>

      <goa-spacer vspacing="m" />

      <goa-callout
        type="success"
        heading="Phase 6: Security Hardening"
      >
        <ul>
          <li>Security headers (CSP, HSTS, Permissions-Policy) in apps/api/lib</li>
          <li>CSRF double-submit token protection in apps/api/lib/csrf</li>
          <li>Rate limiting (general + strict auth endpoints) in apps/api/lib/rate-limit</li>
          <li>Secure request logging (no PII in production logs)</li>
          <li>Security audit with npm audit (no high/critical issues)</li>
          <li>Azure compliance standards documented</li>
        </ul>
      </goa-callout>

      <goa-spacer vspacing="m" />

      <goa-callout
        type="success"
        heading="Phase 7: Testing"
      >
        <ul>
          <li>Vitest unit tests across 14 files (config, auth, API, web)</li>
          <li>encore check validates the backend application graph, topology, and types</li>
          <li>Playwright configured for E2E tests (test files pending)</li>
          <li>Test coverage reporting with V8 provider (text, JSON, HTML)</li>
          <li>CI/CD GitHub Actions workflow template in docs/TESTING.md</li>
          <li>Comprehensive TESTING.md guide with examples (920 lines)</li>
        </ul>
      </goa-callout>

      <goa-spacer vspacing="m" />

      <goa-callout
        type="success"
        heading="Phase 8: Documentation"
      >
        <p><strong>Root:</strong></p>
        <ul>
          <li><strong>README.md</strong> - Project overview, quick start, and setup instructions</li>
          <li><strong>CODEMAP.md</strong> - Code map, architecture diagrams, and conventions</li>
          <li><strong>PLACEHOLDERS.md</strong> - Placeholder tracking for template customization</li>
        </ul>
        <p><strong>docs/:</strong></p>
        <ul>
          <li><strong>AUTH-SETUP.md</strong> - Authentication driver setup (SAML, Mock)</li>
          <li><strong>DEPLOYMENT.md</strong> - Azure, OpenShift, Kubernetes deployment</li>
          <li><strong>DEVELOPMENT.md</strong> - Developer workflow and best practices</li>
          <li><strong>GOA-COMPONENTS.md</strong> - GoA Design System integration guide</li>
          <li><strong>TESTING.md</strong> - Testing strategy (unit/integration/E2E)</li>
          <li><strong>TROUBLESHOOTING.md</strong> - Common issues and solutions</li>
        </ul>
        <p><strong>Total:</strong> 11 documentation files covering all aspects of the template.</p>
      </goa-callout>
    </section>

    <goa-spacer vspacing="xl" />

    <!-- Resources -->
    <section>
      <h2 class="section-title">
        Resources
      </h2>
      <div class="card-grid">
        <goa-card>
          <h3>Alberta Design System</h3>
          <p>Official GoA design guidelines and component documentation</p>
          <a
            href="https://design.alberta.ca"
            target="_blank"
            rel="noopener noreferrer"
          >
            <goa-button
              type="tertiary"
              trailingicon="open-outline"
            >Visit Site</goa-button>
          </a>
        </goa-card>

        <goa-card>
          <h3>GoA UI Components</h3>
          <p>Source code for @abgov/web-components</p>
          <a
            href="https://github.com/GovAlta/ui-components"
            target="_blank"
            rel="noopener noreferrer"
          >
            <goa-button
              type="tertiary"
              trailingicon="logo-github"
            >GitHub</goa-button>
          </a>
        </goa-card>

        <goa-card>
          <h3>API Health Check</h3>
          <p>Check the status of the backend API</p>
          <a
            href="/health"
            target="_blank"
          >
            <goa-button
              type="tertiary"
              trailingicon="pulse"
            >Check Status</goa-button>
          </a>
        </goa-card>

        <goa-card>
          <h3>API Information</h3>
          <p>View API version and environment details</p>
          <a
            href="/api/v1/info"
            target="_blank"
          >
            <goa-button
              type="tertiary"
              trailingicon="information-circle"
            >View Info</goa-button>
          </a>
        </goa-card>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
// No script setup needed for this view
</script>

<style scoped>
.about-view {
  max-width: 100%;
}

.page-title {
  font-size: var(--goa-font-size-7);
  font-weight: 700;
  color: var(--goa-color-greyscale-black);
  margin: 0 0 var(--goa-space-l) 0;
  padding-bottom: var(--goa-space-s);
  border-bottom: 2px solid var(--goa-color-interactive-default);
}

.section-title {
  font-size: var(--goa-font-size-5);
  font-weight: 600;
  color: var(--goa-color-greyscale-black);
  margin: 0 0 var(--goa-space-l) 0;
}

.subsection-title {
  font-size: var(--goa-font-size-4);
  font-weight: 600;
  color: var(--goa-color-greyscale-black);
  margin: 0 0 var(--goa-space-m) 0;
}

.lead-text {
  color: var(--goa-color-greyscale-700);
  line-height: var(--goa-line-height-3);
  margin: 0;
}

.feature-list {
  margin: var(--goa-space-m) 0 0 var(--goa-space-l);
  color: var(--goa-color-greyscale-700);
  line-height: 1.8;
}

/* Cards */
.card-grid goa-card h3 {
  margin: 0 0 var(--goa-space-xs) 0;
  font-size: var(--goa-font-size-4);
  color: var(--goa-color-greyscale-black);
}

.card-grid goa-card p {
  margin: 0 0 var(--goa-space-m) 0;
  font-size: var(--goa-font-size-3);
  color: var(--goa-color-greyscale-700);
  line-height: var(--goa-line-height-3);
}
</style>
