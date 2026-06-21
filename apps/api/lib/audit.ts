import { db } from "../db/db";
import logger from "./logger";

/**
 * Audit logging — writes immutable records into the `audit_log` table
 * (migration in db/migrations). New durable-audit capability enabled by the
 * SQLDatabase added in the migration; the Express app only had log-based
 * security events (still available via logSecurityEvent in lib/logger.ts).
 *
 * Failures are swallowed and logged but never propagate to the caller, so an
 * audit-table outage cannot break the user flow.
 */

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "LOGIN_FAILED"
  | "TOKEN_REFRESH"
  | "INSERT"
  | "UPDATE"
  | "DELETE";

export interface AuditEvent {
  action: AuditAction;
  tableName: string;
  recordId?: string;
  userId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const newJson =
      event.newData || event.metadata
        ? JSON.stringify({ ...(event.newData || {}), ...(event.metadata || {}) })
        : null;
    const oldJson = event.oldData ? JSON.stringify(event.oldData) : null;

    await db.exec`
      INSERT INTO audit_log (
        table_name, record_id, action, old_data, new_data,
        user_id, ip_address, user_agent
      ) VALUES (
        ${event.tableName},
        ${event.recordId ?? null},
        ${event.action},
        ${oldJson},
        ${newJson},
        ${event.userId ?? null},
        ${event.ipAddress ?? null},
        ${event.userAgent ?? null}
      )
    `;
  } catch (err) {
    logger.error(err, "Audit logging failed", { action: event.action });
  }
}
