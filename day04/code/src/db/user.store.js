import crypto from "crypto";
import { config } from "../config/env.js";
import { PasswordService } from "../services/password.service.js";
import { ConflictError, NotFoundError } from "../errors/api-error.js";

/**
 * UserStore — In-Memory User Database
 *
 * Chapter Ref: Day04 Ch07 (secure password storage), Ch06 (RBAC & ownership)
 *
 * Roles hierarchy:
 *   user  → can CRUD their own notes only
 *   moderator → can read all notes, flag content
 *   admin     → full access, manage users, view archives
 *
 * Passwords are stored as bcrypt digests — NEVER plaintext.
 */

/** @typedef {"user"|"moderator"|"admin"} Role */

/**
 * @typedef {Object} UserRecord
 * @property {string}  id
 * @property {string}  email
 * @property {string}  username
 * @property {string}  passwordHash   - bcrypt record (never exposed via API)
 * @property {Date}    passwordUpdatedAt - when the digest was last (re)written
 * @property {Role}    role
 * @property {boolean} active
 * @property {string}  tenantId
 * @property {Date}    createdAt
 */

class UserStore {
  constructor() {
    /** @type {Map<string, UserRecord>}  keyed by id */
    this._byId    = new Map();
    /** @type {Map<string, string>}  email (lowercase) → id */
    this._emailIndex = new Map();
  }

  /** @returns {UserRecord[]} */
  list() {
    return [...this._byId.values()];
  }

  /** @param {string} id @returns {UserRecord|null} */
  findById(id) {
    return this._byId.get(id) ?? null;
  }

  /** @param {string} email @returns {UserRecord|null} */
  findByEmail(email) {
    const id = this._emailIndex.get(email.toLowerCase());
    return id ? (this._byId.get(id) ?? null) : null;
  }

  /**
   * Persist a new user.  Caller must have already hashed the password.
   * @param {{ email: string, username: string, passwordHash: string, role?: Role, tenantId?: string }} data
   * @returns {UserRecord}
   */
  create({ email, username, passwordHash, role = "user", tenantId = "tenant_default" }) {
    const normalised = email.toLowerCase().trim();
    if (this._emailIndex.has(normalised)) {
      throw new ConflictError(`A user with email '${normalised}' already exists`);
    }
    const record = {
      id:           "usr_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12),
      email:        normalised,
      username,
      passwordHash,
      passwordUpdatedAt: new Date(),
      role,
      active:       true,
      tenantId,
      createdAt:    new Date(),
    };
    this._byId.set(record.id, record);
    this._emailIndex.set(normalised, record.id);
    return record;
  }

  /**
   * Update mutable fields (role, active).  Never touches passwordHash here.
   * @param {string} id
   * @param {Partial<Pick<UserRecord, "role"|"active">>} patch
   * @returns {UserRecord}
   */
  update(id, patch) {
    const user = this._byId.get(id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
    if (patch.role   !== undefined) user.role   = patch.role;
    if (patch.active !== undefined) user.active = patch.active;
    return user;
  }

  /**
   * Replace a stored password digest (registration, password change, or the
   * transparent bcrypt cost-factor upgrade performed after a successful login).
   *
   * @param {string} id
   * @param {string} passwordHash  bcrypt record — NEVER plaintext
   * @returns {UserRecord}
   */
  updatePasswordHash(id, passwordHash) {
    const user = this._byId.get(id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
    user.passwordHash = passwordHash;
    user.passwordUpdatedAt = new Date();
    return user;
  }
}

export const userStore = new UserStore();

// ──────────────────────────────────────────────────────────────────────────────
// Seed demo users (passwords bcrypt-hashed asynchronously at startup)
// ──────────────────────────────────────────────────────────────────────────────
export async function seedUsers() {
  if (!config.seedDemoData) {
    console.log("[DB] SEED_DEMO_DATA=false — skipping demo user seeding");
    return 0;
  }

  const seeds = [
    { email: "aminul@example.com", username: "aminul",  password: "SuperSecret#2024!", role: "admin"     },
    { email: "sarah@example.com",  username: "sarah",   password: "Moderate@Pass99",   role: "moderator" },
    { email: "bob@example.com",    username: "bob",     password: "User$Passw0rd",     role: "user"      },
    { email: "alice@example.com",  username: "alice",   password: "Alice$Secure1",     role: "user"      },
  ];

  for (const s of seeds) {
    if (userStore.findByEmail(s.email)) continue; // idempotent re-seed
    PasswordService.assertAcceptable(s.password); // demo data must obey the policy
    const passwordHash = await PasswordService.hash(s.password);
    userStore.create({
      email:        s.email,
      username:     s.username,
      passwordHash,
      role:         s.role,
      tenantId:     "tenant_alpha",
    });
  }
  console.log(
    `[DB] Seeded ${seeds.length} demo users (bcrypt cost ${config.password.bcryptCost})`
  );
  return seeds.length;
}
