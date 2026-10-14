import { logger } from "../config/env.js";
import { userStore } from "../db/user.store.js";
import { TokenService } from "../services/token.service.js";
import { BadRequestError, NotFoundError, ForbiddenError } from "../errors/api-error.js";

/**
 * Users Controller — admin-only user administration
 *
 * Chapter Ref:
 *   Ch01 — AuthN/AuthZ dual gate
 *   Ch06 — RBAC: only `admin` holds users:read / users:manage
 *   Ch07 — passwordHash is never serialised to a client
 *   Ch09 — every privileged mutation is audit-logged
 *
 * Rules of the house:
 *  • Safe projection: `passwordHash` and any internal bookkeeping field is
 *    stripped in ONE place (safeUser) so no handler can leak it by accident.
 *  • Privilege changes are immediately effective: changing a role or disabling an
 *    account revokes every refresh token the user holds, and the access-token
 *    gate rejects stale-role tokens on the next request.
 *  • An admin can never demote or disable themselves — that is how teams lock
 *    themselves out of their own production system at 3 a.m.
 */

const ALLOWED_ROLES = Object.freeze(["user", "moderator", "admin"]);

/**
 * @param {import("../db/user.store.js").UserRecord} user
 */
function safeUser(user) {
  const { passwordHash, ...safe } = user; // eslint-disable-line no-unused-vars
  return {
    ...safe,
    activeSessions: TokenService.listActiveSessions(user.id).length,
  };
}

// ─── GET /api/v1/admin/users ──────────────────────────────────────────────────
export function listUsers(req, res, next) {
  try {
    const users = userStore.list().map(safeUser);
    res.status(200).json({ status: "success", count: users.length, data: users });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/v1/admin/users/:id ──────────────────────────────────────────────
export function getUser(req, res, next) {
  try {
    const user = userStore.findById(req.params.id);
    if (!user) throw new NotFoundError(`User '${req.params.id}' not found`);
    res.status(200).json({ status: "success", data: safeUser(user) });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/v1/admin/users/:id ────────────────────────────────────────────
/**
 * Updates role and/or active status.
 *
 * Deliberate side effects (privilege changes must be immediately effective):
 *   • role change   → every refresh token is revoked, so the account must sign in
 *                     again and the new grant is written into a fresh token; any
 *                     token still claiming the old role is additionally rejected by
 *                     the AuthN gate's stale-role check.
 *   • deactivation  → every refresh token is revoked AND each subsequent request
 *                     carrying an existing access token is rejected on the spot.
 *
 * This is the "revoke on privilege change" rule: a demotion that leaves old
 * sessions alive is how a fired employee keeps admin access for another week.
 */
export function updateUser(req, res, next) {
  try {
    const callerId = req.principal.sub;
    const { id } = req.params;
    const { role, active } = req.body ?? {};

    const target = userStore.findById(id);
    if (!target) throw new NotFoundError(`User '${id}' not found`);

    if (id === callerId) {
      if (role !== undefined && role !== "admin") {
        throw new ForbiddenError("Admins cannot demote their own account — ask another admin");
      }
      if (active === false) {
        throw new ForbiddenError("Admins cannot deactivate their own account — ask another admin");
      }
    }

    if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
      throw new BadRequestError(`Invalid role '${role}' — allowed: [${ALLOWED_ROLES.join(", ")}]`);
    }
    if (active !== undefined && typeof active !== "boolean") {
      throw new BadRequestError("'active' must be a boolean");
    }
    if (role === undefined && active === undefined) {
      throw new BadRequestError("Nothing to update — supply 'role' and/or 'active'");
    }

    const roleChanged = role !== undefined && role !== target.role;
    const deactivated = active === false && target.active !== false;

    const updated = userStore.update(id, { role, active });

    let revokedSessions = 0;
    if (roleChanged || deactivated) {
      revokedSessions = TokenService.revokeAllSessionsForUser(id);
      logger.warn("privilege change — sessions revoked", {
        actorId: callerId,
        targetId: id,
        roleChanged,
        deactivated,
        revokedSessions,
      });
    }

    res.status(200).json({
      status: "success",
      message: "User updated",
      data: { ...safeUser(updated), revokedSessions },
    });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/v1/admin/users/:id/sessions ──────────────────────────────────
/**
 * Emergency "kick this user out of every device" control — the incident-response
 * lever for a compromised or stolen-device account (Ch03).
 */
export function revokeUserSessions(req, res, next) {
  try {
    const target = userStore.findById(req.params.id);
    if (!target) throw new NotFoundError(`User '${req.params.id}' not found`);

    const revoked = TokenService.revokeAllSessionsForUser(target.id);
    logger.warn("admin revoked user sessions", {
      actorId: req.principal.sub,
      targetId: target.id,
      revoked,
    });

    res.status(200).json({
      status: "success",
      message: `Revoked ${revoked} session(s) for ${target.email}`,
      data: { revokedSessions: revoked },
    });
  } catch (err) {
    next(err);
  }
}
