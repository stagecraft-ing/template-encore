/**
 * Auth-related types — shared across the auth service.
 *
 * Multi-provider, multi-role by design (preserving the Express AuthUser model):
 *   - `provider` is an open string: "mock" | "entra-id" | "saml".
 *   - `roles` is a string[] sourced from the IdP (Entra role/group claims,
 *     SAML role attributes, or mock fixtures), refreshed on each login.
 */

export interface SSOProfile {
  provider: string;
  providerId: string;
  email: string;
  displayName: string;
  roles?: string[];
  attributes?: Record<string, unknown>;
}

export interface UserRecord {
  pk_user_account: string;
  user_email_address: string;
  user_display_name: string;
  user_roles: string[];
  sso_provider_name: string;
  sso_provider_id: string | null;
  attributes: Record<string, unknown>;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefreshTokenRecord {
  pk_refresh_token: string;
  fk_user_account: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}
