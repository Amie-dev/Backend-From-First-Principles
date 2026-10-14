import { Router } from "express";
import * as usersCtrl from "../../controllers/users.controller.js";
import * as notesCtrl from "../../controllers/notes.controller.js";
import * as apiKeyCtrl from "../../controllers/api-key.controller.js";
import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { requirePermission } from "../../middlewares/authorise.middleware.js";

/**
 * Admin routes — /api/v1/admin
 *
 * Chapter Ref: Ch04 (API keys), Ch06 (RBAC), Ch08 (privilege escalation), Ch09 (audit)
 *
 * Defence in depth: these endpoints are unguessable-address security, not
 * security. Every one of them re-verifies the caller's permissions server-side
 * (`authenticate` + `requirePermission`) — hiding a link in a UI never
 * constitutes authorisation.
 */
const router = Router();

// ── Notes moderation (admin only) ─────────────────────────────────────────────
router.get(
  "/notes/archived",
  authenticate,
  requirePermission("notes:read_archived"),
  notesCtrl.listArchivedNotes
);

// ── User administration (admin only) ─────────────────────────────────────────
router.get(
  "/users",
  authenticate,
  requirePermission("users:read"),
  usersCtrl.listUsers
);

router.get(
  "/users/:id",
  authenticate,
  requirePermission("users:read"),
  usersCtrl.getUser
);

router.patch(
  "/users/:id",
  authenticate,
  requirePermission("users:manage"),
  usersCtrl.updateUser
);

// Incident response: force a user out of every device (revocation lever, Ch03)
router.delete(
  "/users/:id/sessions",
  authenticate,
  requirePermission("users:manage"),
  usersCtrl.revokeUserSessions
);

// ── API key lifecycle (M2M, Ch04) ────────────────────────────────────────────
router.post(
  "/api-keys",
  authenticate,
  requirePermission("apikeys:manage"),
  apiKeyCtrl.createApiKey
);

router.get(
  "/api-keys",
  authenticate,
  requirePermission("apikeys:manage"),
  apiKeyCtrl.listApiKeys
);

router.delete(
  "/api-keys/:id",
  authenticate,
  requirePermission("apikeys:manage"),
  apiKeyCtrl.revokeApiKey
);

export default router;
