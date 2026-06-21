{
  // App ID is assigned by the Encore platform once you link this project.
  // For self-hosted-only use, leave it empty.
  "id": "",
  "lang": "typescript",

  // Bundle the source tree into the docker image so scripts/migrate.mjs and
  // the static SPA build can be read at runtime. Required for the
  // `encore build docker --base <custom>` flow.
  "build": {
    "docker": {
      "bundle_source": true
    }
  },

  // CORS — replaces the per-request Express `cors` middleware. Credentialed
  // origins MUST list every origin the SPA is served from (the Vue dev
  // servers + any production hostnames). Edit before going to production.
  "global_cors": {
    "debug": false,

    // Unauthenticated requests (no cookies / HTTP auth / client certs).
    "allow_origins_without_credentials": ["*"],

    // Authenticated requests (cookies or Authorization header). The browser
    // rejects anything not on this list, so it MUST match every SPA origin.
    //   5173 = apps/web (public portal) Vite dev server
    //   5174 = apps/web-internal (staff portal) Vite dev server
    //   4000 = Encore API (same-origin in production single-app deploys)
    "allow_origins_with_credentials": [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:4000"
    ],

    // Request headers the browser is allowed to send. Mirrors the Express
    // `cors` allowedHeaders plus the CSRF + correlation-id headers the SPA
    // attaches on every state-changing request.
    "allow_headers": [
      "Authorization",
      "Content-Type",
      "X-CSRF-Token",
      "X-Request-Id",
      "X-Requested-With"
    ],

    // Response headers the browser is allowed to read from JS.
    "expose_headers": [
      "Content-Length",
      "Content-Type",
      "Location",
      "X-Request-Id",
      "X-CSRF-Token",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "Retry-After"
    ]
  }
}
