-- Refresh-token store — enables rotation + server-side revocation
-- (logout-everywhere), which a purely stateless JWT scheme cannot provide.
--
-- Only the sha256 hash of the refresh token is stored, never the token itself.
-- On refresh: look up by hash, revoke the presented row, issue a new pair. A
-- replayed (already-rotated) refresh token fails the lookup.

CREATE TABLE IF NOT EXISTS refresh_token (
  pk_refresh_token  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  fk_user_account   TEXT NOT NULL REFERENCES user_account(pk_user_account) ON DELETE CASCADE,
  token_hash        TEXT NOT NULL UNIQUE,
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_token_user ON refresh_token (fk_user_account);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_token (token_hash);
