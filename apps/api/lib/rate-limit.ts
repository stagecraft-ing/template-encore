/**
 * Rate limiting (INV-6) via rate-limiter-flexible. In-memory by default; backed
 * by Redis when REDIS_URL is set. Two tiers: a general API tier and a tighter
 * auth tier. On a store failure the limiter fails open (legitimate traffic is
 * never blocked by an unavailable backend); only an actual limit hit returns 429.
 */
import { APIError, middleware, type Middleware } from "encore.dev/api";
import {
  RateLimiterMemory,
  RateLimiterRedis,
  type RateLimiterAbstract,
} from "rate-limiter-flexible";
import Redis from "ioredis";
import { env } from "./env";
import { logSecurityEvent } from "./logger";

let redis: Redis | undefined;
if (env.redisUrl) {
  redis = new Redis(env.redisUrl, { maxRetriesPerRequest: null, enableOfflineQueue: false });
}

function makeLimiter(points: number, durationSeconds: number, keyPrefix: string): RateLimiterAbstract {
  if (redis) {
    return new RateLimiterRedis({ storeClient: redis, points, duration: durationSeconds, keyPrefix });
  }
  return new RateLimiterMemory({ points, duration: durationSeconds, keyPrefix });
}

function clientKey(headers: Record<string, string | string[]>): string {
  const xff = headers["x-forwarded-for"];
  const forwarded = Array.isArray(xff) ? xff[0] : xff;
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const real = headers["x-real-ip"];
  return (Array.isArray(real) ? real[0] : real) ?? "anonymous";
}

function rateLimitMiddleware(limiter: RateLimiterAbstract, tier: string): Middleware {
  return middleware(async (req, next) => {
    const meta = req.requestMeta;
    const key = meta && meta.type === "api-call" ? `${tier}:${clientKey(meta.headers ?? {})}` : `${tier}:unknown`;
    try {
      await limiter.consume(key, 1);
    } catch (rejection) {
      if (rejection instanceof Error) {
        // Store/backend failure: fail open, but record it.
        logSecurityEvent("ratelimit.backend_error", { tier });
        return next(req);
      }
      logSecurityEvent("ratelimit.exceeded", { tier });
      throw APIError.resourceExhausted("rate limit exceeded").withDetails({ code: "RATE_LIMITED" });
    }
    return next(req);
  });
}

// General API tier and tighter auth tier (spec 002 INV-6).
export const apiRateLimit = rateLimitMiddleware(makeLimiter(100, 60, "api"), "api");
export const authRateLimit = rateLimitMiddleware(makeLimiter(10, 60, "auth"), "auth");
