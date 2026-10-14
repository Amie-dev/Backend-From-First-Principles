import { ForbiddenError, UnauthorizedError } from "../errors/api-error.js";

/**
 * RBAC — Role-Based Access Control Permission Definitions
 *
 * Chapter Ref: Day04 Ch06 — Authorization Models (RBAC)
 *
 * Permissions are associated with roles, not individual users.
 * A user's effective permission set is determined entirely by their role.
 *
 * Rules:
 * ───────
 *   user      → own notes CRUD only
 *   moderator → read all, cannot permanently delete
 *   admin     → full access including archives and user management
 */

/** @typedef {"user"|"moderator"|"admin"} Role */
/** @typedef {string} Permission */

/** @type {Record<Role, Set<Permission>>} */
export const ROLE_PERMISSIONS = {
  user: new Set([
    "notes:create",
    "notes:read_own",
    "notes:edit_own",
    "notes:delete_own",
  ]),
  moderator: new Set([
    "notes:create",
    "notes:read_own",
    "notes:read_all",
    "notes:edit_own",
    // moderators deliberately CANNOT delete other users' notes
  ]),
  admin: new Set([
    "notes:create",
    "notes:read_own",
    "notes:read_all",
    "notes:edit_own",
    "notes:edit_all",
    "notes:delete_own",
    "notes:delete_all",
    "notes:read_archived",
    "users:read",
    "users:manage",
    "apikeys:manage",
  ]),
};

/**
 * requirePermission — Authorization Middleware Factory (AuthZ Gate 2)
 *
 * Chapter Ref: Day04 Ch01 (Dual Gatekeeper), Ch06 (RBAC)
 *
 * Creates an Express middleware that checks whether the authenticated
 * principal (`req.principal`) holds ALL of the required permissions.
 *
 * Returns HTTP 401 if `req.principal` is missing (AuthN never ran).
 * Returns HTTP 403 if the role lacks the required permissions.
 *
 * Usage:
 *   router.get('/admin/archives', authenticate, requirePermission('notes:read_archived'), handler)
 *
 * @param {...Permission} requiredPermissions
 */
export function requirePermission(...requiredPermissions) {
  return function authorise(req, res, next) {
    if (!req.principal) {
      // Defensive: AuthN middleware must precede AuthZ
      return next(
        new UnauthorizedError("Authentication context missing — authenticate middleware must precede requirePermission")
      );
    }

    const { role } = req.principal;
    const userPerms = ROLE_PERMISSIONS[role];

    if (!userPerms) {
      return next(new ForbiddenError(`Unknown role '${role}' — access denied`));
    }

    const missing = requiredPermissions.filter((p) => !userPerms.has(p));
    if (missing.length > 0) {
      return next(
        new ForbiddenError(
          `Forbidden — role '${role}' lacks: [${missing.join(", ")}]`
        )
      );
    }

    next();
  };
}

/**
 * Convenience helper: check a single permission without middleware.
 * Useful inside controller logic for conditional branching.
 *
 * @param {Role} role
 * @param {Permission} permission
 * @returns {boolean}
 */
export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
