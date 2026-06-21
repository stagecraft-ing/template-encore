import { Service } from "encore.dev/service";
import { securityHeaders } from "../lib/security-headers";
import { csrfMiddleware } from "../lib/csrf";
import { apiRateLimit } from "../lib/rate-limit";

/**
 * Auth service — owns the SSO flows (mock, entra-id, saml), JWT issuance,
 * refresh-token rotation, CSRF token issuance, and the user-profile read.
 *
 * Middlewares run in declaration order:
 *   1. securityHeaders — every response (incl. errors thrown downstream)
 *      carries the CSP/HSTS/Permissions-Policy chain.
 *   2. csrfMiddleware — double-submit check; SSO callbacks + /auth/refresh are
 *      in CSRF_EXEMPT_PATHS.
 *   3. apiRateLimit — general bucket. The SSO login/callback raw handlers
 *      additionally consume the tighter auth bucket inline (consumeAuthLimit).
 */
export default new Service("auth", {
  middlewares: [securityHeaders, csrfMiddleware, apiRateLimit],
});
