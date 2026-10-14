import { Router } from "express";
import * as notesCtrl from "../../controllers/notes.controller.js";
import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { requirePermission } from "../../middlewares/authorise.middleware.js";

/**
 * Notes routes — /api/v1/notes
 *
 * Chapter Ref: Ch06 — RBAC + resource ownership + tenant isolation (anti-BOLA)
 *
 * Every route runs TWO gates in sequence:
 *   1. authenticate      → WHO are you?      (401 if it fails)
 *   2. requirePermission → ARE YOU ALLOWED?  (403 if it fails)
 * The handler then defers ownership/tenant filtering to the store, where the
 * query itself cannot forget the `owner_id = ?` predicate (the classic BOLA bug).
 */
const router = Router();

router.get(   "/",    authenticate, requirePermission("notes:read_own"),   notesCtrl.listNotes);
router.post(  "/",    authenticate, requirePermission("notes:create"),     notesCtrl.createNote);
router.get(   "/:id", authenticate, requirePermission("notes:read_own"),   notesCtrl.getNote);
router.patch( "/:id", authenticate, requirePermission("notes:edit_own"),   notesCtrl.updateNote);
router.delete("/:id", authenticate, requirePermission("notes:delete_own"), notesCtrl.deleteNote);

export default router;
