import { SQLDatabase } from "encore.dev/storage/sqldb";

/**
 * Single shared "app" database. Encore provisions and migrates it
 * automatically:
 *   - `encore run` (dev) spins up a local Postgres via Docker and applies
 *     ./migrations/<n>_<slug>.up.sql in numeric order.
 *   - Deploy applies migrations against the configured DB before going live.
 *
 * Queries use the tagged-template API. Parameters interpolated via ${…} are
 * automatically parameterized — there is no string-concat path (parameterized
 * SQL only):
 *
 *   const user = await db.queryRow<{ pk_user_account: string }>`
 *     SELECT pk_user_account FROM user_account WHERE user_email_address = ${email}
 *   `;
 *   await db.exec`UPDATE user_account SET is_active = ${false} WHERE pk_user_account = ${id}`;
 *
 * For raw pg access (the migration runner, scripts), use db.connectionString.
 */
export const db = new SQLDatabase("app", {
  migrations: "./migrations",
});
