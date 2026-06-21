import { api } from "encore.dev/api";

/**
 * SPA static serving. Serves the Vite-built client bundle from ./web/build at
 * the deployment root; any path that doesn't match a built asset OR a
 * registered API route falls back to index.html so the Vue Router (HTML5
 * history mode) can handle client-side routes like /profile.
 *
 * Wiring:
 *   - `apps/web/vite.config.ts` sets build.outDir to apps/api/web/build, so
 *     `npm run build:web` lands the bundle here.
 *   - encore.app `bundle_source: true` sweeps ./web/build into the Docker image
 *     during `encore build docker`.
 *   - The `/!path` pattern is the root catch-all that yields to the more
 *     specific /api/* and /health routes registered by the other services.
 *
 * In dev, contributors run Vite on :5173 with its /api proxy → :4000; this
 * endpoint serves the committed placeholder until a real build is produced.
 *
 * Dual-app note: this serves a single SPA build. The dual-app deployment
 * (apps/web-internal) is handled by the (deferred) generator re-architecture.
 */
export const spa = api.static({
  expose: true,
  path: "/!path",
  // `dir` is resolved relative to THIS source file's directory (apps/api/web),
  // so ./build → apps/api/web/build (where apps/web/vite.config.ts builds to).
  dir: "./build",
  notFound: "./build/index.html",
});
