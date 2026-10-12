# Chapter 06: Authorization Models (RBAC, ABAC, and Resource Ownership)

## 1. The Authorization Challenge in Production Backends

Once a user has been authenticated (*"We know you are User #1042"*), the backend must evaluate **Authorization** (*"Are you permitted to modify Document #8819?"*).

In a production note-taking or SaaS application, requirements quickly outgrow simplistic boolean flags like `isAdmin`:
* Regular users should create, view, and modify **only their own** notes.
* Moderators should inspect flagged notes and freeze discussions, but **not** permanently delete database archives.
* Administrators should view system metrics, audit logs, and archived notes across all accounts.
* Organization Administrators should manage users **only within their own tenant**, never crossing boundaries into competing companies.

```
                              INCOMING REQUEST
                         GET /api/notes/doc_771
                                     │
                                     ▼
                      ┌──────────────────────────────┐
                      │    Authentication Check      │
                      └──────────────┬───────────────┘
                                     │ Valid: User 1042
                                     ▼
       ┌────────────────────────────────────────────────────────────┐
       │                 AUTHORIZATION EVALUATION                   │
       ├──────────────────────────────┬─────────────────────────────┤
       │ 1. Role / Permission Check   │ Does role have `notes:read`?│
       ├──────────────────────────────┼─────────────────────────────┤
       │ 2. Resource Ownership Check  │ Does User 1042 own doc_771? │
       ├──────────────────────────────┼─────────────────────────────┤
       │ 3. Multi-Tenant Boundary     │ Same tenant organization?   │
       └──────────────────────────────┴─────────────────────────────┘
                                     │ All PASS
                                     ▼
                              200 OK [Payload]
```

---

## 2. Role-Based Access Control (RBAC)

**Role-Based Access Control (RBAC)** is the foundational authorization model for web systems. Instead of assigning individual permissions directly to thousands of users, permissions are grouped into **Roles**, and roles are assigned to users.

$$\text{User} \xrightarrow{\quad\text{assigned to}\quad} \text{Role} \xrightarrow{\quad\text{contains}\quad} \{\text{Permissions}\}$$

### Permission Matrix for Note-Taking System:

| Permission | Regular User | Moderator | Admin | Super Admin |
| :--- | :---: | :---: | :---: | :---: |
| `notes:create` | ✅ | ✅ | ✅ | ✅ |
| `notes:read_own` | ✅ | ✅ | ✅ | ✅ |
| `notes:update_own` | ✅ | ✅ | ✅ | ✅ |
| `notes:delete_own` | ✅ | ✅ | ✅ | ✅ |
| `notes:read_all` | ❌ | ✅ | ✅ | ✅ |
| `notes:flag` | ❌ | ✅ | ✅ | ✅ |
| `notes:read_archived` | ❌ | ❌ | ✅ | ✅ |
| `users:manage` | ❌ | ❌ | ✅ | ✅ |
| `system:configure` | ❌ | ❌ | ❌ | ✅ |

### The Express Middleware Pattern for RBAC:
```typescript
// Declarative route-level authorization
app.get("/admin/audit-logs", authenticate, requirePermission("audit:read"), getAuditLogs);
```

> [!CAUTION]
> **Never Trust Client-Supplied Roles**:
> A user must never be able to elevate their privileges by passing `{ "role": "admin" }` in a `POST` or `PUT` body. Roles must originate exclusively from verified server-side session stores or cryptographically signed JWT claims issued by your auth server.

---

## 3. The Fatal Flaw of Pure RBAC: The BOLA / IDOR Vulnerability

The single most common API vulnerability on the modern web (ranked #1 on the OWASP API Top 10) is **BOLA (Broken Object Level Authorization)**, historically known as **IDOR (Insecure Direct Object Reference)**.

### The Attack Scenario:
1. User Alice logs in with the role `user`.
2. Alice owns Note `101`. Alice sends:
   ```http
   PUT /api/notes/101
   { "content": "Updated my notes" }
   ```
3. The server checks:
   * Is Alice authenticated? **Yes.**
   * Does role `user` have `notes:update` permission? **Yes.**
4. Alice opens developer tools and changes the URL:
   ```http
   PUT /api/notes/102   <--- Note 102 belongs to Bob!
   { "content": "Hacked Bob's secret notes!" }
   ```
5. If the server checks **only the role**, the request succeeds! Alice has overwritten Bob's private data!

```
                  WHY PURE RBAC FAILS AT RESOURCE LEVEL
                                  Alice (Role: "User")
                                           │
                        ┌──────────────────┴──────────────────┐
                        │ Checks Role: Can "User" edit notes? │
                        │ Result: YES!                        │
                        └──────────────────┬──────────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        │ Does Alice own Note 102?            │
                        │ ⚠️ PURE RBAC DOES NOT CHECK THIS!    │
                        └─────────────────────────────────────┘
```

---

## 4. Resource Ownership Verification: Two Implementation Patterns

To prevent BOLA/IDOR, every state-changing route must check **Resource Ownership**.

### Pattern A: In-Memory / Middleware Ownership Check
Query the resource first, compare IDs, and abort if mismatched:
```typescript
const note = await db.note.findById(req.params.id);
if (!note) return res.status(404).json({ error: "Not found" });

if (note.ownerId !== req.user.id && req.user.role !== "admin") {
  return res.status(403).json({ error: "Forbidden: You do not own this note." });
}
```

### Pattern B: Query-Level Scoping (Recommended for High Security & Speed)
Instead of fetching the resource and checking in application code, **enforce ownership directly in the SQL / Database query**. If the resource belongs to another user, zero rows are returned:

```sql
-- Secure update: Only updates if ID matches AND owner_id matches
UPDATE notes
SET content = $1
WHERE id = $2 AND (owner_id = $3 OR $4 = 'admin');
```
* **Security Advantage**: Immune to race conditions and timing leaks. If zero rows are affected, return `404 Not Found` (which also prevents user enumeration).

---

## 5. Advanced Models: ABAC and ReBAC

When systems scale beyond simple roles, two advanced paradigms take over:

```
┌─────────────────────────────────┬────────────────────────────────────────────────────────┐
│ MODEL                           │ CORE DECISION ENGINE                                   │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ **RBAC**                        │ $\text{Decision} = f(\text{User Role}, \text{Action})$ │
│ (Role-Based)                    │                                                        │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ **ABAC**                        │ $\text{Decision} = f(\text{User}, \text{Resource},     │
│ (Attribute-Based)               │ \text{Action}, \text{Environment})$                    │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ **ReBAC**                       │ $\text{Decision} = \text{GraphWalk}(\text{User}        │
│ (Relationship-Based)            │ \xrightarrow{\text{memberOf}} \text{Group}             │
│                                 │ \xrightarrow{\text{owns}} \text{Folder}                │
│                                 │ \xrightarrow{\text{contains}} \text{Doc})$             │
└─────────────────────────────────┴────────────────────────────────────────────────────────┘
```

### ABAC (Attribute-Based Access Control) Example:
Decisions evaluate multi-dimensional contextual attributes:
* **Subject Attributes**: Department = "Finance", Clearance = "Level 3"
* **Resource Attributes**: Classification = "Confidential", Department = "Finance"
* **Environment Attributes**: CurrentTime = "14:30" (Office Hours), IP = "10.0.0.45" (Internal VPN)
* **Policy**: *"Allow read access IF user department matches resource department AND request originates from company VPN during business hours."*

### ReBAC (Relationship-Based Access Control) Example:
Pioneered by Google's Zanzibar architecture. Access is determined by **graph relationships**:
* *"Aminul is an Editor of Folder X"*.
* *"Note Y is located inside Folder X"*.
* Therefore: *"Aminul can edit Note Y"*.

---

## 6. Express/Node.js Pseudocode: Unified RBAC & Ownership Policy Engine

The following TypeScript code implements a production-grade authorization engine combining **Role-to-Permission mapping**, **Permission Middleware**, and **Resource Ownership Policies**.

```typescript
// ==============================================================================
// Chapter 06: Production RBAC & Resource Ownership Engine in Express
// ==============================================================================

import express, { Request, Response, NextFunction } from "express";

const app = express();
app.use(express.json());

// ------------------------------------------------------------------------------
// 1. Roles and Granular Permissions Architecture
// ------------------------------------------------------------------------------
export type Permission =
  | "notes:create"
  | "notes:read_own"
  | "notes:read_all"
  | "notes:edit_own"
  | "notes:edit_all"
  | "notes:delete_own"
  | "notes:delete_all"
  | "notes:read_archived"
  | "users:manage";

export type Role = "user" | "moderator" | "admin";

// Role-to-Permissions Mapping Dictionary
const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  user: new Set([
    "notes:create",
    "notes:read_own",
    "notes:edit_own",
    "notes:delete_own"
  ]),
  moderator: new Set([
    "notes:create",
    "notes:read_own",
    "notes:read_all",
    "notes:edit_own",
    "notes:delete_own"
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
    "users:manage"
  ])
};

export interface AuthContext {
  id: string;
  role: Role;
  tenantId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthContext;
    }
  }
}

// ------------------------------------------------------------------------------
// 2. Mock Database Models
// ------------------------------------------------------------------------------
interface Note {
  id: string;
  tenantId: string;
  ownerId: string;
  title: string;
  content: string;
  isArchived: boolean;
}

const DATABASE_NOTES: Note[] = [
  { id: "note_1", tenantId: "tenant_alpha", ownerId: "usr_alice", title: "Alice's Secret Note", content: "Top secret", isArchived: false },
  { id: "note_2", tenantId: "tenant_alpha", ownerId: "usr_bob",   title: "Bob's Public Note",   content: "Meeting agenda", isArchived: false },
  { id: "note_3", tenantId: "tenant_alpha", ownerId: "usr_alice", title: "Alice's Old Memo",   content: "Archived content", isArchived: true },
  { id: "note_4", tenantId: "tenant_beta",  ownerId: "usr_carol", title: "Carol's Memo",       content: "Different tenant!", isArchived: false }
];

// Mock Authentication Middleware (Attaches simulated caller context)
function mockAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // In production, extracts & verifies JWT / session cookie
  const userId = (req.headers["x-user-id"] as string) || "usr_alice";
  const userRole = (req.headers["x-user-role"] as Role) || "user";
  const tenantId = (req.headers["x-tenant-id"] as string) || "tenant_alpha";

  req.user = { id: userId, role: userRole, tenantId };
  next();
}

app.use(mockAuthMiddleware);

// ------------------------------------------------------------------------------
// 3. Permission Gatekeeper Middleware (RBAC)
// ------------------------------------------------------------------------------
export function requirePermission(...requiredPermissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
      return;
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role];

    const hasPermissions = requiredPermissions.every((perm) => userPermissions.has(perm));
    if (!hasPermissions) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: `Forbidden. Your role '${req.user.role}' lacks required permissions: [${requiredPermissions.join(", ")}]`
      });
      return;
    }

    next();
  };
}

// ------------------------------------------------------------------------------
// 4. Resource Ownership & Multi-Tenant Enforcement Layer
// ------------------------------------------------------------------------------
export class NotePolicyService {
  /**
   * Scoped Query Pattern: Enforces tenant isolation & ownership at query level
   */
  public static getNoteForUser(noteId: string, user: AuthContext): { note: Note | null; status: 200 | 403 | 404 } {
    const note = DATABASE_NOTES.find((n) => n.id === noteId);

    // 1. If note does not exist, return 404
    if (!note) {
      return { note: null, status: 404 };
    }

    // 2. Strict Tenant Boundary Isolation: Never leak resources from other organizations!
    if (note.tenantId !== user.tenantId) {
      return { note: null, status: 404 }; // Obscure existence across tenants
    }

    // 3. Admin / Moderator Bypass: If user has 'notes:read_all'
    if (ROLE_PERMISSIONS[user.role].has("notes:read_all")) {
      return { note, status: 200 };
    }

    // 4. Resource Ownership Verification (Anti-BOLA)
    if (note.ownerId !== user.id) {
      return { note: null, status: 403 };
    }

    return { note, status: 200 };
  }
}

// ------------------------------------------------------------------------------
// 5. Protected Endpoints Composing RBAC & Ownership
// ------------------------------------------------------------------------------

// Read a Specific Note (Guarded against BOLA/IDOR)
app.get("/api/notes/:id", requirePermission("notes:read_own"), (req: Request, res: Response) => {
  const noteId = req.params.id;
  const user = req.user!;

  const { note, status } = NotePolicyService.getNoteForUser(noteId, user);

  if (status === 404) {
    res.status(404).json({ error: "NOT_FOUND", message: `Note ${noteId} not found.` });
    return;
  }

  if (status === 403) {
    res.status(403).json({
      error: "FORBIDDEN",
      message: "Forbidden. You do not own this note and lack permission to view other users' notes."
    });
    return;
  }

  res.json({ data: note });
});

// Update a Note (Ensures ownership or 'notes:edit_all' permission)
app.put("/api/notes/:id", requirePermission("notes:edit_own"), (req: Request, res: Response) => {
  const noteId = req.params.id;
  const user = req.user!;
  const { content } = req.body;

  const { note, status } = NotePolicyService.getNoteForUser(noteId, user);

  if (status !== 200 || !note) {
    res.status(status).json({ error: status === 404 ? "NOT_FOUND" : "FORBIDDEN" });
    return;
  }

  // Check if updating another user's note without 'notes:edit_all'
  if (note.ownerId !== user.id && !ROLE_PERMISSIONS[user.role].has("notes:edit_all")) {
    res.status(403).json({ error: "FORBIDDEN", message: "Cannot edit another user's note." });
    return;
  }

  note.content = content;
  res.json({ message: "Note updated successfully", data: note });
});

// Admin-Only Route: View Archived Notes
app.get("/api/admin/archived-notes", requirePermission("notes:read_archived"), (req: Request, res: Response) => {
  const user = req.user!;
  // Tenant-scoped archived notes
  const archives = DATABASE_NOTES.filter((n) => n.tenantId === user.tenantId && n.isArchived);
  res.json({ tenant: user.tenantId, count: archives.length, data: archives });
});

export default app;
```

---

## 7. Key Takeaways for Authorization Design

1. **RBAC is necessary but never sufficient on its own**: Roles tell you *what category of actions* a user may take; ownership checks tell you *which exact rows* they may touch.
2. **Never return details that aid attacker reconnaissance**: If a note belongs to another tenant or does not exist, return `404 Not Found` rather than `403 Forbidden` to prevent object existence enumeration.
3. **Push ownership filters into database queries**: Enforcing `WHERE id = :id AND owner_id = :userId` in the SQL/ORM layer is faster and eliminates race conditions.
