import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from "../lib/jwt";
import { APIError } from "../lib/errors";
import { env } from "../lib/env";
import * as userModel from "./user-model";
import * as refreshTokenModel from "./refresh-token-model";
import type { SSOProfile, UserRecord } from "./types";

/**
 * Auth service helpers — shared by mock.ts, entra-id.ts, saml.ts, refresh.ts,
 * and logout.ts. No api() exports here.
 *
 * Token rotation contract:
 *   - createTokens(user) issues a fresh pair and persists the refresh hash.
 *   - refreshAccessToken(rt) validates the presented refresh token, revokes
 *     its row, then issues a brand-new pair — a replayed refresh fails on the
 *     second use.
 */

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Construct the SSO callback URL for a driver. Priority:
 *   AUTH_CALLBACK_URL (explicit override) > `${API_BASE_URL}/api/v1/auth/<driver>/callback`.
 */
export function getCallbackUrl(driver: string): string {
  if (env.AUTH_CALLBACK_URL) return env.AUTH_CALLBACK_URL;
  const base = env.API_BASE_URL.replace(/\/$/, "");
  return `${base}/api/v1/auth/${driver}/callback`;
}

/** First allowed SPA origin — used as the post-login redirect base. */
export function frontendBase(): string {
  return env.FRONTEND_URL.split(",")[0]?.trim() || "http://localhost:5173";
}

/**
 * Find or create a user from an SSO profile. Tries (provider, subject) first,
 * then email (cross-provider account linking), then creates. On any match the
 * profile fields (display name, roles, attributes) are refreshed from the IdP.
 */
export async function findOrCreateUser(profile: SSOProfile): Promise<UserRecord> {
  profile.email = profile.email.toLowerCase().trim();

  if (profile.providerId) {
    const byProvider = await userModel.findByProviderId(
      profile.provider,
      profile.providerId
    );
    if (byProvider) {
      const updated = await userModel.updateUser(byProvider.pk_user_account, profile);
      return updated!;
    }
  }

  const byEmail = await userModel.findByEmail(profile.email);
  if (byEmail) {
    const updated = await userModel.updateUser(byEmail.pk_user_account, profile);
    return updated!;
  }

  return userModel.createUser(profile);
}

export async function createTokens(
  user: UserRecord
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({
    sub: user.pk_user_account,
    email: user.user_email_address,
    name: user.user_display_name,
    roles: user.user_roles ?? [],
  });
  const refreshToken = signRefreshToken(user.pk_user_account);

  const tokenHash = hashToken(refreshToken);
  await refreshTokenModel.create(
    user.pk_user_account,
    tokenHash,
    new Date(Date.now() + REFRESH_TTL_MS)
  );

  return { accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  newRefreshToken: string;
  user: UserRecord;
}> {
  let decoded: { sub: string; type: string };
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw APIError.unauthenticated("Invalid refresh token");
  }
  if (decoded.type !== "refresh") {
    throw APIError.unauthenticated("Invalid token type");
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await refreshTokenModel.findByHash(tokenHash);
  if (!stored) {
    throw APIError.unauthenticated("Refresh token not found or revoked");
  }

  const user = await userModel.findById(decoded.sub);
  if (!user || !user.is_active) {
    throw APIError.unauthenticated("User not found or inactive");
  }

  // Rotate — revoke the presented token, issue a new pair.
  await refreshTokenModel.revoke(tokenHash);
  const newRefreshToken = signRefreshToken(user.pk_user_account);
  await refreshTokenModel.create(
    user.pk_user_account,
    hashToken(newRefreshToken),
    new Date(Date.now() + REFRESH_TTL_MS)
  );

  const accessToken = signAccessToken({
    sub: user.pk_user_account,
    email: user.user_email_address,
    name: user.user_display_name,
    roles: user.user_roles ?? [],
  });

  return { accessToken, newRefreshToken, user };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await refreshTokenModel.revoke(hashToken(refreshToken));
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await refreshTokenModel.revokeAllForUser(userId);
}
