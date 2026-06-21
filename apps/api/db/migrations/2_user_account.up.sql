-- User account — one row per authenticated principal across all SSO drivers
-- (mock | entra-id | saml). The Express app stored the user only in the
-- session; the JWT rewrite persists it so /auth/me, role checks, refresh-token
-- rotation, and audit have a stable user record to reference.
--
-- Multi-role is preserved from the Express AuthUser model: user_roles is an
-- array (NOT a single role), and requireRole() checks any-of membership.

CREATE TABLE IF NOT EXISTS user_account (
  pk_user_account     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_email_address  TEXT NOT NULL,
  user_display_name   TEXT NOT NULL DEFAULT '',
  user_roles          TEXT[] NOT NULL DEFAULT ARRAY['user'],

  -- Which driver authenticated this user, and the IdP-issued subject/nameID.
  sso_provider_name   TEXT NOT NULL,
  sso_provider_id     TEXT,

  -- Additional non-identity claims (firstName, lastName, tenantId, …).
  attributes          JSONB NOT NULL DEFAULT '{}'::jsonb,

  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One account per email (external/staff identities are email-keyed).
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_account_email
  ON user_account (lower(user_email_address));

-- One account per (driver, IdP subject) for fast provider-id lookups + linking.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_account_provider
  ON user_account (sso_provider_name, sso_provider_id)
  WHERE sso_provider_id IS NOT NULL;
