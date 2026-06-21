import { APIError, Gateway, Header } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import jwt from "jsonwebtoken";
import { verifyAccessToken } from "../lib/jwt";
import { readCookie } from "../lib/cookies";
import { COOKIE_NAMES } from "../lib/cookie-config";
import logger from "../lib/logger";

/**
 * Encore auth handler — validates the access token on every authenticated API
 * call and surfaces AuthData via `getAuthData()` to endpoint handlers.
 *
 * Two token sources (dual-mode, ported from the reference's handler):
 *   1. `Authorization: Bearer <jwt>` — for any future bearer-auth namespace.
 *      No CSRF needed (the browser never auto-attaches bearer tokens).
 *   2. `Cookie: access_token=<jwt>` — the SPA's primary mode. httpOnly +
 *      secure + sameSite=lax; the CSRF middleware adds double-submit
 *      protection for state-changing cookie-auth requests.
 *
 * On an expired access token we surface a typed TOKEN_EXPIRED detail so the
 * client can trigger the silent POST /api/v1/auth/refresh flow.
 */

interface AuthParams {
  authorization?: Header<"Authorization">;
  cookie?: Header<"Cookie">;
}

export interface AuthData {
  userID: string;
  email: string;
  name: string;
  roles: string[];
}

export const auth = authHandler<AuthParams, AuthData>(async (params) => {
  let token: string | undefined;

  if (params.authorization) {
    const parts = params.authorization.split(" ");
    if (parts[0]?.toLowerCase() === "bearer" && parts[1]) {
      token = parts[1];
    }
  }

  if (!token && params.cookie) {
    token = readCookie(params.cookie, COOKIE_NAMES.ACCESS_TOKEN);
  }

  if (!token) {
    throw APIError.unauthenticated("Authentication required");
  }

  try {
    const decoded = verifyAccessToken(token);
    return {
      userID: decoded.sub,
      email: decoded.email,
      name: decoded.name,
      roles: decoded.roles ?? [],
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw APIError.unauthenticated("Token expired").withDetails({
        code: "TOKEN_EXPIRED",
      });
    }
    logger.warn("auth handler rejected token", {
      reason: (err as Error).message,
    });
    throw APIError.unauthenticated("Invalid token");
  }
});

/**
 * Gateway — every external request routes through the auth handler. APIs
 * declared with `auth: true` invoke it before the body runs; unauthenticated
 * APIs (login, csrf-token, public reads) bypass it.
 */
export const gateway = new Gateway({ authHandler: auth });
