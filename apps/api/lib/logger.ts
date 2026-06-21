import log from "encore.dev/log";

/**
 * Structured logger — thin wrapper over Encore's `encore.dev/log`.
 *
 * Replaces the pino logger from the Express version. Encore writes JSON in
 * production and pretty-prints in dev; structured fields go through the
 * second argument, and trace IDs are attached automatically (no manual
 * correlation-id threading required):
 *
 *   import logger, { logSecurityEvent } from "../../lib/logger";
 *   logger.info("user logged in", { userId, provider: "entra-id" });
 *   logger.error(err, "DB query failed", { table: "user_account" });
 *   logSecurityEvent("authz.denied.unauthenticated", undefined, { ip, path });
 */

// CC-006: Fail fast if PII logging is enabled in production. Mirrors the
// guard the Express app applied in createApp().
if (process.env.NODE_ENV === "production" && process.env.LOG_PII === "true") {
  throw new Error(
    "LOG_PII=true is not permitted in production. Set LOG_PII=false or remove it."
  );
}

/**
 * Emit a structured security/audit event to the log stream. Ports
 * `logSecurityEvent` from the Express middleware/logger.middleware.ts — the
 * many auth/authz/CSRF events throughout the ported handlers route through
 * this. For durable, queryable audit records, use `logAuditEvent` (audit.ts),
 * which writes to the audit_log table.
 */
export function logSecurityEvent(
  event: string,
  principal?: string,
  fields: Record<string, unknown> = {}
): void {
  log.info(`security.event ${event}`, {
    event,
    principal: principal ?? "anonymous",
    ...fields,
  });
}

export default log;
