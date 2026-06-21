import { api, APIError } from "encore.dev/api";
import { db } from "../db/db";
import { env } from "../lib/env";
import logger from "../lib/logger";

/**
 * Health + public metadata endpoints. Paths preserve the Express contract
 * (k8s/Azure probes and the Helm chart reference /health, /health/liveness,
 * /health/readiness).
 */

interface StatusResponse {
  status: string;
}

/** GET /health — overall health (DB connectivity). 503 if the DB is down. */
export const health = api(
  { expose: true, method: "GET", path: "/health" },
  async (): Promise<StatusResponse> => {
    try {
      await db.queryRow`SELECT 1 AS ok`;
      return { status: "healthy" };
    } catch {
      throw APIError.unavailable("degraded");
    }
  }
);

/** GET /health/liveness — process is alive (no dependency checks). Always 200. */
export const liveness = api(
  { expose: true, method: "GET", path: "/health/liveness" },
  async (): Promise<StatusResponse> => {
    return { status: "alive" };
  }
);

/** GET /health/readiness — ready to serve traffic (DB reachable). 503 if not. */
export const readiness = api(
  { expose: true, method: "GET", path: "/health/readiness" },
  async (): Promise<StatusResponse> => {
    try {
      await db.queryRow`SELECT 1 AS ok`;
      return { status: "ready" };
    } catch {
      throw APIError.unavailable("not-ready");
    }
  }
);

interface InfoResponse {
  name: string;
  version: string;
  description?: string;
  features?: Record<string, string[]>;
}

/**
 * GET /api/v1/info — API metadata. Implementation details are only disclosed
 * outside production (and outside Azure App Service) to limit fingerprinting.
 */
export const info = api(
  { expose: true, method: "GET", path: "/api/v1/info" },
  async (): Promise<InfoResponse> => {
    const data: InfoResponse = {
      name: process.env.APP_NAME || "Enterprise Application Template",
      version: "v1",
    };
    if (env.NODE_ENV !== "production" && !process.env.WEBSITE_HOSTNAME) {
      data.description =
        "Enterprise application template with GoA Design System and multi-driver authentication (Encore.ts)";
      data.features = {
        authentication: ["Mock", "Microsoft Entra ID", "SAML 2.0"],
        security: [
          "CSP / Security Headers",
          "CSRF Protection",
          "Rate Limiting",
          "JWT Cookie Auth",
        ],
        design: "GoA Design System",
      };
    }
    return data;
  }
);

/**
 * POST /api/v1/csp-report — CSP violation report sink. Browsers post here
 * (application/csp-report or application/json) without a CSRF token, so it's
 * a raw endpoint on this CSRF-free service. Always 204.
 */
export const cspReport = api.raw(
  { expose: true, method: "POST", path: "/api/v1/csp-report" },
  async (req, resp) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        logger.warn("CSP violation report", { report: body.slice(0, 4000) });
      } catch {
        // never fail a report ingest
      }
      resp.writeHead(204);
      resp.end();
    });
    req.on("error", () => {
      resp.writeHead(204);
      resp.end();
    });
  }
);
