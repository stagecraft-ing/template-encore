import { db } from "../db/db";
import type { RefreshTokenRecord } from "./types";

/**
 * Refresh-token persistence — hashed tokens only (never the raw JWT).
 * Rotation: refreshAccessToken() in service.ts issues a new token and revokes
 * the old one in the same round-trip.
 */

export async function create(
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<RefreshTokenRecord> {
  const row = await db.queryRow<RefreshTokenRecord>`
    INSERT INTO refresh_token (fk_user_account, token_hash, expires_at)
    VALUES (${userId}, ${tokenHash}, ${expiresAt.toISOString()})
    RETURNING *
  `;
  if (!row) throw new Error("refresh_token: INSERT … RETURNING produced no row");
  return row;
}

export async function findByHash(
  tokenHash: string
): Promise<RefreshTokenRecord | null> {
  const row = await db.queryRow<RefreshTokenRecord>`
    SELECT * FROM refresh_token
    WHERE token_hash = ${tokenHash}
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;
  return row ?? null;
}

export async function revoke(tokenHash: string): Promise<void> {
  await db.exec`
    UPDATE refresh_token SET revoked_at = NOW()
     WHERE token_hash = ${tokenHash}
  `;
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await db.exec`
    UPDATE refresh_token SET revoked_at = NOW()
     WHERE fk_user_account = ${userId}
       AND revoked_at IS NULL
  `;
}
