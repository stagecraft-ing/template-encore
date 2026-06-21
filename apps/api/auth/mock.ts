import { api } from "encore.dev/api";
import { env } from "../lib/env";
import {
  COOKIE_NAMES,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
} from "../lib/cookie-config";
import { serializeCookie } from "../lib/cookies";
import { consumeAuthLimit } from "../lib/rate-limit";
import { createTokens, findOrCreateUser, frontendBase } from "./service";
import { logAuditEvent } from "../lib/audit";
import logger from "../lib/logger";
import type { SSOProfile } from "./types";

/**
 * Mock SSO driver — DEV/TEST ONLY. Never registered in production (every
 * endpoint hard-fails when NODE_ENV === "production"). Replaces the Express
 * MockAuthDriver; the fixed user roster matches the documented ?user=N set.
 *
 *   GET /api/v1/auth/mock/login?user=0  → developer@example.com [developer, user]
 *   GET /api/v1/auth/mock/login?user=1  → admin@example.com     [admin, user]
 *   GET /api/v1/auth/mock/login?user=2  → user@example.com      [user]
 *
 * Issues real JWT cookies (no IdP round-trip) and redirects to the SPA.
 */

const MOCK_USERS: SSOProfile[] = [
  { provider: "mock", providerId: "mock-0", email: "developer@example.com", displayName: "Dev Eloper", roles: ["developer", "user"] },
  { provider: "mock", providerId: "mock-1", email: "admin@example.com", displayName: "Adam Ministrator", roles: ["admin", "user"] },
  { provider: "mock", providerId: "mock-2", email: "user@example.com", displayName: "Ursula Ser", roles: ["user"] },
];

export function isMockEnabled(): boolean {
  return env.NODE_ENV !== "production";
}

function clientIp(req: { headers: Record<string, unknown> }): string {
  const xff = req.headers["x-forwarded-for"] as string | undefined;
  return xff?.split(",")[0]?.trim() || "unknown";
}

export const mockLogin = api.raw(
  { expose: true, method: "GET", path: "/api/v1/auth/mock/login" },
  async (req, resp) => {
    // CC-004: defense-in-depth — the mock driver must never authenticate in prod.
    if (!isMockEnabled()) {
      resp.writeHead(404, { "Content-Type": "application/json" });
      resp.end(JSON.stringify({ code: "not_found", message: "Not found" }));
      return;
    }

    const ip = clientIp(req);
    try {
      await consumeAuthLimit(ip);
    } catch {
      resp.writeHead(302, { Location: `${frontendBase()}/login?error=rate_limited` });
      resp.end();
      return;
    }

    const url = new URL(req.url ?? "/", env.API_BASE_URL);
    const idx = Math.min(
      Math.max(parseInt(url.searchParams.get("user") ?? "0", 10) || 0, 0),
      MOCK_USERS.length - 1
    );
    const profile = MOCK_USERS[idx];

    try {
      const user = await findOrCreateUser({ ...profile });
      const tokens = await createTokens(user);

      resp.setHeader("Set-Cookie", [
        serializeCookie(COOKIE_NAMES.ACCESS_TOKEN, tokens.accessToken, accessTokenCookieOptions),
        serializeCookie(COOKIE_NAMES.REFRESH_TOKEN, tokens.refreshToken, refreshTokenCookieOptions),
      ]);
      resp.writeHead(302, { Location: `${frontendBase()}/?signed_in=true` });
      resp.end();

      void logAuditEvent({
        action: "LOGIN",
        tableName: "user_account",
        recordId: user.pk_user_account,
        userId: user.pk_user_account,
        ipAddress: ip,
        userAgent: (req.headers["user-agent"]) ?? null,
        newData: { provider: "mock", email: user.user_email_address },
      });
    } catch (err) {
      logger.error(err as Error, "Mock login failed");
      resp.writeHead(302, { Location: `${frontendBase()}/login?error=server_error` });
      resp.end();
    }
  }
);
