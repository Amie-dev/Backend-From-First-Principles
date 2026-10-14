import crypto from "crypto";
import { NotFoundError, ForbiddenError } from "../errors/api-error.js";

/**
 * NoteStore — In-Memory Note Database
 *
 * Chapter Ref: Day04 Ch06 — Authorization Models (RBAC, ownership, multi-tenancy)
 *
 * Every note is scoped to:
 *   • a tenantId  (multi-tenant boundary — never cross tenants)
 *   • an ownerId  (per-user resource ownership — BOLA/IDOR defence)
 *
 * The authorisation layer is enforced directly inside the store query methods
 * (Pattern B from Ch06): the database query itself rejects rows that don't
 * satisfy ownership or tenant constraints, mirroring a real SQL query with
 * `WHERE tenant_id = ? AND owner_id = ?`.
 */

/**
 * @typedef {Object} NoteRecord
 * @property {string}  id
 * @property {string}  tenantId
 * @property {string}  ownerId
 * @property {string}  title
 * @property {string}  content
 * @property {boolean} archived
 * @property {Date}    createdAt
 * @property {Date}    updatedAt
 */

class NoteStore {
  constructor() {
    /** @type {Map<string, NoteRecord>} */
    this._store = new Map();
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  /** @param {string} id @returns {NoteRecord|null} */
  _raw(id) {
    return this._store.get(id) ?? null;
  }

  /**
   * Resolve a note with full tenant + ownership checks.
   * Returns null (404) if outside tenant; throws ForbiddenError for wrong owner.
   *
   * @param {string} id
   * @param {{ userId: string, role: string, tenantId: string }} principal
   * @returns {NoteRecord}
   */
  _resolve(id, principal) {
    const note = this._raw(id);

    // 1. Non-existent or cross-tenant → 404 (never reveal cross-tenant existence)
    if (!note || note.tenantId !== principal.tenantId) {
      throw new NotFoundError(`Note '${id}' not found`);
    }

    // 2. Admins and moderators can read all notes within their tenant
    const elevated = ["admin", "moderator"].includes(principal.role);

    // 3. For write operations the caller must be the owner or an admin
    //    (moderators are read-only for other users' notes)
    if (!elevated && note.ownerId !== principal.userId) {
      throw new ForbiddenError("You do not have permission to access this note");
    }

    return note;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * List notes visible to the calling principal.
   *   admin / moderator → all notes in tenant
   *   user              → only own notes
   *
   * @param {{ userId: string, role: string, tenantId: string }} principal
   * @returns {NoteRecord[]}
   */
  listForPrincipal(principal) {
    const elevated = ["admin", "moderator"].includes(principal.role);
    return [...this._store.values()].filter((n) => {
      if (n.tenantId !== principal.tenantId) return false;
      if (elevated) return true;
      return n.ownerId === principal.userId;
    });
  }

  /**
   * @param {string} id
   * @param {{ userId: string, role: string, tenantId: string }} principal
   * @returns {NoteRecord}
   */
  getForPrincipal(id, principal) {
    return this._resolve(id, principal);
  }

  /**
   * @param {{ title: string, content: string, ownerId: string, tenantId: string }} data
   * @returns {NoteRecord}
   */
  create({ title, content, ownerId, tenantId }) {
    const now  = new Date();
    const note = {
      id:        "note_" + crypto.randomUUID().replace(/-/g, "").substring(0, 10),
      tenantId,
      ownerId,
      title,
      content,
      archived:  false,
      createdAt: now,
      updatedAt: now,
    };
    this._store.set(note.id, note);
    return note;
  }

  /**
   * Update a note — only the owner or an admin may write.
   * Moderators are read-only; they cannot update content.
   *
   * @param {string} id
   * @param {Partial<Pick<NoteRecord, "title"|"content"|"archived">>} patch
   * @param {{ userId: string, role: string, tenantId: string }} principal
   * @returns {NoteRecord}
   */
  updateForPrincipal(id, patch, principal) {
    const note = this._resolve(id, principal);

    // Only owner or admin may mutate — moderators are explicitly denied writes
    if (principal.role === "moderator" && note.ownerId !== principal.userId) {
      throw new ForbiddenError("Moderators cannot modify other users' notes");
    }
    if (principal.role !== "admin" && note.ownerId !== principal.userId) {
      throw new ForbiddenError("Only the note owner or an admin can edit this note");
    }

    if (patch.title    !== undefined) note.title    = patch.title;
    if (patch.content  !== undefined) note.content  = patch.content;
    if (patch.archived !== undefined) note.archived = patch.archived;
    note.updatedAt = new Date();
    return note;
  }

  /**
   * Delete a note — only the owner or an admin may delete.
   *
   * @param {string} id
   * @param {{ userId: string, role: string, tenantId: string }} principal
   */
  deleteForPrincipal(id, principal) {
    const note = this._resolve(id, principal);

    if (principal.role !== "admin" && note.ownerId !== principal.userId) {
      throw new ForbiddenError("Only the note owner or an admin can delete this note");
    }
    this._store.delete(id);
  }

  /** Admin-only: list all archived notes in the tenant */
  listArchived(tenantId) {
    return [...this._store.values()].filter(
      (n) => n.tenantId === tenantId && n.archived
    );
  }

  /**
   * SYSTEM-LEVEL read across every tenant.
   *
   * Only reachable through an authenticated M2M API key with the `notes:read`
   * scope — never from a user-facing route. Kept as an explicit, greppable method
   * name so that "who can read across tenants?" has exactly one answer (Ch04/Ch06).
   *
   * @returns {NoteRecord[]}
   */
  listAll() {
    return [...this._store.values()];
  }
}

export const noteStore = new NoteStore();

// ── Seed demo notes ─────────────────────────────────────────────────────────
/**
 * Idempotent demo-note seeding. Returns the number of notes created so the
 * bootstrap summary can report accurate numbers.
 *
 * @param {string} aminulId
 * @param {string} bobId
 * @param {string} aliceId
 * @returns {number} notes created
 */
export function seedNotes(aminulId, bobId, aliceId) {
  if (noteStore.listAll().length > 0) return 0; // already seeded

  const seeds = [
    { title: "Aminul's Private Strategy", content: "Confidential Q4 roadmap",  ownerId: aminulId, archived: false },
    { title: "Bob's Meeting Notes",       content: "Stand-up agenda items",    ownerId: bobId,    archived: false },
    { title: "Alice's Study Notes",       content: "Backend fundamentals",     ownerId: aliceId,  archived: false },
    { title: "Bob's Archived Draft",      content: "Outdated proposal",        ownerId: bobId,    archived: true  },
  ];

  for (const s of seeds) {
    const note = noteStore.create({
      title:    s.title,
      content:  s.content,
      ownerId:  s.ownerId,
      tenantId: "tenant_alpha",
    });
    if (s.archived) {
      note.archived = true; // archived notes are admin-only (Ch06 visibility rule)
      note.updatedAt = new Date();
    }
  }

  console.log(`[DB] Seeded ${seeds.length} demo notes`);
  return seeds.length;
}
