import { middleware } from "encore.dev/api";
import { env } from "./env";

/**
 * Security headers — ports the Express `helmet` configuration from app.ts to
 * an Encore middleware. Mount via `Service({ middlewares: [securityHeaders] })`
 * on every API service.
 *
 * Note: Encore serves the static SPA via `api.static` (see web/ service),
 * which does not run service middleware — so document-level CSP for the HTML
 * shell is a deploy/ingress concern (CDN or reverse proxy), as in the
 * reference implementation. The CSP below still applies to API responses and
 * documents the intended policy for the ingress layer to mirror.
 *
 * Tune the CSP allow-lists to match the assets the app loads. Defaults cover
 * the GoA Design System CDNs (jsDelivr, unpkg/Ionicons) + Google Fonts +
 * Adobe Typekit — the same set the Express helmet config carried.
 */

const isProduction = env.NODE_ENV === "production";

const CSP_DIRECTIVES: Array<[string, string[]]> = [
  ["default-src", ["'self'"]],
  // 'unsafe-inline' required by GoA web components.
  ["script-src", ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"]],
  ["style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"]],
  [
    "font-src",
    ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net", "https://use.typekit.net"],
  ],
  ["img-src", ["'self'", "data:", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"]],
  // Ionicons lazy-loads SVGs via fetch (unpkg); Typekit performance beacon;
  // 'self' + ws/wss for SPA XHR and Encore streaming endpoints.
  ["connect-src", ["'self'", "ws:", "wss:", "https://unpkg.com", "https://performance.typekit.net"]],
  ["frame-src", ["'none'"]],
  ["object-src", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["frame-ancestors", ["'none'"]],
];

function buildCsp(): string {
  const parts = CSP_DIRECTIVES.map(
    ([name, values]) => `${name} ${values.join(" ")}`
  );
  // CC-003: CSP violation reporting group (see /api/v1/csp-report endpoint).
  parts.push("report-to csp-endpoint");
  if (isProduction) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

const CSP = buildCsp();
// HDR-001: HSTS max-age >= 365 days (1 year security baseline).
const HSTS = "max-age=31536000; includeSubDomains; preload";
// FINDING-012: restrict powerful browser features.
const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=()";

export const securityHeaders = middleware(async (req, next) => {
  const resp = await next(req);
  resp.header.set("Content-Security-Policy", CSP);
  resp.header.set("Strict-Transport-Security", HSTS);
  resp.header.set("X-Frame-Options", "DENY");
  resp.header.set("X-Content-Type-Options", "nosniff");
  resp.header.set("Referrer-Policy", "strict-origin-when-cross-origin");
  resp.header.set("Permissions-Policy", PERMISSIONS_POLICY);
  // GoA components load cross-origin assets (Typekit, CDNs); keep CORP open and
  // do NOT set COEP (the Express helmet config disabled it for the same reason).
  resp.header.set("Cross-Origin-Resource-Policy", "cross-origin");
  resp.header.set("Reporting-Endpoints", 'csp-endpoint="/api/v1/csp-report"');
  // REQ-P0-04: never cache API responses (these services only serve the API).
  resp.header.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  resp.header.set("Pragma", "no-cache");
  resp.header.set("Expires", "0");
  return resp;
});
