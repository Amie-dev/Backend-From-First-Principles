# Implementation Guide 05: Login & Credential-Attack Defences

## 1. Goal & First-Principles Context

`POST /auth/login` is the single most attacked endpoint in any application. The notes
(Ch08) define the attack classes it must survive:

| Attack | Defence implemented here |
| :--- | :--- |
| **Brute force** (one account, many guesses) | Per-account sliding window: 5 failures / 15 min |
| **Credential stuffing / spraying** (many accounts, few guesses each) | Per-IP sliding window: 20 attempts / min |
| **User enumeration** (which emails exist?) | Identical `401` body for "no such user" and "wrong password" |
| **Timing attack** (measure the 250 ms bcrypt delta) | `runDummyVerify()` on the unknown-account path (Guide 03) |
| **CPU-exhaustion DoS** (force bcrypt work) | Throttles run *before* any bcrypt call |
| **Disabled-account enumeration** | `active` check happens *after* password verification |

The handler is written as an ordered defence stack — order is part of the security model, not
a style choice.

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `src/controllers/auth.controller.js` | `enforceLoginThrottle()`, `applyRateLimitHeaders()`, `login()` |
| `src/services/rate-limiter.service.js` | `SlidingWindowRateLimiter` (Guide 12) |
| `src/services/password.service.js` | `verify()` / `runDummyVerify()` (Guide 03) |
| `src/services/token.service.js` | `issueTokenPair()` (Guides 06–07) |
| `src/db/user.store.js` | `findByEmail()`, `updatePasswordHash()` |

---

## 3. Source: The Two-Key Throttle

```javascript
// src/controllers/auth.controller.js

/**
 * Publishes transparent throttling metadata so legitimate clients can back off
 * BEFORE they get blocked (cooperative rate limiting).
 */
function applyRateLimitHeaders(res, result, limit) {
  res.setHeader("X-RateLimit-Limit", limit);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, result.remaining));
  if (result.retryAfterMs > 0) {
    res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + result.retryAfterMs) / 1000));
  }
}

/**
 * Login throttle envelope: IP gate first (cheapest, catches botnets), then the
 * per-account gate (catches targeted dictionary attacks). Returns null when both allow.
 */
function enforceLoginThrottle(req, res, emailKey) {
  const ipCheck = ipLoginLimiter.attempt(`ip:${req.ip}`);
  applyRateLimitHeaders(res, ipCheck, config.rateLimit.loginIpLimit);
  if (!ipCheck.allowed) {
    logger.warn("login throttled", { scope: "ip", ip: req.ip });
    return new TooManyRequestsError(
      "Too many login attempts from this network — slow down and try again shortly",
      Math.ceil(ipCheck.retryAfterMs / 1000)
    );
  }

  const accountCheck = accountLoginLimiter.attempt(`account:${emailKey}`);
  if (!accountCheck.allowed) {
    logger.warn("login throttled", { scope: "account", email: emailKey });
    return new TooManyRequestsError(
      "Too many failed attempts for this account — try again later or reset your password",
      Math.ceil(accountCheck.retryAfterMs / 1000)
    );
  }

  return null;
}
```

### Deep explanation

1. **Two independent namespaces (`ip:` and `account:`)** are required because the attacks have
   opposite shapes. A botnet spraying 10 000 accounts from 10 000 IPs never trips an IP limit;
   a single attacker hammering one account never trips a *global* limit either. Together they
   bound both axes.
2. **Keys are namespaced with a prefix** so the same `SlidingWindowRateLimiter` instance can
   safely hold several key spaces without collisions (`ip:203.0.113.7` vs `account:bob@…`).
3. **The IPv6/IP trust caveat:** `req.ip` is only meaningful if Express is told how many proxy
   hops to trust (`TRUST_PROXY`, Guide 02). Otherwise every request appears to come from the
   load balancer and one client's abuse blocks everyone.
4. **Returns an error instead of throwing** so the caller decides the control flow; the helper
   stays testable without Express exception plumbing.
5. **`X-RateLimit-*` headers are emitted on both allow *and* deny** — cooperative APIs tell
   clients how close they are to the cliff instead of surprising them.

---

## 4. Source: The Login Handler

```javascript
/**
 * Authenticates credentials and issues the hybrid token pair.
 *
 * Defence stack, applied in order (Ch08):
 *   1. IP rate limit      — 20 attempts/min   → defeats distributed spraying
 *   2. Account rate limit — 5 failures/15 min → defeats a targeted dictionary
 *   3. Dummy bcrypt run    when the account is unknown → equalises latency
 *   4. Identical error text for "no such user" and "wrong password"
 *   5. Fresh-database role re-read → the token always carries the current grant
 */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      throw new BadRequestError("email and password are required");
    }

    const emailKey = email.trim().toLowerCase();

    // ── Defences 1 & 2: throttling (before any expensive work) ────────────────
    const throttleError = enforceLoginThrottle(req, res, emailKey);
    if (throttleError) return next(throttleError);

    const user = userStore.findByEmail(emailKey);

    // ── Defences 3 & 4: timing equaliser + uniform failure message ───────────
    if (!user) {
      await PasswordService.runDummyVerify(password);   // burn the same ~250 ms
      logger.warn("login failed", { reason: "unknown_account", email: emailKey, ip: req.ip });
      throw new UnauthorizedError("Invalid email or password");
    }

    const passwordOk = await PasswordService.verify(password, user.passwordHash);
    if (!passwordOk) {
      logger.warn("login failed", { reason: "bad_password", userId: user.id, ip: req.ip });
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.active === false) {
      throw new UnauthorizedError("This account has been deactivated — contact an administrator");
    }

    // ── Transparent cost-factor migration (Guide 03) ─────────────────────────
    if (PasswordService.needsRehash(user.passwordHash)) {
      const upgraded = await PasswordService.hash(password);
      userStore.updatePasswordHash(user.id, upgraded);
      logger.info("password hash upgraded", { userId: user.id, bcryptCost: config.password.bcryptCost });
    }

    // Successful auth → forget the failure counter for this account
    accountLoginLimiter.reset(`account:${emailKey}`);

    const { accessToken, refreshTokenId, expiresIn } = TokenService.issueTokenPair(
      user,
      clientContext(req)
    );
    setRefreshCookie(res, refreshTokenId);      // HttpOnly cookie (Guide 08)

    logger.info("login succeeded", { userId: user.id, role: user.role, ip: req.ip });

    res.status(200).json({
      status: "success",
      message: "Authenticated",
      data: {
        // Access token travels in the body and lives in client MEMORY only —
        // never localStorage (XSS-readable) and never a cookie (CSRF-able).
        accessToken,
        tokenType: "Bearer",
        expiresIn,
        refreshTokenExpiresIn: Math.floor(config.jwt.refreshTtlMs / 1000),
        user: {
          id: user.id, email: user.email, username: user.username,
          role: user.role, tenantId: user.tenantId,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}
```

### Deep explanation

1. **Throttle before bcrypt.** Each bcrypt verification costs ~250 ms of focused CPU; if the
   limiter ran after verification, an attacker could use the login endpoint as a CPU-
   exhaustion weapon against the whole service.
2. **Both failure branches throw the *same* `UnauthorizedError` with the same string.** Any
   difference — wording, status code, `WWW-Authenticate` header — becomes an oracle. The
   e2e suite asserts the two responses are byte-identical in `message`.
3. **`accountLoginLimiter.reset()` on success** so a legitimate user who mistyped three times
   is not left one attempt away from a lockout after finally logging in.
4. **`active === false` is checked after verification**, so a disabled account cannot be
   fingerprinted by an attacker who does not know the password. The cost is one wasted bcrypt
   op on the rare disabled-account path; the benefit is that the "account disabled" message
   itself never leaks existence.
5. **The refresh token never appears in the body.** It goes into the cookie only, so an XSS
   payload reading `document` or a proxy logging response bodies cannot capture the long-lived
   credential.
6. **`accessToken` is returned in the body deliberately** — SPAs keep it in memory. Cookie-based
   access tokens would reintroduce CSRF on *every* API route and force the API to care about
   `SameSite` semantics for normal reads.
7. **`refreshTokenExpiresIn` is shared with the client** so it can schedule a silent refresh at
   ~13 minutes instead of waiting for a 401.

---

## 5. Verification

### 5.1 Successful login

```bash
BASE=http://localhost:4000

curl -s -i -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"bob@example.com","password":"User$Passw0rd"}' | head -14
```

```text
HTTP/1.1 200 OK
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 19
Set-Cookie: refreshToken=03e02487-…; Max-Age=604800; Path=/api/v1/auth; HttpOnly; SameSite=Strict
{"status":"success","message":"Authenticated","data":{"accessToken":"eyJhbGciOiJIUzI1NiIs…",
 "tokenType":"Bearer","expiresIn":900,"refreshTokenExpiresIn":604800,
 "user":{"id":"usr_20dc2c542146","email":"bob@example.com","role":"user","tenantId":"tenant_alpha"}}}
```

### 5.2 The enumeration defence: two DIFFERENT failures, ONE response

```bash
# (a) account that does not exist
curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"ghost@example.com","password":"Whatever$1234"}'

# (b) account that exists, wrong password
curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"bob@example.com","password":"Wrong$Password1"}'
```

Both print exactly:

```json
{"error":{"code":"UNAUTHORIZED","message":"Invalid email or password","status":401}}
```

Time them to see the other half of the defence — the equaliser makes the *latency* match too:

```bash
for email in ghost@example.com bob@example.com; do
  curl -s -o /dev/null -w "$email → %{time_total}s\n" -X POST $BASE/api/v1/auth/login \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"Wrong\$Password1\"}"
done
# ghost@example.com → 0.26s     ← dummy bcrypt (account absent)
# bob@example.com   → 0.26s     ← real bcrypt (account present)
```

### 5.3 Throttling kicks in with `429` and `Retry-After`

```bash
# Account limiter (default 5 failures / 15 min): hammer one account
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "attempt $i → %{http_code}\n" -X POST $BASE/api/v1/auth/login \
    -H 'content-type: application/json' \
    -d '{"email":"sarah@example.com","password":"nope"}'
done
```

```text
attempt 1 → 401
attempt 2 → 401
attempt 3 → 401
attempt 4 → 401
attempt 5 → 401
attempt 6 → 429
attempt 7 → 429
```

```bash
curl -si -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"sarah@example.com","password":"nope"}' | grep -iE 'HTTP/|retry-after|x-ratelimit'
# HTTP/1.1 429 Too Many Requests
# X-RateLimit-Remaining: 0
# Retry-After: 900
```

> Lower the thresholds in `.env` (`LOGIN_ACCOUNT_LIMIT=3`, `LOGIN_ACCOUNT_WINDOW=30s`) while
> experimenting — the limits are configuration, not code.

### 5.4 The suite

```bash
npm test
# ✔ login returns an identical error for unknown account and bad password (Ch08)
# ✔ login issues a short-lived JWT plus a hardened HttpOnly refresh cookie (Ch02)
# ✔ the refresh cookie value is never exposed in the JSON body (Ch02)
# ✔ login rejects malformed payloads and wrong body types with 400 (Ch09)
```

---

## 6. Why This Matters

* **Order is security.** Throttle → cheap checks → expensive crypto → state checks. Every
  reordering is a new vulnerability: throttle-after-verify is a DoS, active-check-before-verify
  is an enumeration oracle.
* **Uniform failure is the only reliable anti-enumeration control.** Log the real reason
  server-side (`reason: "unknown_account"` vs `"bad_password"`) where only you can see it, and
  return one message to the world.
* **Timing is part of the response.** A 250 ms difference is trivially measurable over the
  internet; the dummy-hash equaliser is what makes the uniform message actually uniform.
* **Two-dimension limiting is the minimum viable design.** IP-only limiter = botnet wins;
  account-only limiter = password spraying wins. You need both, and both need to be
  configurable so ops can tighten them during an active campaign without a deploy.


