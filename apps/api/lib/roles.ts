import { APIError } from "encore.dev/api";

/**
 * Role checks — flat "any-of" membership, preserving the Express app's model
 * (AuthUser.roles is a string[], and requireRole passed if the user held ANY
 * of the required roles). This is intentionally NOT a privilege hierarchy.
 *
 * Template default roles (customize per project spec):
 *   'user'       — every authenticated user (baseline access)
 *   'admin'      — administrative functions
 *   'developer'  — mock driver only (dev/test)
 *
 * Call from inside an api() handler that's behind `auth: true`:
 *
 *   import { getAuthData } from "~encore/auth";
 *   requireRole(getAuthData()!.roles, "admin");
 */
export const TEMPLATE_ROLES = ["user", "admin", "developer"] as const;

/** True when the user holds at least one of the allowed roles. */
export function hasRole(
  userRoles: string[] | undefined | null,
  ...allowedRoles: string[]
): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  return allowedRoles.some((role) => userRoles.includes(role));
}

/** Throw `permissionDenied` unless the user holds one of the allowed roles. */
export function requireRole(
  userRoles: string[] | undefined | null,
  ...allowedRoles: string[]
): void {
  if (!hasRole(userRoles, ...allowedRoles)) {
    throw APIError.permissionDenied("Insufficient permissions").withDetails({
      code: "FORBIDDEN",
      requiredRoles: allowedRoles,
    });
  }
}
