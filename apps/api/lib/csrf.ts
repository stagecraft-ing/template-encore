import { APIError, middleware } from "encore.dev/api";
import crypto from "node:crypto";
import { COOKIE_NAMES } from "./cookie-config";
import { readCookie } from "./cookies";

/**
 * CSRF protection — double-submit cookie pattern, ported from the Express
 * middleware/csrf.middleware.ts.
 *
 * The csrf_token cookie is httpOnly (the client cannot read it). The client
 * receives the same value from GET /api/v1/auth/csrf-token's response body,
 * keeps it in memory, and sends it in the X-CSRF-Token header on every
 * state-changing request. This middleware compares header vs cookie via
 * crypto.timingSafeEqual().
 *
 * Mount via `Service({ middlewares: [csrfMiddleware] })` on every service that
 * handles authenticated state-changing endpoints. Endpoints that legitimately
 * cannot use CSRF (SSO init/callback, refresh-token rotation, service-to-
 * service public routes) are listed in CSRF_EXEMPT_PATHS.
 */

/**
 * Endpoints that LEGITIMATELY skip CSRF protection. Each entry MUST document a
 * reason — adding an entry is a security-relevant change. Matched against
 * `req.requestMeta.path`. GET/HEAD/OPTIONS are always skipped (no state change)
 * and are NOT listed here.
 */
export const CSRF_EXEMPT_PATHS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^\/api\/v1\/auth\/callback\/?$/,
    reason: "Default-driver SSO callback — protected by the OAuth state / SAML signature",
  },
  {
    pattern: /^\/api\/v1\/auth\/[^/]+\/callback\/?$/,
    reason:
      "Per-driver SSO callback (entra-id, saml) — protected by OAuth state+PKCE / signed SAML assertion",
  },
  {
    pattern: /^\/api\/v1\/auth\/logout\/callback\/?$/,
    reason: "IdP single-logout (SLO) callback — initiated by the IdP, no session cookie context",
  },
  {
    pattern: /^\/api\/v1\/auth\/refresh\/?$/,
    reason:
      "Refresh-token rotation — only the httpOnly refresh cookie is consumed; SameSite=Lax + rotation defends against CSRF",
  },
  {
    pattern: /^\/api\/v1\/public(\/.*)?$/,
    reason: "Service-to-service public routes — authenticated by Bearer token, not session cookies",
  },
];

interface RequestMeta {
  method?: string;
  path?: string;
  headers?: Record<string, string | undefined>;
}

export const csrfMiddleware = middleware(async (req, next) => {
  const meta = req.requestMeta as RequestMeta | undefined;
  const method = (meta?.method || "GET").toUpperCase();

  // Safe methods never mutate state.
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next(req);
  }

  // Allow-listed paths.
  const path = meta?.path || "";
  for (const { pattern } of CSRF_EXEMPT_PATHS) {
    if (pattern.test(path)) return next(req);
  }

  const headerToken = meta?.headers?.["x-csrf-token"];
  const cookieToken = readCookie(meta?.headers?.["cookie"], COOKIE_NAMES.CSRF_TOKEN);

  if (!headerToken || !cookieToken) {
    throw APIError.permissionDenied("CSRF token missing").withDetails({
      code: "CSRF_MISSING",
    });
  }

  const headerBuf = Buffer.from(headerToken);
  const cookieBuf = Buffer.from(cookieToken);
  if (
    headerBuf.length !== cookieBuf.length ||
    !crypto.timingSafeEqual(headerBuf, cookieBuf)
  ) {
    throw APIError.permissionDenied("CSRF token mismatch").withDetails({
      code: "CSRF_MISMATCH",
    });
  }

  return next(req);
});
