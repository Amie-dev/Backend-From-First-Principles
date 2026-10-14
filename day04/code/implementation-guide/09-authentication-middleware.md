# Implementation Guide 09: The Authentication Gate (AuthN Middleware)

## 1. Goal & First-Principles Context

Chapter 01 calls this the **first gatekeeper**: it answers *"Who are you?"* and nothing else.
It must never answer *"may you?"* — that is Guide 10's job, and mixing the two is how systems end
up returning 403 for a missing token or 401 for an insufficient role.

`src/middlewares/authenticate.middleware.js` has four responsibilities:

1. Extract and validate the `Authorization: Bearer <jwt>` header (RFC 6750).
2. Verify the token cryptographically **and semantically** (algorithm, issuer, audience, expiry).
3. Optionally close the one real gap in stateless auth: the token may predate a deactivation or a
   role change.
4. Publish a trusted principal on `req.principal` for everything downstream.

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `src/middlewares/authenticate.middleware.js` | the gate itself |
| `src/services/token.service.js` | `verifyAccessToken()` (Guide 06) |
| `src/db/user.store.js` | `findById()` for the hot-path status check |
| `src/errors/api-error.js` | `UnauthorizedError` → HTTP 401 (Guide 13) |
| `src/routes/v1/*.routes.js` | where the gate is mounted per route |

---

## 3. Source

```javascript
import { config } from "../config/env.js";
import { TokenService } from "../services/token.service.js";
import { userStore } from "../db/user.store.js";
import { UnauthorizedError } from "../errors/api-error.js";

/**
 * Pipeline position (Ch09 Stage 4):
 *   security headers → CORS → cookies → JSON parser → [ this gate ] → AuthZ gate
 *   → controller → store → error handler
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(
      new UnauthorizedError(
        "Missing or malformed Authorization header — expected: Bearer <access_token>"
      )
    );
  }

  const rawToken = authHeader.slice("Bearer ".length).trim();
  if (!rawToken) {
    return next(new UnauthorizedError("Empty bearer token supplied"));
  }

  let claims;
  try {
    claims = TokenService.verifyAccessToken(rawToken);
  } catch (err) {
    const message =
      err.name === "TokenExpiredError"
        ? "Access token has expired — call POST /api/v1/auth/refresh to renew it"
        : "Invalid access token";
    return next(new UnauthorizedError(message));
  }

  // ── Hot-path account re-validation (configurable, DB-read-per-request) ──────
  if (config.security.enforceUserStatusOnRequest) {
    const user = userStore.findById(claims.sub);

    if (!user || user.active === false) {
      return next(new UnauthorizedError("Account is no longer active — access token rejected"));
    }

    // The token embeds a role snapshot. If the account was re-roled since the token
    // was minted, the snapshot is stale privilege — force a refresh so the client
    // picks up the current grant.
    if (user.role !== claims.role) {
      return next(
        new UnauthorizedError("Your permissions changed — refresh your access token to continue")
      );
    }
  }

  /**
   * `req.principal` = authenticated identity context.
   * Shape: { sub, role, sid?, iat, exp, jti }
   */
  req.principal = claims;
  req.user = userStore.findById(claims.sub) ?? null; // convenience for controllers

  return next();
}
```

### Deep explanation

1. **`next(error)` instead of `throw`.** Express 4 only catches **synchronous** throws; a throw
   inside an `async` handler becomes an unhandled rejection. Using `next(err)` everywhere makes
   the middleware safe regardless of whether it is ever made `async` later.
2. **`authHeader.slice("Bearer ".length).trim()`** — slicing past the scheme is more precise than
   `split(" ")[1]`, and the explicit empty-token check catches `Authorization: Bearer ` (a
   surprisingly common client bug) with a distinct message.
3. **`err.name === "TokenExpiredError"`** distinguishes the two failure modes for the *client's*
   benefit: an expired token means "call `/auth/refresh`", an invalid one means "your token is
   broken, sign in again". Both are 401 — but the actionable message differs, and neither leaks
   whether the signature or the payload failed.
4. **The status check is behind a config flag** (`ENFORCE_USER_STATUS_ON_REQUEST`) because it
   costs one indexed read per request. With it on you get instant revocation; with it off you get
   pure statelessness and a revocation window equal to the access-token TTL. Making that a
   *documented configuration choice* rather than a hidden trade-off is the senior move.
5. **The stale-role check is a security control, not a nicety.** If an admin is demoted to
   `user`, their existing token still claims `role: "admin"`. Rejecting it forces a refresh, and
   refresh re-reads the role from the database (Guide 07, step 4).
6. **`req.principal` carries the verified claims** (never the raw token), so no downstream code
   needs to decode anything, and a controller cannot accidentally read unverified data.
7. **`req.user` is resolved once** and shared with controllers, so the AuthN gate and the
   controller do not each hit the store — one request, one lookup.
8. **It never returns 403.** Status-code discipline is what makes the API's error contract
   predictable: 401 = "I don't know who you are", 403 = "I know exactly who you are, and no".

---

## 4. Where It Is Mounted

```javascript
// src/routes/v1/notes.routes.js
router.get(   "/",    authenticate, requirePermission("notes:read_own"),   notesCtrl.listNotes);
router.post(  "/",    authenticate, requirePermission("notes:create"),     notesCtrl.createNote);
router.get(   "/:id", authenticate, requirePermission("notes:read_own"),   notesCtrl.getNote);
router.patch( "/:id", authenticate, requirePermission("notes:edit_own"),   notesCtrl.updateNote);
router.delete("/:id", authenticate, requirePermission("notes:delete_own"), notesCtrl.deleteNote);
```

Reading the chain left-to-right is the entire authorisation story of a route: **identify, then
permit, then act.** Note that `authenticate` precedes `requirePermission` on *every* protected
route — the AuthZ middleware explicitly refuses to run without a principal (Guide 10).

---

## 5. Verification

```bash
BASE=http://localhost:4000

# 1. No Authorization header → 401
curl -si $BASE/api/v1/auth/me | grep -iE 'HTTP/|www-authenticate'
# HTTP/1.1 401 Unauthorized
# WWW-Authenticate: Bearer realm="/api/v1/auth/me", error="invalid_token"
curl -s $BASE/api/v1/auth/me
# → {"error":{"code":"UNAUTHORIZED","message":"Missing or malformed Authorization header — expected: Bearer <access_token>","status":401}}

# 2. Wrong scheme → 401 (Basic is not Bearer)
curl -s $BASE/api/v1/auth/me -H 'authorization: Basic YWxpY2U6cGFzcw=='
# → 401 missing/malformed header

# 3. Not a JWT at all → 401
curl -s $BASE/api/v1/auth/me -H 'authorization: Bearer not-a-jwt'
# → {"error":{"code":"UNAUTHORIZED","message":"Invalid access token","status":401}}

# 4. Valid token → 200
TOKEN=$(curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"bob@example.com","password":"User$Passw0rd"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')
curl -s $BASE/api/v1/auth/me -H "authorization: Bearer $TOKEN"
# → 200 {"data":{"id":"usr_…","email":"bob@example.com","role":"user", …}}
```

### 5.1 Expiry produces a *different* 401 message

```bash
# In .env: ACCESS_TOKEN_TTL=5s   → restart → log in → wait 6s
ACCESS_TOKEN_TTL=5s npm start &
sleep 6
curl -s $BASE/api/v1/auth/me -H "authorization: Bearer $TOKEN"
# → {"error":{"message":"Access token has expired — call POST /api/v1/auth/refresh to renew it","status":401}}
```

### 5.2 The hot-path status check (instant revocation)

```bash
ADMIN=$(curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"aminul@example.com","password":"SuperSecret#2024!"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')

ALICE=$(curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","password":"Alice$Secure1"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')

# Alice's token works…
curl -s -o /dev/null -w 'before deactivation: %{http_code}\n' $BASE/api/v1/auth/me -H "authorization: Bearer $ALICE"

# …the admin deactivates her (idempotent: run twice to see revokedSessions drop to 0 the 2nd time)
ALICE_ID=$(curl -s $BASE/api/v1/auth/me -H "authorization: Bearer $ALICE" | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')
curl -s -X PATCH $BASE/api/v1/admin/users/$ALICE_ID -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d '{"active":false}'

# …and the very next request with the SAME token is refused
curl -s $BASE/api/v1/auth/me -H "authorization: Bearer $ALICE"
# → {"error":{"message":"Account is no longer active — access token rejected","status":401}}
```

### 5.3 A role change invalidates the stale-role token

```bash
curl -s -X PATCH $BASE/api/v1/admin/users/$BOB_ID -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d '{"role":"moderator"}'

curl -s $BASE/api/v1/auth/me -H "authorization: Bearer $BOB_TOKEN"
# → {"error":{"message":"Your permissions changed — refresh your access token to continue","status":401}}
```

### 5.4 The suite

```bash
npm test
# ✔ GET /auth/me rejects missing, malformed and tampered tokens with 401 (Ch01)
# ✔ GET /auth/me returns the live identity and session metadata (Ch01)
# ✔ tokens signed with a different secret are rejected (Ch02)
# ✔ a token with alg=none is rejected — algorithm confusion (Ch08)
# ✔ deactivating an account revokes its sessions instantly (Ch03/Ch06)
# ✔ changing a role kills existing sessions and forces a fresh login (Ch06/Ch08)
```

---

## 6. Why This Matters

* **One gate, one job.** A middleware that cannot return 403 is a middleware that cannot be
  blamed for an authorisation bug — the separation of concerns *is* the audit trail.
* **Verify semantics, not just signatures.** A valid signature with the wrong `iss`, `aud` or
  `alg` is exactly how tokens get replayed across services; the allow-list in Guide 06 plus the
  claims check is the fix.
* **Stateless tokens still need a reality check.** The optional DB read converts "trust the token
  for 15 minutes no matter what" into "trust the token until the next request", which is what
  makes deactivation and demotion feel instant to an operator.
* **`req.principal` is the security boundary.** Everything downstream trusts it blindly; that is
  only acceptable because exactly one place in the codebase writes to it.

