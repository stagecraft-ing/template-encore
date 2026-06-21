import { Service } from "encore.dev/service";

/**
 * `db` service — owns the single shared "app" SQLDatabase and its migrations.
 * No api() endpoints; other services import `db` from ./db.ts directly.
 *
 * The Express template was deliberately DB-less (a BFF proxy with sessions in
 * Redis). The Encore rewrite reintroduces a minimal Postgres for JWT
 * refresh-token revocation, a user record, and a durable audit trail — see
 * the migration plan decision (Persistence: add a minimal SQLDatabase).
 */
export default new Service("db");
