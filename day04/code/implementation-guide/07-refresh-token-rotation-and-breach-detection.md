# Implementation Guide 07: Refresh-Token Rotation & Breach Detection

## 1. Goal & First-Principles Context

Guides 05–06 gave us a stateless access token with no way to revoke it. This guide adds the
missing half of the **hybrid model** (Ch03):

```
ACCESS TOKEN                          REFRESH TOKEN
────────────────────────────────      ──────────────────────────────────────────
JWT, 15 minutes                        opaque 128-bit id, 7 days
verified with a local secret           stored server-side (family + lineage)
ZERO database lookups                  the revocation lever
cannot be revoked by design            rotation + reuse detection
```

**Refresh Token Rotation (RTR):** every successful refresh *consumes* the presented token and
mints a new one **in the same family**. If a token that was already consumed is presented
again, two parties hold copies — the thief and the legitimate client — and we cannot tell them
apart. So we do the only safe thing: **revoke the entire family** and force re-authentication.

That converts a silent, indefinite session hijack into a loud, bounded incident — usually
within one 15-minute access-token lifetime.

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `src/services/token.service.js` | `RefreshTokenStore` (lineage) + `TokenService.rotateTokenPair()` |
| `src/controllers/auth.controller.js` | `refresh()`, `logout()`, `logoutAll()`, `listSessions()` |
| `src/middlewares/cookies.middleware.js` | delivers the opaque id (Guide 08) |
| `src/controllers/users.controller.js` | revokes all sessions on role change/deactivation |

---

## 3. Source: The Refresh-Token Store

```javascript
/**
 * @typedef {Object} RefreshRecord
 * @property {string}  tokenId     - opaque 128-bit id (what the cookie carries)
 * @property {string}  familyId    - lineage id; a breach kills the whole family
 * @property {string}  userId
 * @property {string}  role        - role snapshot (re-verified on every rotation)
 * @property {boolean} revoked     - true once consumed, replayed, or logged out
 * @property {number}  createdAt
 * @property {number}  lastUsedAt
 * @property {number}  expiresAt
 */

class RefreshTokenStore {
  constructor() {
    /** @type {Map<string, RefreshRecord>} keyed by tokenId */
    this._store = new Map();
  }

  /** Mint a new record. Omitting familyId starts a NEW family (that's a fresh login). */
  create(userId, role, familyId, context = {}) {
    const now = Date.now();
    const record = {
      tokenId: crypto.randomUUID(),
      familyId: familyId || crypto.randomUUID(),
      userId,
      role,
      revoked: false,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now + config.jwt.refreshTtlMs,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    };
    this._store.set(record.tokenId, record);
    return record;
  }

  find(tokenId) {
    if (typeof tokenId !== "string" || tokenId.length === 0) return null;
    return this._store.get(tokenId) ?? null;
  }

  /** Consume (or hard-revoke) a single token. */
  revoke(tokenId) {
    const record = this._store.get(tokenId);
    if (record) record.revoked = true;
  }

  /** BREACH CIRCUIT BREAKER — revoke every token descended from one login. */
  revokeFamily(familyId) {
    let killed = 0;
    for (const record of this._store.values()) {
      if (record.familyId === familyId && !record.revoked) {
        record.revoked = true;
        killed += 1;
      }
    }
    if (killed > 0) {
      logger.warn("token family revoked", { familyId, killed, reason: "reuse_detected" });
    }
    return killed;
  }

  /** Global sign-out / role change / deactivation: kill every session a user holds. */
  revokeAllForUser(userId) {
    let killed = 0;
    for (const record of this._store.values()) {
      if (record.userId === userId && !record.revoked) {
        record.revoked = true;
        killed += 1;
      }
    }
    return killed;
  }

  /** Active-session inventory for the account page. */
  listActiveForUser(userId) {
    const now = Date.now();
    return [...this._store.values()].filter(
      (r) => r.userId === userId && !r.revoked && r.expiresAt > now
    );
  }

  /** Purge expired rows (a Redis TTL would do this for free). */
  prune() {
    const now = Date.now();
    let removed = 0;
    for (const [id, record] of this._store.entries()) {
      if (now > record.expiresAt) { this._store.delete(id); removed += 1; }
    }
    return removed;
  }
}

export const refreshStore = new RefreshTokenStore();
```

### Deep explanation

1. **`tokenId` is an opaque `crypto.randomUUID()`** — 122 bits of CSPRNG entropy. There is
   nothing to guess and no signature to crack, which is why a plain `Map` lookup is safe here
   (a lookup *by key* does not leak timing the way a byte-by-byte comparison would).
2. **`familyId` is the whole trick.** All rotations of one login share it, so "this token was
   replayed" can be escalated to "every token from this login is dead" in O(1).
3. **`role` is stored as a snapshot** and deliberately **re-read from the user store on every
   rotation** (next section) so a promotion or demotion takes effect at the next refresh.
4. **Records carry `ip` and `userAgent`** — the account-security page can then answer "where am
   I signed in from?", and an incident responder can correlate a token family with a source.
5. **`prune()` is the in-memory stand-in for Redis TTLs.** The same shape maps 1:1 onto
   `SET refresh:{tokenId} … EX 604800` plus a `SADD family:{familyId} {tokenId}` index.
6. **Every mutation is an explicit method** (`revoke`, `revokeFamily`, `revokeAllForUser`) so
   "how do I kill a session?" has exactly one answer per granularity.

---

## 4. Source: `TokenService.rotateTokenPair()`

```javascript
  /** Typed token errors (mapped to HTTP statuses by the auth controller). */
  // class TokenError extends Error { constructor(code, message) { super(message); this.code = code; } }

  /**
   * Refresh Token Rotation — the heart of the hybrid model.
   *
   *   1. Unknown token         → reject (never existed, already pruned, or forged).
   *   2. Already-revoked token → REPLAY. Kill the whole family (circuit breaker).
   *   3. Expired token         → reject and stop tracking it.
   *   4. Re-read the user from the database. This is the critical check a purely
   *      stateless design cannot do: role changes and deactivations take effect at
   *      the next refresh instead of at the end of the 7-day life.
   *   5. Consume the old token and mint a new one in the same family.
   */
  static rotateTokenPair(presentedTokenId, context = {}) {
    const record = refreshStore.find(presentedTokenId);

    // 1. Unknown / forged / pruned token
    if (!record) {
      throw new TokenError(
        "INVALID_REFRESH_TOKEN",
        "Refresh token is not recognised — it may have been revoked, expired, or fabricated"
      );
    }

    // 2. REPLAY → breach circuit breaker
    if (record.revoked) {
      refreshStore.revokeFamily(record.familyId);
      logger.error("refresh token replay detected", {
        userId: record.userId,
        familyId: record.familyId,
        ip: context.ip ?? null,
        reason: "REFRESH_TOKEN_REUSE_DETECTED",
      });
      throw new TokenError(
        "REFRESH_TOKEN_REUSE_DETECTED",
        "This refresh token was already used — all sessions for the account have been revoked"
      );
    }

    // 3. TTL elapsed
    if (Date.now() > record.expiresAt) {
      refreshStore.revoke(presentedTokenId);
      throw new TokenError("REFRESH_TOKEN_EXPIRED", "Session expired — please sign in again");
    }

    // 4. Re-validate the principal against CURRENT state, not the token snapshot
    const user = userStore.findById(record.userId);
    if (!user || user.active === false) {
      refreshStore.revokeAllForUser(record.userId);
      throw new TokenError(
        "ACCOUNT_DISABLED",
        "Account is not active — all sessions have been revoked"
      );
    }

    // 5. Rotate: consume the presented token, issue a fresh pair in the same family
    refreshStore.revoke(presentedTokenId);
    const next = refreshStore.create(user.id, user.role, record.familyId, context);
    const accessToken = TokenService.signAccessToken(user, record.familyId);

    return {
      accessToken,
      refreshTokenId: next.tokenId,
      familyId: record.familyId,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /** Revoke one refresh token (logout of a single device). */
  static revokeRefreshToken(tokenId) {
    const record = refreshStore.find(tokenId);
    if (!record) return false;
    refreshStore.revoke(tokenId);
    return true;
  }

  /** "Sign out everywhere" / password reset / role change / admin deactivation. */
  static revokeAllSessionsForUser(userId) {
    const killed = refreshStore.revokeAllForUser(userId);
    if (killed > 0) logger.warn("all sessions revoked", { userId, killed });
    return killed;
  }

  /** Active-session inventory for the account page ("where am I signed in?"). */
  static listActiveSessions(userId) {
    return refreshStore.listActiveForUser(userId).map((r) => ({
      tokenId: r.tokenId, familyId: r.familyId,
      createdAt: r.createdAt, lastUsedAt: r.lastUsedAt, expiresAt: r.expiresAt,
      ip: r.ip, userAgent: r.userAgent,
    }));
  }
}
```

### Deep explanation

1. **Step order matters.** "Already revoked" must be checked *before* the expiry check,
   otherwise an expired-and-consumed token would be reported as simply expired and the replay
   would go unnoticed.
2. **The replay branch revokes the family *and then* throws.** Ordering the side effect first
   guarantees the response cannot be lost while the attacker keeps a live session.
3. **`logger.error` on replay, `logger.warn` elsewhere.** A token replay is an incident-grade
   event: it should page someone or at least feed a SIEM rule, not sit in debug logs.
4. **Step 4 is what makes role changes safe.** A purely stateless design would keep serving the
   old role until the refresh token expired; here the refresh re-reads `user.role`, so the new
   token carries the current grant — and if the account was disabled, every session dies.
5. **New token, same family.** The family id is passed explicitly (`record.familyId`), which is
   what allows step 2 to catch a replay many generations later.
6. **The error type is a `TokenError` with a machine-readable `code`**, so the HTTP layer decides
   status codes while the service stays framework-agnostic.

---

## 5. Source: The `refresh()` HTTP Handler

```javascript
// src/controllers/auth.controller.js
export function refresh(req, res, next) {
  const presented = req.cookies?.[REFRESH_COOKIE];   // cookie only — never a body field

  try {
    if (!presented) {
      clearRefreshCookie(res);
      throw new UnauthorizedError("Refresh token missing — sign in again");
    }

    const rotated = TokenService.rotateTokenPair(presented, clientContext(req));
    setRefreshCookie(res, rotated.refreshTokenId);   // replace the cookie in the SAME response

    res.status(200).json({
      status: "success",
      message: "Access token renewed (refresh token rotated)",
      data: { accessToken: rotated.accessToken, tokenType: "Bearer", expiresIn: rotated.expiresIn },
    });
  } catch (err) {
    clearRefreshCookie(res);   // never let the client retry with a dead credential

    if (err instanceof TokenError) {
      logger.warn("refresh rejected", { code: err.code, ip: req.ip });
      return next(
        new UnauthorizedError(
          err.code === "REFRESH_TOKEN_REUSE_DETECTED"
            ? `${err.message}. If this was not you, your credentials may be compromised — sign in again.`
            : err.message
        )
      );
    }
    return next(err);
  }
}
```

### Deep explanation

1. **The token is read from the cookie only.** Accepting it from the body as well would mean a
   JavaScript-readable credential exists — the entire reason it lives in an `HttpOnly` cookie is
   that XSS cannot touch it.
2. **The new cookie is set on the same response** that returns the new access token, so a client
   applying the cookie jar atomically can never hold half a token pair.
3. **`clearRefreshCookie` on *every* failure path.** Otherwise the browser keeps re-sending a
   dead token and the user sees a loop of mysterious 401s instead of a clean "sign in again".
4. **`TokenError` codes collapse into one 401** — the caller learns only "your session is over",
   never which internal branch fired (that stays in the server log). The reuse case adds one
   sentence because it is the event a legitimate user genuinely needs to know about.

---

## 6. Verification

### 6.1 Rotation consumes the old token

```bash
BASE=http://localhost:4000
JAR=/tmp/day04.jar; JAR2=/tmp/day04b.jar
rm -f $JAR $JAR2

# Log in, keeping the cookie in $JAR
curl -s -c $JAR -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"sarah@example.com","password":"Moderate@Pass99"}' -o /dev/null

# Rotate: the new cookie goes to $JAR2
curl -si -b $JAR -c $JAR2 -X POST $BASE/api/v1/auth/refresh | grep -iE 'HTTP/|set-cookie'
```

```text
HTTP/1.1 200 OK
Set-Cookie: refreshToken=9d55dcbe-26f4-451e-b34e-1e92218808ce; Max-Age=604800; Path=/api/v1/auth; HttpOnly; SameSite=Strict
```

### 6.2 Replaying the consumed token fires the circuit breaker

```bash
curl -s -b $JAR -X POST $BASE/api/v1/auth/refresh     # old, already-consumed cookie
```

```json
{"error":{"code":"UNAUTHORIZED","message":"This refresh token was already used — all sessions for the account have been revoked. If this was not you, your credentials may be compromised — sign in again.","status":401}}
```

### 6.3 …and the newest (legitimate) token is dead too

```bash
curl -s -b $JAR2 -X POST $BASE/api/v1/auth/refresh
# → the same 401: the entire family was revoked in step 2
```

Server-side you will see the incident log — this is the line to alert on:

```json
{"ts":"…","level":"error","message":"refresh token replay detected","userId":"usr_…","familyId":"…","reason":"REFRESH_TOKEN_REUSE_DETECTED"}
{"ts":"…","level":"warn","message":"token family revoked","familyId":"…","killed":2,"reason":"reuse_detected"}
```

### 6.4 Logout and session inventory

```bash
# What sessions exist? (ids are MASKED — a session id is itself a bearer credential)
TOKEN=$(curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"aminul@example.com","password":"SuperSecret#2024!"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')

curl -s $BASE/api/v1/auth/sessions -H "authorization: Bearer $TOKEN"
# → {"status":"success","count":1,"data":[{"id":"b53e5717…","current":true,
#      "ip":"127.0.0.1","userAgent":"curl/8.5.0","expiresAt":"…"}]}

# Single-device logout
curl -s -b $JAR -X POST $BASE/api/v1/auth/logout
# → 200 {"status":"success","message":"Signed out — session revoked"}

# "Sign out everywhere"
curl -s -X POST $BASE/api/v1/auth/logout-all -H "authorization: Bearer $TOKEN"
# → 200 {"status":"success","message":"Signed out of 1 session(s) on all devices","data":{"revokedSessions":1}}
```

### 6.5 Administrative + privileged-change revocation

```bash
# Promote a user: the role change kills their sessions, so the new grant cannot be
# minted from a token issued before the change.
curl -s -X PATCH $BASE/api/v1/admin/users/usr_20dc2c542146 \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"role":"moderator"}'
# → {"data":{"role":"moderator","revokedSessions":2, …}}

# Incident response: force one user out of every device
curl -s -X DELETE $BASE/api/v1/admin/users/usr_20dc2c542146/sessions \
  -H "authorization: Bearer $ADMIN_TOKEN"
# → {"message":"Revoked 1 session(s) for bob@example.com","data":{"revokedSessions":1}}
```

### 6.6 The suite

```bash
npm test
# ✔ refresh rotates the token and the old token is consumed (Ch03)
# ✔ replaying a consumed refresh token revokes the whole family (breach detection, Ch03)
# ✔ refresh without a cookie, or with a forged cookie, is rejected (Ch03)
# ✔ logout revokes the session server-side and clears the cookie (Ch03)
# ✔ logout-all kills every refresh family; stateless access tokens expire naturally
# ✔ GET /auth/sessions lists active sessions with masked ids (Ch03)
```

---

## 7. Why This Matters

* **Revocation is the reason state exists.** Every "JWT vs session" debate collapses into "how
  fast can I kill a session?" — here it is one request for logout, one request for a suspected
  compromise, and at most 15 minutes for a deactivated account's access token.
* **Rotation turns theft into detection.** A stolen refresh token that gets used produces a 401
  for the *victim* as well — a loud, actionable signal. Without rotation, theft is silent and
  indefinite.
* **Family-level escalation is the safe default.** When you cannot distinguish victim from thief,
  quarantining the entire lineage and forcing re-authentication is the only choice that does not
  risk leaving the attacker holding a valid credential.
* **Be honest about the storage.** `Map` + `prune()` is a teaching stand-in; the moment you run
  two replicas it must be Redis with TTLs — the method names (`create`, `find`, `revoke`,
  `revokeFamily`, `revokeAllForUser`, `prune`) were chosen to map 1:1 onto that migration.



