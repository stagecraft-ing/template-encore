import { Service } from "encore.dev/service";
import { securityHeaders } from "../lib/security-headers";
import { csrfMiddleware } from "../lib/csrf";
import { apiRateLimit } from "../lib/rate-limit";

/**
 * gateway service — the BFF proxy. Forwards authenticated requests under
 * /api/v1/data/* to the private backend, injecting an OAuth client-credentials
 * Bearer token (service-to-service). Preserves the Express template's BFF
 * identity: the public app never talks to the private backend directly.
 *
 * Full middleware chain: security headers + CSRF (state-changing proxy calls
 * carry the SPA's X-CSRF-Token) + general rate limit.
 */
export default new Service("gateway", {
  middlewares: [securityHeaders, csrfMiddleware, apiRateLimit],
});
