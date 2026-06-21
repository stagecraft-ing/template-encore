import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { env } from "../lib/env";
import { COOKIE_NAMES, clearCookieOptions } from "../lib/cookie-config";
import { readCookie, serializeClearCookie } from "../lib/cookies";
import { revokeRefreshToken } from "./service";
import * as userModel from "./user-model";
import { logAuditEvent } from "../lib/audit";

/**
 * POST /api/v1/auth/logout
 *
 * Revokes the active refresh token and clears the access/refresh/csrf cookies.
 * Requires authentication AND a valid CSRF token (service-level csrfMiddleware).
 *
 * Returns an optional `redirectUrl` for IdP single-logout (SLO): the SPA
 * navigates there after the local session is destroyed. Entra ID uses the
 * Microsoft logout endpoint; SAML uses the configured SAML_LOGOUT_URL.
 */
async function idpLogoutUrl(userId: string): Promise<string | undefined> {
  const user = await userModel.findById(userId).catch(() => null);
  if (!user) return undefined;

  const postLogout =
    env.ENTRA_POST_LOGOUT_REDIRECT_URI ||
    env.FRONTEND_URL.split(",")[0]?.trim() ||
    "http://localhost:5173";

  if (user.sso_provider_name === "entra-id" && env.ENTRA_TENANT_ID) {
    const u = new URL(
      `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/oauth2/v2.0/logout`
    );
    u.searchParams.set("post_logout_redirect_uri", postLogout);
    return u.toString();
  }
  if (user.sso_provider_name === "saml" && env.SAML_LOGOUT_URL) {
    return env.SAML_LOGOUT_URL;
  }
  return undefined;
}

export const logout = api.raw(
  { expose: true, auth: true, method: "POST", path: "/api/v1/auth/logout" },
  async (req, resp) => {
    const auth = getAuthData()!;

    const refreshTokenValue = readCookie(
      req.headers["cookie"],
      COOKIE_NAMES.REFRESH_TOKEN
    );
    if (refreshTokenValue) {
      try {
        await revokeRefreshToken(refreshTokenValue);
      } catch {
        // Best-effort — an already-revoked token shouldn't fail logout.
      }
    }

    const redirectUrl = await idpLogoutUrl(auth.userID).catch(() => undefined);

    resp.setHeader("Content-Type", "application/json");
    resp.setHeader("Set-Cookie", [
      serializeClearCookie(COOKIE_NAMES.ACCESS_TOKEN, clearCookieOptions),
      serializeClearCookie(COOKIE_NAMES.REFRESH_TOKEN, clearCookieOptions),
      serializeClearCookie(COOKIE_NAMES.CSRF_TOKEN, clearCookieOptions),
    ]);
    resp.writeHead(200);
    resp.end(JSON.stringify({ success: true, ...(redirectUrl && { redirectUrl }) }));

    void logAuditEvent({
      action: "LOGOUT",
      tableName: "user_account",
      recordId: auth.userID,
      userId: auth.userID,
      ipAddress:
        (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? null,
      userAgent: (req.headers["user-agent"]) ?? null,
    });
  }
);
