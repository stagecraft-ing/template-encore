import type { CookieOptions } from "./cookie-config";

/**
 * Parse a Cookie header string into a name→value map.
 *
 * Used by the auth handler (reads access_token / refresh_token), the CSRF
 * middleware (reads csrf_token), and the OAuth/SAML raw handlers (read
 * oauth_state / pkce_verifier). Tolerates missing/empty headers. Values are
 * URI-decoded so cookies set with encodeURIComponent round-trip correctly.
 */
export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const segment of header.split(";")) {
    const idx = segment.indexOf("=");
    if (idx < 0) continue;
    const name = segment.slice(0, idx).trim();
    if (!name) continue;
    const raw = segment.slice(idx + 1).trim();
    // Strip optional surrounding quotes — RFC 6265 allows quoted values.
    const unquoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    try {
      cookies[name] = decodeURIComponent(unquoted);
    } catch {
      cookies[name] = unquoted;
    }
  }
  return cookies;
}

/**
 * Read a single named cookie value from a Cookie header. Returns undefined if
 * the header is missing or doesn't contain the named cookie.
 */
export function readCookie(
  header: string | undefined,
  name: string
): string | undefined {
  if (!header) return undefined;
  return parseCookies(header)[name];
}

/**
 * Serialize a Set-Cookie header value from a name, value, and options struct.
 * Used in api.raw handlers that set cookies on the response.
 */
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {}
): string {
  const parts: string[] = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    // RFC 6265 Max-Age is in seconds; CookieOptions takes milliseconds for
    // parity with Express, so convert here.
    parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  }
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) {
    const ss = options.sameSite;
    parts.push(`SameSite=${ss[0].toUpperCase()}${ss.slice(1)}`);
  }

  return parts.join("; ");
}

/**
 * Serialize a clear-cookie Set-Cookie header (empty value + Max-Age=0 + the
 * original path so the browser removes it).
 */
export function serializeClearCookie(
  name: string,
  options: CookieOptions = {}
): string {
  return serializeCookie(name, "", { ...options, maxAge: 0 });
}
