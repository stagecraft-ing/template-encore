import { APIError, ErrCode } from "encore.dev/api";

/**
 * PostgreSQL error code → Encore APIError.
 *
 * Sanitises pg errors before they leak to the client (schema/constraint
 * information disclosure). Mirrors the Express version's DB error handling but
 * maps to Encore.ts APIError codes instead of HTTP status integers.
 *
 * Usage inside an api() handler:
 *
 *   try {
 *     await db.exec`INSERT INTO ...`;
 *   } catch (err) {
 *     throw mapDbError(err);
 *   }
 *
 * Migration note: the Express app returned a `{ success, error: { url, method,
 * timestamp, principal, code, message } }` envelope. The Encore rewrite drops
 * that envelope in favour of APIError's native `{ code, message, details? }`
 * shape (see migration plan §7.3). The client (apps/web) unwraps the native
 * shape — see M7.
 */

interface PgError extends Error {
  code?: string;
}

const DB_ERROR_MAP: Record<
  string,
  { message: string; build: (msg: string) => APIError }
> = {
  // unique_violation
  "23505": {
    message: "A record with this information already exists",
    build: (m) => APIError.alreadyExists(m),
  },
  // foreign_key_violation
  "23503": {
    message: "This operation references data that does not exist",
    build: (m) => APIError.invalidArgument(m),
  },
  // not_null_violation
  "23502": {
    message: "Required information is missing",
    build: (m) => APIError.invalidArgument(m),
  },
  // check_violation
  "23514": {
    message: "The provided data does not meet validation requirements",
    build: (m) => APIError.invalidArgument(m),
  },
  // connection failures
  "08000": { message: "Database connection failed. Please try again.", build: (m) => APIError.unavailable(m) },
  "08003": { message: "Database connection failed. Please try again.", build: (m) => APIError.unavailable(m) },
  "08006": { message: "Database connection failed. Please try again.", build: (m) => APIError.unavailable(m) },
  // cannot_connect_now (recovery in progress)
  "57P03": {
    message: "The service is temporarily unavailable. Please try again.",
    build: (m) => APIError.unavailable(m),
  },
};

/**
 * Map a thrown error to an APIError suitable for returning from an api()
 * handler. Known pg codes are translated to safe messages; timeouts become
 * deadlineExceeded; anything else becomes a generic internal error (the
 * original is captured by Encore's tracing — we don't leak its message).
 */
export function mapDbError(err: unknown): APIError {
  if (err instanceof APIError) return err;

  const e = err as PgError;

  if (e.code && DB_ERROR_MAP[e.code]) {
    const { message, build } = DB_ERROR_MAP[e.code];
    return build(message);
  }

  if (e.code === "ETIMEDOUT" || (e.message && e.message.includes("timeout"))) {
    return APIError.deadlineExceeded("The request timed out. Please try again.");
  }

  return APIError.internal("An unexpected error occurred");
}

/** Convenience re-export — handlers import both from a single barrel. */
export { APIError, ErrCode };
