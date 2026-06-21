import { Service } from "encore.dev/service";

/**
 * web service — serves the built SPA via api.static. No middleware: static
 * assets must cache normally (the API security-headers middleware sets
 * Cache-Control: no-store, which would defeat asset caching), and there are no
 * state-changing endpoints here. Document-level CSP for the SPA shell is an
 * ingress/CDN concern (see lib/security-headers.ts note).
 */
export default new Service("web");
