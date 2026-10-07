import {
  BadRequestError,
  NotFoundError,
  ConflictError
} from "../errors/api-error.js";

// In-memory Database Store
class InMemoryUserStore {
  constructor() {
    this.users = new Map(); // Key: ID, Value: User object
    this.autoIncrementId = 1;

    // Seed mock data
    this.create({ name: "Alice Smith", email: "alice@example.com", role: "admin" });
    this.create({ name: "Bob Jones", email: "bob@example.com", role: "developer" });
  }

  getAll() {
    return Array.from(this.users.values());
  }

  getById(id) {
    return this.users.get(Number(id));
  }

  getByEmail(email) {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return null;
  }

  // NON-IDEMPOTENT CREATION
  create(data) {
    const id = this.autoIncrementId++;
    const user = { id, name: data.name, email: data.email, role: data.role || "user" };
    this.users.set(id, user);
    return user;
  }

  // IDEMPOTENT COMPLETE REPLACEMENT
  replace(id, data) {
    const numericId = Number(id);
    const user = { id: numericId, name: data.name, email: data.email, role: data.role || "user" };
    this.users.set(numericId, user);
    return user;
  }

  // PARTIAL UPDATE
  patch(id, data) {
    const existing = this.getById(id);
    if (!existing) return null;
    if (data.name !== undefined) existing.name = data.name;
    if (data.email !== undefined) existing.email = data.email;
    if (data.role !== undefined) existing.role = data.role;
    return existing;
  }

  // IDEMPOTENT DELETION
  delete(id) {
    return this.users.delete(Number(id));
  }
}

const db = new InMemoryUserStore();

/**
 * GET /api/v1/users (Safe & Idempotent)
 */
export function getUsers(req, res) {
  const users = db.getAll();
  res.status(200).json({ status: "success", count: users.length, data: users });
}

/**
 * GET /api/v1/users/:id (Safe & Idempotent)
 */
export function getUserById(req, res) {
  const user = db.getById(req.params.id);
  if (!user) {
    throw new NotFoundError(`User with ID ${req.params.id} does not exist`);
  }
  res.status(200).json({ status: "success", data: user });
}

/**
 * POST /api/v1/users (Unsafe & NON-IDEMPOTENT)
 * Running this multiple times creates multiple distinct user records with unique IDs.
 */
export function createUser(req, res) {
  const { name, email, role } = req.body;
  if (!name || !email) {
    throw new BadRequestError("Missing required fields: 'name' and 'email'");
  }

  if (db.getByEmail(email)) {
    throw new ConflictError(`User with email '${email}' already exists`);
  }

  const newUser = db.create({ name, email, role });

  res.status(201)
     .setHeader("Location", `/api/v1/users/${newUser.id}`)
     .json({
       status: "success",
       message: "User created (POST - Non-idempotent)",
       data: newUser
     });
}

/**
 * PUT /api/v1/users/:id (Unsafe & IDEMPOTENT)
 * Running this multiple times with the exact same payload results in the exact same server state.
 */
export function replaceUser(req, res) {
  const { name, email, role } = req.body;
  if (!name || !email) {
    throw new BadRequestError("PUT requires complete entity replacement payload ('name' and 'email')");
  }

  const updatedUser = db.replace(req.params.id, { name, email, role });

  res.status(200).json({
    status: "success",
    message: "User entity state replaced (PUT - Idempotent)",
    data: updatedUser
  });
}

/**
 * PATCH /api/v1/users/:id (Unsafe & Partial Update)
 */
export function patchUser(req, res) {
  const user = db.getById(req.params.id);
  if (!user) {
    throw new NotFoundError(`User with ID ${req.params.id} not found`);
  }

  const updatedUser = db.patch(req.params.id, req.body);
  res.status(200).json({
    status: "success",
    message: "User partially updated (PATCH)",
    data: updatedUser
  });
}

/**
 * DELETE /api/v1/users/:id (Unsafe & IDEMPOTENT)
 * Deleting a user multiple times leaves the server in the exact same state (user is gone).
 */
export function deleteUser(req, res) {
  db.delete(req.params.id);
  // 204 No Content with 0 body bytes
  res.status(204).end();
}
