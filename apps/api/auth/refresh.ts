import { api, APIError, ErrCode } from "encore.dev/api";
import { readCookie, serializeCookie } from "../lib/cookies";
import {
  COOKIE_NAMES,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
} from "../lib/cookie-config";
import { refreshAccessToken } from "./service";
import { logAuditEvent } from "../lib/audit";

/**
 * POST /api/v1/auth/refresh
 *
 * Validates the refresh_token cookie, rotates it (revoke old + issue new), and
 * sets fresh access_token + refresh_token cookies on the response.
 *
 * CSRF-exempt (CSRF_EXEMPT_PATHS): the only credential consumed is the httpOnly
 * refresh cookie. SameSite=Lax + single-use rotation defends against replay —
 * an attacker can neither read the cookie (httpOnly) nor win the rotation race.
 *
 * api.raw to read the Cookie header and write multiple Set-Cookie headers.
 */
export const refresh = api.raw(
  { expose: true, method: "POST", path: "/api/v1/auth/refresh" },
  async (req, resp) => {
    const refreshToken = readCookie(
      req.headers["cookie"],
      COOKIE_NAMES.REFRESH_TOKEN
    );

    if (!refreshToken) {
      resp.writeHead(401, { "Content-Type": "application/json" });
      resp.end(
        JSON.stringify({ code: "unauthenticated", message: "Refresh token required" })
      );
      return;
    }

    try {
      const result = await refreshAccessToken(refreshToken);

      resp.setHeader("Content-Type", "application/json");
      resp.setHeader("Set-Cookie", [
        serializeCookie(COOKIE_NAMES.ACCESS_TOKEN, result.accessToken, accessTokenCookieOptions),
        serializeCookie(COOKIE_NAMES.REFRESH_TOKEN, result.newRefreshToken, refreshTokenCookieOptions),
      ]);
      resp.writeHead(200);
      resp.end(JSON.stringify({ success: true }));

      void logAuditEvent({
        action: "TOKEN_REFRESH",
        tableName: "refresh_token",
        userId: result.user.pk_user_account,
        ipAddress:
          (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? null,
        userAgent: (req.headers["user-agent"]) ?? null,
      });
    } catch (err) {
      const apiErr = err instanceof APIError ? err : APIError.unauthenticated("Refresh failed");
      resp.writeHead(apiErr.code === ErrCode.Unauthenticated ? 401 : 500, {
        "Content-Type": "application/json",
      });
      resp.end(JSON.stringify({ code: apiErr.code, message: apiErr.message }));
    }
  }
);
