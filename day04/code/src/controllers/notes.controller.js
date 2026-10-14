import { noteStore } from "../db/note.store.js";
import { userStore } from "../db/user.store.js";
import { BadRequestError, NotFoundError } from "../errors/api-error.js";

/**
 * Notes Controller — Full CRUD with RBAC & Anti-BOLA Ownership Enforcement
 *
 * Chapter Ref:
 *   Ch01 — Dual Gatekeeper (AuthN → AuthZ → Business Logic)
 *   Ch06 — RBAC, ABAC, and Resource Ownership (BOLA/IDOR defence)
 *
 * All routes in this controller are protected by:
 *   authenticate          → establishes req.principal (AuthN)
 *   requirePermission(..) → validates RBAC role (AuthZ Gate)
 *
 * Ownership enforcement lives inside NoteStore query methods themselves
 * (Ch06 Pattern B): the store throws ForbiddenError/NotFoundError
 * transparently — controllers never hand-code `if note.ownerId === ...`
 * branching that could be accidentally skipped.
 *
 * BOLA/IDOR:  a "note not found in your tenant" condition is surfaced as 404,
 * not 403, so the existence of notes belonging to other tenants is never leaked.
 */

// ─── Helper: build the principal context expected by NoteStore ──────────────

/**
 * Assembles the authorisation context handed to the store. `tenantId` is read
 * from the live user record (not from the JWT) so a tenant move takes effect
 * immediately, and `req.user` is reused when the AuthN gate already loaded it.
 */
function resolvePrincipalCtx(req) {
  const { sub: userId, role } = req.principal;
  const user = req.user ?? userStore.findById(userId);
  if (!user) throw new NotFoundError("User account not found");
  return { userId, role, tenantId: user.tenantId };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/notes
 * List notes visible to the current principal:
 *   admin / moderator → all notes in tenant
 *   user              → own notes only
 */
export function listNotes(req, res, next) {
  try {
    const ctx   = resolvePrincipalCtx(req);
    const notes = noteStore.listForPrincipal(ctx);
    res.status(200).json({
      status: "success",
      count:  notes.length,
      data:   notes,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/notes/:id
 * Fetch a single note.  The store enforces tenant isolation + ownership.
 */
export function getNote(req, res, next) {
  try {
    const ctx  = resolvePrincipalCtx(req);
    const note = noteStore.getForPrincipal(req.params.id, ctx);
    res.status(200).json({ status: "success", data: note });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/notes
 * Create a new note owned by the current user.
 */
export async function createNote(req, res, next) {
  try {
    const ctx = resolvePrincipalCtx(req);
    const { title, content } = req.body;

    if (!title || !content) {
      throw new BadRequestError("title and content are required");
    }

    const note = noteStore.create({
      title,
      content,
      ownerId:  ctx.userId,
      tenantId: ctx.tenantId,
    });

    res.status(201)
      .setHeader("Location", `/api/v1/notes/${note.id}`)
      .json({ status: "success", message: "Note created", data: note });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/notes/:id
 * Partial update.  The store enforces: owner or admin may write.
 */
export function updateNote(req, res, next) {
  try {
    const ctx  = resolvePrincipalCtx(req);
    const { title, content, archived } = req.body;

    const updated = noteStore.updateForPrincipal(
      req.params.id,
      { title, content, archived },
      ctx
    );

    res.status(200).json({ status: "success", message: "Note updated", data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/notes/:id
 * Delete.  The store enforces: owner or admin only.
 */
export function deleteNote(req, res, next) {
  try {
    const ctx = resolvePrincipalCtx(req);
    noteStore.deleteForPrincipal(req.params.id, ctx);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/admin/notes/archived
 * Admin-only: list all archived notes across the tenant.
 */
export function listArchivedNotes(req, res, next) {
  try {
    const { tenantId } = resolvePrincipalCtx(req);
    const notes = noteStore.listArchived(tenantId);
    res.status(200).json({ status: "success", count: notes.length, data: notes });
  } catch (err) {
    next(err);
  }
}
