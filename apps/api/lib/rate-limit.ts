import { APIError, middleware } from "encore.dev/api";
import {
  RateLimiterMemory,
  RateLimiterRedis,
  type RateLimiterAbstract,
} from "rate-limiter-flexible";
import { env } from "./env";
import logger from "./logger";

/**
 * Rate-limit middleware factories — replace the Express `express-rate-limit`
 * stack with framework-agnostic `rate-limiter-flexible` wrapped in an Encore
 * `middleware()`.
 *
 * Backing store:
 *   - REDIS_URL unset → RateLimiterMemory (single-instance only).
 *   - REDIS_URL set   → RateLimiterRedis (horizontal scale).
 *
 * Limit key: authenticated requests key on getAuthData().userID (fairer than
 * IP, survives reconnects); unauthenticated requests key on the remote IP.
 *
 * Two tiers, matching the Express app: `apiRateLimit` (general bucket) and
 * `authRateLimit` (tighter, for the SSO login/callback flows).
 */

let redisClient: unknown = null;

async function getRedisClient(): Promise<unknown> {
  if (redisClient || !env.REDIS_URL) return redisClient;
  try {
    const { default: Redis } = await import("ioredis");
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
    (redisClient as { on: (e: string, fn: (e: Error) => void) => void }).on(
      "error",
      (err) => logger.error(err, "Redis rate-limit store error")
    );
    logger.info("Rate-limit backing store: redis", {
      url: env.REDIS_URL.replace(/:[^:@/]+@/, ":***@"),
    });
  } catch (err) {
    logger.warn(
      "REDIS_URL is set but ioredis is not installed — falling back to memory store. " +
        "Run `npm install ioredis` to enable Redis-backed limits.",
      { error: (err as Error).message }
    );
    redisClient = null;
  }
  return redisClient;
}

function buildLimiter(
  keyPrefix: string,
  points: number,
  durationMs: number
): RateLimiterAbstract {
  const opts = { keyPrefix, points, duration: Math.ceil(durationMs / 1000) };
  const memLimiter = new RateLimiterMemory(opts);

  if (!env.REDIS_URL) return memLimiter;

  // First requests after boot may use memory; swap in Redis once ready. This
  // matches express-rate-limit behaviour and keeps the boot path non-blocking.
  let realLimiter: RateLimiterAbstract = memLimiter;
  void getRedisClient().then((client) => {
    if (client) {
      realLimiter = new RateLimiterRedis({ ...opts, storeClient: client });
    }
  });
  return new Proxy(memLimiter, {
    get(_target, prop) {
      return (realLimiter as unknown as Record<string | symbol, unknown>)[prop];
    },
  });
}

if (!env.REDIS_URL) {
  logger.info("Rate-limit backing store: memory (single-instance only)");
}

const apiLimiter = buildLimiter(
  "api",
  env.RATE_LIMIT_API_MAX,
  env.RATE_LIMIT_API_WINDOW_MS
);
const authLimiter = buildLimiter(
  "auth",
  env.RATE_LIMIT_AUTH_MAX,
  env.RATE_LIMIT_AUTH_WINDOW_MS
);

interface LimitContext {
  limit: number;
}

function rateLimitMiddleware(limiter: RateLimiterAbstract, ctx: LimitContext) {
  return middleware(async (req, next) => {
    const meta = req.requestMeta as
      | { headers?: Record<string, string> }
      | undefined;
    const headers = meta?.headers ?? {};
    const ipHeader = headers["x-forwarded-for"] || headers["x-real-ip"] || "unknown";
    const ip = String(ipHeader).split(",")[0]?.trim() || "unknown";

    // Authenticated requests key on the user ID; fall back to IP otherwise.
    let key = ip;
    try {
      const { getAuthData } = await import("~encore/auth");
      const auth = getAuthData?.();
      if (auth?.userID) key = auth.userID;
    } catch {
      // ~encore/auth unavailable on unauthenticated services — IP key it is.
    }

    try {
      const result = await limiter.consume(key);
      const resp = await next(req);
      resp.header.set("X-RateLimit-Limit", String(ctx.limit));
      resp.header.set("X-RateLimit-Remaining", String(result.remainingPoints));
      resp.header.set(
        "X-RateLimit-Reset",
        new Date(Date.now() + result.msBeforeNext).toISOString()
      );
      return resp;
    } catch (err) {
      if (err instanceof APIError) throw err;
      const rejection = err as { msBeforeNext?: number };
      const retryAfterSec = Math.ceil((rejection.msBeforeNext ?? 1000) / 1000);
      logger.warn("Rate limit exceeded", { key, ip, retryAfterSec, limit: ctx.limit });
      throw APIError.resourceExhausted(
        `Too many requests. Retry after ${retryAfterSec} seconds.`
      );
    }
  });
}

/** General API bucket — include on most services. */
export const apiRateLimit = rateLimitMiddleware(apiLimiter, {
  limit: env.RATE_LIMIT_API_MAX,
});

/** Tighter bucket for SSO login/callback flows — on the auth service. */
export const authRateLimit = rateLimitMiddleware(authLimiter, {
  limit: env.RATE_LIMIT_AUTH_MAX,
});

/**
 * Inline auth-bucket consumption for the SSO login/callback raw handlers.
 * Encore service middleware applies the general (api) bucket uniformly; the
 * redirect-based login flows additionally throttle on this tighter bucket,
 * keyed by client IP. Throws APIError.resourceExhausted when exceeded — the
 * raw handler should catch it and 429 / redirect with an error.
 */
export async function consumeAuthLimit(key: string): Promise<void> {
  try {
    await authLimiter.consume(key);
  } catch (err) {
    if (err instanceof APIError) throw err;
    const rejection = err as { msBeforeNext?: number };
    const retryAfterSec = Math.ceil((rejection.msBeforeNext ?? 1000) / 1000);
    logger.warn("Auth rate limit exceeded", { key, retryAfterSec });
    throw APIError.resourceExhausted(
      `Too many authentication attempts. Retry after ${retryAfterSec} seconds.`
    );
  }
}
