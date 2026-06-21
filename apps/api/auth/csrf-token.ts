import { api } from "encore.dev/api";
import { generateCsrfToken } from "../lib/jwt";
import { serializeCookie } from "../lib/cookies";
import { COOKIE_NAMES, csrfCookieOptions } from "../lib/cookie-config";

/**
 * GET /api/v1/auth/csrf-token
 *
 * Generates a fresh CSRF token, sets it on an httpOnly cookie, and returns the
 * same value in the response body. The client keeps the body value in memory
 * and echoes it in the X-CSRF-Token header on state-changing requests; the
 * CSRF middleware double-submit-checks header vs cookie via timingSafeEqual.
 *
 * api.raw because typed api() endpoints have no Set-Cookie response shape.
 */
interface CsrfTokenResponse {
  token: string;
}

export const getCsrfToken = api.raw(
  { expose: true, method: "GET", path: "/api/v1/auth/csrf-token" },
  async (_req, resp) => {
    const token = generateCsrfToken();
    const cookie = serializeCookie(COOKIE_NAMES.CSRF_TOKEN, token, csrfCookieOptions);

    resp.setHeader("Content-Type", "application/json");
    resp.setHeader("Set-Cookie", cookie);

    const body: CsrfTokenResponse = { token };
    resp.writeHead(200);
    resp.end(JSON.stringify(body));
  }
);
