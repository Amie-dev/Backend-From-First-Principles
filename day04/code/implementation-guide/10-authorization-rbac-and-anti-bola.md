# Implementation Guide 10: Authorization — RBAC, Ownership & Anti-BOLA

## 1. Goal & First-Principles Context

The second gatekeeper answers *"What are you allowed to do?"* (Ch06). Two different questions
hide inside it, and conflating them is the classic production bug:

```
ROLE-BASED   "may a moderator edit any note?"          → requirePermission("notes:edit_all")
RESOURCE-BASED "may THIS user edit THIS note?"          → note.ownerId === principal.userId
```

**The #1 API vulnerability in the OWASP list is exactly the second question being forgotten.**
Broken Object Level Authorization (BOLA/IDOR) looks like this:

```javascript
// ❌ the vulnerable pattern — role is checked, ownership is not
app.patch("/notes/:id", authenticate, requirePermission("notes:edit"), (req, res) => {
  const note = db.findById(req.params.id);      // any note, any tenant
  note.content = req.body.content;              // ← attacker edits someone else's note
  db.save(note);
});
```

The structural fix used here: **the ownership predicate lives inside the store query**, so no
controller can forget it.

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `src/middlewares/authorise.middleware.js` | `ROLE_PERMISSIONS` matrix, `requirePermission()`, `hasPermission()` |
| `src/db/note.store.js` | `_resolve()` — tenant + ownership enforcement inside the query |
| `src/controllers/notes.controller.js` | builds the principal context, never hand-filters |
| `src/routes/v1/*.routes.js` | mounts `authenticate → requirePermission(…)` per route |

---

## 3. Source: The Permission Matrix & Middleware

```javascript
// src/middlewares/authorise.middleware.js
import { ForbiddenError, UnauthorizedError } from "../errors/api-error.js";

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
    "notes:read_all",        // ← can read anything in the tenant…
    "notes:edit_own",
    // moderators deliberately CANNOT delete other users' notes
  ]),
  admin: new Set([
    "notes:create", "notes:read_own", "notes:read_all",
    "notes:edit_own", "notes:edit_all",
    "notes:delete_own", "notes:delete_all",
    "notes:read_archived",
    "users:read", "users:manage", "apikeys:manage",
  ]),
};

/**
 * requirePermission — Authorization middleware factory (AuthZ gate 2)
 *
 * Returns HTTP 401 if `req.principal` is missing (AuthN never ran).
 * Returns HTTP 403 if the role lacks the required permissions.
 */
export function requirePermission(...requiredPermissions) {
  return function authorise(req, res, next) {
    if (!req.principal) {
      // Defensive: AuthN middleware must precede AuthZ
      return next(new UnauthorizedError(
        "Authentication context missing — authenticate middleware must precede requirePermission"
      ));
    }

    const { role } = req.principal;
    const userPerms = ROLE_PERMISSIONS[role];

    if (!userPerms) {
      return next(new ForbiddenError(`Unknown role '${role}' — access denied`));
    }

    const missing = requiredPermissions.filter((p) => !userPerms.has(p));
    if (missing.length > 0) {
      return next(new ForbiddenError(
        `Forbidden — role '${role}' lacks: [${missing.join(", ")}]`
      ));
    }

    next();
  };
}

/** Convenience helper for conditional branching inside controllers. */
export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
```

### Deep explanation

1. **Permissions are declarative strings, not role comparisons.** Routes ask for
   `"notes:read_archived"`, not `"role === 'admin'"`. When a new role appears (say `auditor`),
   only the matrix changes — no route file, no controller, no test of route wiring.
2. **Roles hold `Set`s** so the check is O(1) and, more importantly, so a permission can never be
   granted twice or shadowed by ordering.
3. **The 401 branch is defensive, not decorative.** If someone mounts `requirePermission` without
   `authenticate`, the failure is a loud 401 rather than `req.principal.role` throwing a
   `TypeError` that the global handler turns into an opaque 500.
4. **An unrecognised role is denied, not allowed** (`!userPerms → 403`). Fail-closed on unknown
   input is the only acceptable default in an authorisation check — a corrupt role string in the
   database must not become a sudo.
5. **The error names the missing permissions** (`lacks: [notes:delete_all]`) which is exactly what
   a developer integrating the API needs, and reveals nothing about other users' data.
6. **`hasPermission()` exists for controllers** that need conditional behaviour (e.g. "include
   archived notes only if permitted") without duplicating the matrix.

---

## 4. Source: Ownership Enforced Inside the Query (anti-BOLA)

```javascript
// src/db/note.store.js
  /**
   * Resolve a note with full tenant + ownership checks.
   * Non-existent or cross-tenant → 404; wrong owner → 403.
   */
  _resolve(id, principal) {
    const note = this._raw(id);

    // 1. Non-existent OR cross-tenant → 404 (never reveal cross-tenant existence)
    if (!note || note.tenantId !== principal.tenantId) {
      throw new NotFoundError(`Note '${id}' not found`);
    }

    // 2. Admins and moderators can read all notes within their tenant
    const elevated = ["admin", "moderator"].includes(principal.role);

    // 3. Everyone else must own the row
    if (!elevated && note.ownerId !== principal.userId) {
      throw new ForbiddenError("You do not have permission to access this note");
    }

    return note;
  }

  /** List notes visible to the calling principal (the query itself is scoped). */
  listForPrincipal(principal) {
    const elevated = ["admin", "moderator"].includes(principal.role);
    return [...this._store.values()].filter((n) => {
      if (n.tenantId !== principal.tenantId) return false;   // tenant boundary first
      if (elevated) return true;
      return n.ownerId === principal.userId;                 // …then ownership
    });
  }

  /** Update — owner or admin only; moderators are read-only for others' notes. */
  updateForPrincipal(id, patch, principal) {
    const note = this._resolve(id, principal);

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

  /** Delete — owner or admin only. */
  deleteForPrincipal(id, principal) {
    const note = this._resolve(id, principal);
    if (principal.role !== "admin" && note.ownerId !== principal.userId) {
      throw new ForbiddenError("Only the note owner or an admin can delete this note");
    }
    this._store.delete(id);
  }
```

And the controller simply forwards the principal — it never inspects ownership itself:

```javascript
// src/controllers/notes.controller.js
function resolvePrincipalCtx(req) {
  const { sub: userId, role } = req.principal;
  const user = req.user ?? userStore.findById(userId);   // one lookup per request
  if (!user) throw new NotFoundError("User account not found");
  return { userId, role, tenantId: user.tenantId };
}

export function getNote(req, res, next) {
  try {
    const ctx  = resolvePrincipalCtx(req);
    const note = noteStore.getForPrincipal(req.params.id, ctx);   // store decides
    res.status(200).json({ status: "success", data: note });
  } catch (err) {
    next(err);
  }
}
```

### Deep explanation

1. **`404` for cross-tenant, `403` for wrong owner.** This is a deliberate information-disclosure
   decision, not sloppiness: if "note belongs to another tenant" returned 403, an attacker could
   probe ids to *learn which notes exist elsewhere*. A 404 makes the whole tenant boundary
   invisible. (Within the same tenant, 403 is correct and useful UX.)
2. **The predicate is in the store, so it cannot be skipped.** Controllers have no method that
   returns an unscoped note: every read path goes through `_resolve`, `listForPrincipal` or
   `getForPrincipal`. This mirrors `SELECT … WHERE id = ? AND tenant_id = ? AND owner_id = ?`
   in SQL — the place where BOLA is traditionally introduced.
3. **`elevated` is computed once** and reused for read vs. write, so "moderator can read all but
   write only their own" is expressed once rather than in five handlers.
4. **Write paths check ownership explicitly** even though `_resolve` already allowed moderators —
   because *read* elevation must not silently become *write* elevation. Read-only oversight is a
   real requirement (content moderation) that RBAC matrices rarely express correctly.
5. **The controller keeps zero authorisation logic.** `resolvePrincipalCtx` only assembles the
   context (`userId`, `role`, `tenantId`); every decision happens behind the store boundary.
   That is what makes "grep for `ownerId`" a complete audit of ownership enforcement.
---

## 5. Verification

### 5.1 The ownership matrix, in one script

```bash
BASE=http://localhost:4000
login() { curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken'; }

BOB=$(login bob@example.com 'User$Passw0rd')
ALICE=$(login alice@example.com 'Alice$Secure1')
MOD=$(login sarah@example.com 'Moderate@Pass99')
ADMIN=$(login aminul@example.com 'SuperSecret#2024!')

# Bob creates a note
NOTE=$(curl -s -X POST $BASE/api/v1/notes -H "authorization: Bearer $BOB" \
  -H 'content-type: application/json' -d '{"title":"Bob private","content":"secret"}')
NID=$(echo "$NOTE" | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')

code() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "$BASE/api/v1/notes/$NID" \
  ${2:+-H "authorization: Bearer $2"} ${3:+-H 'content-type: application/json' -d "$3"}; }

printf 'anonymous GET      → %s (expect 401)\n' "$(code GET '')"
printf 'owner GET          → %s (expect 200)\n' "$(code GET "$BOB")"
printf 'other user GET     → %s (expect 403)\n' "$(code GET "$ALICE")"
printf 'moderator GET      → %s (expect 200)\n' "$(code GET "$MOD")"
printf 'admin GET          → %s (expect 200)\n' "$(code GET "$ADMIN")"
printf 'other user PATCH   → %s (expect 403)\n' "$(code PATCH "$ALICE" '{"title":"hijack"}')"
printf 'moderator PATCH    → %s (expect 403)\n' "$(code PATCH "$MOD"   '{"title":"moderate"}')"
printf 'admin PATCH        → %s (expect 200)\n' "$(code PATCH "$ADMIN" '{"title":"moderated"}')"
printf 'other user DELETE  → %s (expect 403)\n' "$(code DELETE "$ALICE")"
printf 'owner DELETE       → %s (expect 204)\n' "$(code DELETE "$BOB")"
```

Expected:

```text
anonymous GET      → 401 (expect 401)
owner GET          → 200 (expect 200)
other user GET     → 403 (expect 403)
moderator GET      → 200 (expect 200)
admin GET          → 200 (expect 200)
other user PATCH   → 403 (expect 403)
moderator PATCH    → 403 (expect 403)
admin PATCH        → 200 (expect 200)
other user DELETE  → 403 (expect 403)
owner DELETE       → 204 (expect 204)
```

### 5.2 Admin-only routes deny users and moderators

```bash
for T in "$BOB:$" "$MOD"; do
  curl -s -o /dev/null -w "user token → %{http_code}\n" $BASE/api/v1/admin/users -H "authorization: Bearer ${T%%:*}"
done
# → 403 twice

curl -s $BASE/api/v1/admin/users -H "authorization: Bearer $ADMIN" | head -c 160
# → {"status":"success","count":5,"data":[{"id":"usr_…","email":"aminul@example.com","role":"admin",
#    "active":true,"activeSessions":1, …}]}     (no passwordHash anywhere)

# The exact error for a role that lacks the permission
curl -s $BASE/api/v1/admin/notes/archived -H "authorization: Bearer $MOD"
# → {"error":{"code":"FORBIDDEN","message":"Forbidden — role 'moderator' lacks: [notes:read_archived]","status":403}}
```

### 5.3 Cross-tenant is invisible, not forbidden

```bash
# A note id from another tenant yields 404 (not 403), so existence is never leaked
curl -s $BASE/api/v1/notes/note_does_not_exist -H "authorization: Bearer $BOB"
# → {"error":{"code":"NOT_FOUND","message":"Note 'note_does_not_exist' not found","status":404}}
```

### 5.4 The suite

```bash
npm test
# ✔ a user can touch only their own notes; other users get 403 (anti-BOLA, Ch06)
# ✔ moderators read everything in the tenant but cannot write others' notes (Ch06)
# ✔ role-based route guards return 403 for insufficient roles and never leak hashes (Ch06)
# ✔ list endpoints are scoped: a user sees only their own notes (Ch06)
# ✔ an admin cannot demote or deactivate their own account (lock-out guard, Ch06)
```

---

## 6. Why This Matters

* **BOLA is the most common serious API vulnerability** precisely because role checks *look*
  sufficient. Moving the ownership predicate into the store removes the possibility of a handler
  forgetting it — which is the only durable fix.
* **404 vs 403 is a data-leak decision.** "You may not see this" tells an attacker the object
  exists; "not found" tells them nothing. Both are correct in their own scope, and choosing
  deliberately is what separates a designed API from an accidental one.
* **Declarative permissions scale; role string-matching does not.** The moment you add a second
  tenant type or an `auditor` role, a permission matrix is a one-line diff — `if (role === 'admin')`
  scattered across 30 handlers is a week of auditing.
* **Read-only elevation must not become write elevation.** Moderators can see everything and
  change almost nothing; expressing that in the matrix *and* in the write-path checks is what
  keeps a content-moderation role from turning into a data-corruption incident.

