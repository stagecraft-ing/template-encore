import { Service } from "encore.dev/service";
import { securityHeaders } from "../lib/security-headers";

/**
 * health service — liveness/readiness probes plus the public /api/v1/info and
 * the CSP violation report sink. Intentionally NOT rate-limited or CSRF-gated:
 * k8s/Azure probes hit it constantly, and browsers POST CSP reports without a
 * token. Only securityHeaders is mounted.
 */
export default new Service("health", {
  middlewares: [securityHeaders],
});
