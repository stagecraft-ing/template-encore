import { api } from "encore.dev/api";
import { env } from "../lib/env";
import { verifyAccessToken } from "../lib/jwt";
import { readCookie } from "../lib/cookies";
import { COOKIE_NAMES } from "../lib/cookie-config";
import { isMockEnabled } from "./mock";
import { isEntraConfigured } from "./entra-id";
import { isSamlConfigured } from "./saml";

/**
 * Driver discovery + status + default-driver login redirect.
 *
 * Replaces the Express multi-driver router's /drivers, /status, and the
 * backward-compatible /login (which dispatched to the AUTH_DRIVER default).
 * Per-driver login/callback endpoints live in mock.ts / entra-id.ts / saml.ts.
 */

function availableDrivers(): string[] {
  const list: string[] = [];
  if (isMockEnabled()) list.push("mock");
  if (isEntraConfigured()) list.push("entra-id");
  if (isSamlConfigured()) list.push("saml");
  return list;
}

/** GET /api/v1/auth/drivers — list the SSO drivers available in this env. */
export const drivers = api(
  { expose: true, method: "GET", path: "/api/v1/auth/drivers" },
  async (): Promise<{ drivers: string[] }> => {
    return { drivers: availableDrivers() };
  }
);

/**
 * GET /api/v1/auth/status — report auth state without requiring auth.
 * api.raw so it can inspect the access_token cookie and return
 * authenticated:false (rather than 401) when absent/expired.
 */
export const status = api.raw(
  { expose: true, method: "GET", path: "/api/v1/auth/status" },
  async (req, resp) => {
    const token = readCookie(
      req.headers["cookie"],
      COOKIE_NAMES.ACCESS_TOKEN
    );
    let authenticated = false;
    if (token) {
      try {
        verifyAccessToken(token);
        authenticated = true;
      } catch {
        authenticated = false;
      }
    }
    resp.setHeader("Content-Type", "application/json");
    resp.writeHead(200);
    resp.end(JSON.stringify({ authenticated, drivers: availableDrivers() }));
  }
);

/**
 * GET /api/v1/auth/login — backward-compatible default-driver entry point.
 * Redirects to the configured AUTH_DRIVER's login, or the only available
 * driver. The SPA can also link directly to /api/v1/auth/<driver>/login.
 */
export const login = api.raw(
  { expose: true, method: "GET", path: "/api/v1/auth/login" },
  async (_req, resp) => {
    const available = availableDrivers();
    const preferred =
      env.AUTH_DRIVER && available.includes(env.AUTH_DRIVER)
        ? env.AUTH_DRIVER
        : available[0];
    if (!preferred) {
      resp.writeHead(503, { "Content-Type": "application/json" });
      resp.end(JSON.stringify({ code: "unavailable", message: "No auth drivers configured" }));
      return;
    }
    resp.writeHead(302, { Location: `/api/v1/auth/${preferred}/login` });
    resp.end();
  }
);
