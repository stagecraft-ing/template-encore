import { db } from "../db/db";
import type { SSOProfile, UserRecord } from "./types";

/**
 * User account data-access layer. All queries use Encore's tagged-template
 * API, which auto-parameterises interpolated values — no string concat.
 */

export async function findByEmail(email: string): Promise<UserRecord | null> {
  const row = await db.queryRow<UserRecord>`
    SELECT * FROM user_account
    WHERE LOWER(user_email_address) = LOWER(${email})
  `;
  return row ?? null;
}

export async function findById(id: string): Promise<UserRecord | null> {
  const row = await db.queryRow<UserRecord>`
    SELECT * FROM user_account
    WHERE pk_user_account = ${id}
  `;
  return row ?? null;
}

/**
 * Find a user by SSO provider + subject. `provider` is a parameterized value
 * (not a dynamic column), so the query is trivially SAST-auditable.
 */
export async function findByProviderId(
  provider: string,
  providerId: string
): Promise<UserRecord | null> {
  const row = await db.queryRow<UserRecord>`
    SELECT * FROM user_account
    WHERE sso_provider_name = ${provider}
      AND sso_provider_id = ${providerId}
  `;
  return row ?? null;
}

export async function createUser(profile: SSOProfile): Promise<UserRecord> {
  const roles = profile.roles && profile.roles.length ? profile.roles : ["user"];
  const attributes = JSON.stringify(profile.attributes ?? {});

  const row = await db.queryRow<UserRecord>`
    INSERT INTO user_account (
      user_email_address, user_display_name, user_roles,
      sso_provider_name, sso_provider_id, attributes, last_login_at
    ) VALUES (
      ${profile.email},
      ${profile.displayName},
      ${roles},
      ${profile.provider},
      ${profile.providerId},
      ${attributes}::jsonb,
      NOW()
    )
    RETURNING *
  `;
  if (!row) throw new Error("createUser: INSERT … RETURNING produced no row");
  return row;
}

/**
 * Refresh fields from an SSO profile on each login. Roles and attributes are
 * re-sourced from the IdP (the authoritative source in this template), display
 * name only when the provider returns a non-empty value, and last_login_at
 * always. Each branch is a fixed-shape parameterized statement.
 */
export async function updateUser(
  userId: string,
  profile: Partial<SSOProfile>
): Promise<UserRecord | null> {
  if (profile.displayName) {
    await db.exec`
      UPDATE user_account SET user_display_name = ${profile.displayName}
       WHERE pk_user_account = ${userId}
    `;
  }
  if (profile.roles && profile.roles.length) {
    await db.exec`
      UPDATE user_account SET user_roles = ${profile.roles}
       WHERE pk_user_account = ${userId}
    `;
  }
  if (profile.attributes) {
    await db.exec`
      UPDATE user_account SET attributes = ${JSON.stringify(profile.attributes)}::jsonb
       WHERE pk_user_account = ${userId}
    `;
  }
  if (profile.provider && profile.providerId) {
    // Link/refresh the provider subject (e.g. first login via a new driver).
    await db.exec`
      UPDATE user_account
         SET sso_provider_name = ${profile.provider},
             sso_provider_id = ${profile.providerId}
       WHERE pk_user_account = ${userId}
    `;
  }
  await db.exec`
    UPDATE user_account SET last_login_at = NOW(), updated_at = NOW()
     WHERE pk_user_account = ${userId}
  `;
  return findById(userId);
}
