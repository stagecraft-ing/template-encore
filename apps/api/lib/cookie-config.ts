import { env } from "./env";

const isProduction = env.NODE_ENV === "production";

/**
 * Cookie name constants — referenced by the auth handler (reads cookies from
 * the request) and the auth endpoints (set/clear cookies on the response).
 */
export const COOKIE_NAMES = {
  ACCESS_TOKEN: "access_token",
  REFRESH_TOKEN: "refresh_token",
  CSRF_TOKEN: "csrf_token",
  // Short-lived CSRF/state guards for the redirect-based SSO flows.
  OAUTH_STATE: "oauth_state",
  PKCE_VERIFIER: "pkce_verifier",
} as const;

/**
 * Serialized Set-Cookie attribute set. Mirrors Express's CookieOptions; used
 * by lib/cookies.ts `serializeCookie()` when writing cookies on api.raw
 * responses.
 */
export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  maxAge?: number; // milliseconds
  path?: string;
  domain?: string;
}

/**
 * Access token (JWT) cookie — 15 minutes, httpOnly + secure-in-prod.
 *
 * sameSite must be 'lax' (not 'strict'): SSO redirects are cross-site
 * top-level navigations; 'strict' would drop the cookie on the return trip
 * from the IdP. 'lax' sends cookies on top-level GET navigations but not on
 * cross-site POST/fetch — the correct OAuth tradeoff. localhost:5173 (SPA)
 * and localhost:4000 (API) are same-site, so credentialed XHR works in dev.
 */
export const accessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  maxAge: 15 * 60 * 1000, // 15 minutes — matches the access-JWT lifetime
  path: "/",
};

/** Refresh token (JWT) cookie — 7 days, httpOnly + secure-in-prod. */
export const refreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

/**
 * CSRF token cookie — httpOnly (the client never reads it directly). The
 * client receives the token value from GET /auth/csrf-token's response body,
 * keeps it in memory, and sends it in the X-CSRF-Token header. The CSRF
 * middleware compares header vs THIS cookie via crypto.timingSafeEqual().
 */
export const csrfCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
};

/**
 * Short-lived OAuth/PKCE guard cookies — protect the SSO init/callback
 * round-trip against CSRF (RFC 6749 §10.12) and bind the PKCE verifier to the
 * browser. 10-minute window covers a typical authorization flow.
 */
export const oauthStateCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  maxAge: 10 * 60 * 1000,
  path: "/",
};

/** Options used when clearing cookies during logout — must match the path. */
export const clearCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
};
