import { api } from "encore.dev/api";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getAuthData } from "~encore/auth";
import { env } from "../lib/env";
import { getAccessToken, isGatewayConfigured } from "./token-cache";
import logger, { logSecurityEvent } from "../lib/logger";

/**
 * BFF proxy — forwards /api/v1/data/* to the private backend with an injected
 * S2S Bearer token. Ports the Express gateway.routes.ts + api-gateway.service.ts
 * (path-traversal sanitisation, response masking, timeout→504) into a single
 * api.raw catch-all per HTTP method.
 *
 * Auth: declared auth:true so the Gateway authHandler runs first (401 for
 * unauthenticated callers); getAuthData() then yields the caller's identity.
 */

const GATEWAY_TIMEOUT_MS = parseInt(process.env.GATEWAY_TIMEOUT_MS || "30000", 10);
const PROXY_PREFIX = "/api/v1/data";

/**
 * Sanitise the proxy sub-path to prevent traversal beyond the backend's API
 * prefix. Iteratively decodes (defeats %2e%2e / double-encoding), rejects '..'
 * and control characters. Returns a single-leading-slash path, or null.
 */
function sanitizePath(raw: string): string | null {
  let decoded = raw;
  try {
    let prev = "";
    while (decoded !== prev) {
      prev = decoded;
      decoded = decodeURIComponent(decoded);
    }
  } catch {
    return null;
  }
  if (decoded.includes("..")) return null;
  // eslint-disable-next-line no-control-regex -- intentional: reject control chars
  if (/[\x00-\x1f]/.test(decoded)) return null;
  return "/" + raw.replace(/^\/+/, "");
}

/** Mask 5xx as a generic 502 and strip stack traces from 4xx error bodies. */
function sanitizeResponse(
  status: number,
  data: Record<string, unknown>
): { status: number; data: unknown } {
  if (status >= 500) {
    return {
      status: 502,
      data: { code: "bad_gateway", message: "Backend service error" },
    };
  }
  const dataError = (data as Record<string, Record<string, unknown>>)?.error;
  if (dataError?.stack) {
    const { stack: _stack, ...rest } = dataError;
    return { status, data: { ...data, error: rest } };
  }
  return { status, data };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(resp: ServerResponse, status: number, data: unknown): void {
  resp.setHeader("Content-Type", "application/json");
  resp.writeHead(status);
  resp.end(JSON.stringify(data));
}

async function handle(
  req: IncomingMessage,
  resp: ServerResponse,
  method: string
): Promise<void> {
  if (!isGatewayConfigured()) {
    sendJson(resp, 503, {
      code: "unavailable",
      message: "This service is currently unavailable.",
    });
    return;
  }

  const auth = getAuthData();
  const url = new URL(req.url ?? "/", env.API_BASE_URL);
  const sub = url.pathname.startsWith(PROXY_PREFIX)
    ? url.pathname.slice(PROXY_PREFIX.length)
    : url.pathname;
  const path = sanitizePath(sub || "/");
  if (!path) {
    logSecurityEvent("gateway.blocked.path_traversal", auth?.userID, {
      path: url.pathname,
      method,
    });
    sendJson(resp, 400, { code: "invalid_argument", message: "Invalid path" });
    return;
  }

  const target = `${env.PRIVATE_API_BASE_URL}${path}${url.search}`;

  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD" && method !== "DELETE") {
    body = await readBody(req);
  }

  // Audit every BFF data access.
  logger.info("gateway.data_access", {
    type: "audit",
    userId: auth?.userID ?? "unknown",
    method,
    path,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
  try {
    const token = await getAccessToken();
    const reqId = (req.headers["x-request-id"] as string | undefined) ?? undefined;
    const upstream = await fetch(target, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(reqId ? { "X-Request-Id": reqId } : {}),
      },
      body: body && body.length > 0 ? body : undefined,
      signal: controller.signal,
    });

    const text = await upstream.text();
    const data = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
    const sanitized = sanitizeResponse(upstream.status, data);
    sendJson(resp, sanitized.status, sanitized.data);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.warn("Gateway upstream timed out", { path, method });
      sendJson(resp, 504, { code: "deadline_exceeded", message: "Backend service timed out" });
      return;
    }
    logger.error(error as Error, "Gateway proxy failed", { path, method });
    sendJson(resp, 502, { code: "bad_gateway", message: "Failed to reach backend service" });
  } finally {
    clearTimeout(timeout);
  }
}

export const dataGet = api.raw(
  { expose: true, auth: true, method: "GET", path: "/api/v1/data/*path" },
  (req, resp) => handle(req, resp, "GET")
);
export const dataPost = api.raw(
  { expose: true, auth: true, method: "POST", path: "/api/v1/data/*path" },
  (req, resp) => handle(req, resp, "POST")
);
export const dataPut = api.raw(
  { expose: true, auth: true, method: "PUT", path: "/api/v1/data/*path" },
  (req, resp) => handle(req, resp, "PUT")
);
export const dataPatch = api.raw(
  { expose: true, auth: true, method: "PATCH", path: "/api/v1/data/*path" },
  (req, resp) => handle(req, resp, "PATCH")
);
export const dataDelete = api.raw(
  { expose: true, auth: true, method: "DELETE", path: "/api/v1/data/*path" },
  (req, resp) => handle(req, resp, "DELETE")
);
