-- Durable audit trail. Written by lib/audit.ts logAuditEvent() — best-effort,
-- never blocks the user flow. Columns match the INSERT in lib/audit.ts.

CREATE TABLE IF NOT EXISTS audit_log (
  pk_audit_log  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name    TEXT NOT NULL,
  record_id     TEXT,
  action        TEXT NOT NULL,
  old_data      JSONB,
  new_data      JSONB,
  user_id       TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at);
