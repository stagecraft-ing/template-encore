import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import * as userModel from "./user-model";

/**
 * GET /api/v1/auth/me
 *
 * Returns the authenticated user's profile. The auth handler has already
 * validated the JWT and surfaced { userID, email, name, roles }; this endpoint
 * enriches it with the persisted DB row. Response shape mirrors what the SPA's
 * auth store consumes (id/email/name/roles), with no envelope wrapper.
 */
export interface MeResponse {
  id: string;
  email: string;
  name: string;
  roles: string[];
  ssoProvider: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export const me = api(
  { expose: true, auth: true, method: "GET", path: "/api/v1/auth/me" },
  async (): Promise<MeResponse> => {
    const auth = getAuthData()!;
    const user = await userModel.findById(auth.userID);
    if (!user) throw APIError.notFound("User not found");

    return {
      id: user.pk_user_account,
      email: user.user_email_address,
      name: user.user_display_name,
      roles: user.user_roles ?? [],
      ssoProvider: user.sso_provider_name,
      isActive: user.is_active,
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at,
    };
  }
);
