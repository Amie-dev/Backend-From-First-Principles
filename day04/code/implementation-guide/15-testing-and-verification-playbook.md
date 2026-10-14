# Implementation Guide 15: Testing & Verification Playbook

## 1. Goal & First-Principles Context

Authentication code has two properties that make testing non-negotiable:

1. **The failure modes are invisible in normal use.** A timing oracle, a CORS wildcard that is one
   character too permissive, a refresh token that is not actually consumed — none of these break
   the happy path, so nothing surfaces them except an explicit assertion.
2. **The security properties are *negative*.** "This token is rejected", "this other user gets
   403", "the raw key never appears again" — you cannot verify a negative by clicking around a UI.

This codebase therefore ships **38 end-to-end tests using Node's built-in runner** (`node:test`),
with no test framework dependency at all — the same "first principles" rule applied to tooling.

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `test/auth.e2e.test.js` | the whole suite (boot → assert → close) |
| `package.json` | `npm test` → `node --test test/*.test.js` |
| `src/app.js` | imported as-is — the real pipeline, not a mock |
| `src/bootstrap.js` | seeds the same world the server would |

---

## 3. Source: Test Harness

```javascript
// ─── Environment overrides MUST be applied before the app graph is imported ───
// (dotenv never overwrites variables that already exist in process.env)
process.env.NODE_ENV = "test";
process.env.BCRYPT_COST = "8";                       // ~15 ms/hash keeps the suite fast
process.env.SEED_DEMO_DATA = "true";
process.env.ACCESS_TOKEN_SECRET = "test_access_secret_0123456789_0123456789";
process.env.REFRESH_TOKEN_SECRET = "test_refresh_secret_0123456789_0123456789";
process.env.ACCESS_TOKEN_TTL = "15m";
process.env.REFRESH_TOKEN_TTL = "7d";
process.env.LOGIN_IP_LIMIT = "10000";                // deterministic: no throttling noise
process.env.LOGIN_ACCOUNT_LIMIT = "10000";
process.env.REGISTER_IP_LIMIT = "10000";
process.env.CORS_ORIGINS = "http://localhost:5173,https://*.example.com";
process.env.CORS_CREDENTIALS = "true";
process.env.COOKIE_SECURE = "false";
process.env.ENFORCE_USER_STATUS_ON_REQUEST = "true";

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// Dynamic imports so the environment above is in place BEFORE config is read.
const { default: app } = await import("../src/app.js");
const { bootstrapData } = await import("../src/bootstrap.js");

let server;
let baseUrl;

before(async () => {
  await bootstrapData();                                   // same seed path as production
  server = http.createServer(app);                         // the REAL Express app
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));  // ephemeral port
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});
```

### Deep explanation

1. **Environment is set before the dynamic imports**, which is the only way to control a config
   module that reads `process.env` at import time (Guide 02). This is *why* dynamic `await import()`
   is used instead of static `import` — static imports are hoisted above the assignments.
2. **`BCRYPT_COST=8` in tests** keeps each hash ~15 ms instead of ~250 ms. The security code path
   is identical; only the work factor changes. (The suite still asserts the cost is read from
   config, so the wiring is tested even when the value is lowered.)
3. **Rate limits are raised to 10 000** so unrelated tests cannot trip a 429 and produce flaky,
   order-dependent failures. The limiter itself is unit-tested with its own instance instead.
4. **`server.listen(0, "127.0.0.1")`** binds an ephemeral port, so the suite never collides with a
   developer's `npm start` on 4000 — and never leaves a port occupied after `after()`.
5. **`bootstrapData()` rather than `server.js`** — the test builds the same data without the
   banner, signal handlers and maintenance timers that a long-lived process needs.

---

## 4. Source: Test Helpers

```javascript
/** Extracts the refresh cookie from a response's Set-Cookie headers. */
function readSetCookie(res, name = "refreshToken") {
  const raw = res.headers.getSetCookie?.() ?? [];
  const match = raw.find((c) => c.startsWith(`${name}=`));
  return match ? match.split(";")[0] : null;      // "name=value", ready for a Cookie header
}

/**
 * Minimal fetch wrapper that behaves like a stateful API client.
 * @returns {Promise<{ status: number, headers: Headers, body: any, cookie: string|null }>}
 */
async function api(path, options = {}) {
  const { method = "GET", body, token, apiKey, cookie, origin, requestId, headers = {} } = options;

  const finalHeaders = { ...headers };
  if (body !== undefined) finalHeaders["content-type"] = "application/json";
  if (token)     finalHeaders["authorization"] = `Bearer ${token}`;
  if (apiKey)    finalHeaders["x-api-key"] = apiKey;
  if (cookie)    finalHeaders.cookie = cookie;
  if (origin)    finalHeaders.origin = origin;
  if (requestId) finalHeaders["x-request-id"] = requestId;

  const res = await fetch(`${baseUrl}${path}`, {
    method, headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let parsed = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep raw text for non-JSON */ }

  return { status: res.status, headers: res.headers, body: parsed, cookie: readSetCookie(res) };
}

/** Convenience: log in and return the access token + refresh cookie. */
async function login(credentialKey) {
  const res = await api("/api/v1/auth/login", { method: "POST", body: CREDENTIALS[credentialKey] });
  assert.equal(res.status, 200, `login as ${credentialKey} failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.data.accessToken, cookie: res.cookie };
}
```

### Deep explanation

1. **`api()` is intentionally dumb**: it sets headers, sends JSON, and parses the response. No
   retries, no assertion helpers, no fixtures — a test that fails should fail on an explicit
   `assert`, not inside a helper's magic.
2. **Every option maps to one HTTP concern** (`token` → `Authorization`, `apiKey` → `X-API-Key`,
   `cookie` → `Cookie`, `origin` → `Origin`), so a test reads like the request it represents.
3. **`readSetCookie` uses `res.headers.getSetCookie()`** (the Fetch-standard array of `Set-Cookie`
   values) and returns `name=value` only — exactly what you would send back in a `Cookie` header.
   This is what makes refresh-rotation and breach-detection tests possible without a browser.
4. **Non-JSON responses are preserved as text**, so a test can assert on a 204 with an empty body
   (`deleteNote` returns 204) without special-casing.
5. **`login()` asserts the status and includes the response body in the failure message**, so a
   broken login reports *why* instead of cascading into twenty confusing downstream failures.

---

## 5. The 38 Assertions, Grouped by Chapter

| Chapter | What is asserted |
| :--- | :--- |
| **Ch01** | `GET /auth/me` rejects missing / malformed / tampered tokens with 401; returns live identity + session metadata; the AuthN gate never returns 403 |
| **Ch02** | JWT anatomy (`alg`, `iss`, `aud`, `jti`, `sid`, no PII); foreign-secret and `alg:none` tokens rejected; cookie is `HttpOnly` + `SameSite=Strict` + `Path=/api/v1/auth` + `Max-Age=604800`; the cookie value never appears in the body |
| **Ch03** | Rotation consumes the old token; a replayed token revokes the whole family (and the legitimate token with it); forged/absent cookies rejected; logout clears and revokes; logout-all kills every family; sessions list masks ids |
| **Ch04** | Only admins mint keys; `sk_live_<48 hex>` format; raw key shown once and never in listings; scope/environment/expiry validation; M2M 401/403 paths; revocation is immediate; per-key 429 with `Retry-After` |
| **Ch06** | Owner vs other-user vs moderator vs admin on read/patch/delete; 403 cross-owner, 401 anonymous, 404 cross-tenant; admin lock-out guard; role change revokes sessions; admin force-revocation |
| **Ch07** | Policy rejections (too short, missing symbol, > 72 bytes); digests salted and distinct; `needsRehash()` detects a cheaper cost factor |
| **Ch08** | Identical error for unknown account vs wrong password; `WWW-Authenticate` on 401; CORS allow/deny + `Vary`; look-alike origin rejected; sliding-window limiter semantics (block, retryAfter, reset, prune) |
| **Ch09** | Health returns a redacted config snapshot; security headers present and `X-Powered-By` absent; `X-Request-Id` echo; 404 envelope; malformed JSON → 400 `INVALID_JSON`; frozen typed config + `parseDurationMs` |

---

## 6. Running the Suite

```bash
npm test              # node --test test/*.test.js
npm run test:watch    # re-run on change
```

Expected summary (all 38 passing):

```text
✔ GET /health returns a redacted config snapshot and security headers (Ch09) (82.8ms)
✔ registration rejects passwords that violate the password policy (Ch07) (23.8ms)
✔ bcrypt digests are salted, self-describing and upgrade-aware (Ch07) (57.8ms)
✔ an attempted admin self-registration is ignored (privilege escalation, Ch08) (15.5ms)
✔ login returns an identical error for unknown account and bad password (Ch08) (46.8ms)
✔ login issues a short-lived JWT plus a hardened HttpOnly refresh cookie (Ch02) (18.2ms)
✔ a token with alg=none is rejected — algorithm confusion (Ch08) (1.5ms)
✔ refresh rotates the token and the old token is consumed (Ch03) (19.1ms)
✔ replaying a consumed refresh token revokes the whole family (breach detection, Ch03) (19.3ms)
✔ logout-all kills every refresh family; stateless access tokens expire naturally (25.1ms)
✔ a user can touch only their own notes; other users get 403 (anti-BOLA, Ch06) (108.3ms)
✔ moderators read everything in the tenant but cannot write others' notes (Ch06) (47.1ms)
✔ deactivating an account revokes its sessions instantly (Ch03/Ch06) (52.6ms)
✔ changing a role kills existing sessions and forces a fresh login (Ch06/Ch08) (55.2ms)
✔ only an admin can mint API keys and the raw key is shown exactly once (Ch04) (34.9ms)
✔ revoking an API key takes effect on the very next request (Ch04) (19.9ms)
✔ per-key rate limiting returns 429 with Retry-After (Ch04/Ch08) (21.4ms)
✔ preflight from a look-alike origin is denied — no naive suffix matching (Ch08) (1.4ms)
✔ sliding-window limiter blocks, reports retry-after, resets and prunes (Ch08) (0.3ms)
✔ config module exposes frozen, typed settings derived from .env (Ch09) (0.9ms)

ℹ tests 38
ℹ suites 0
ℹ pass 38
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1174.2
```

Exit code `0` — which is what makes `npm test` usable as a CI gate.

### 6.1 Focus a subset while iterating

```bash
node --test --test-name-pattern="refresh token" test/auth.e2e.test.js
node --test --test-name-pattern="anti-BOLA|RBAC"  test/auth.e2e.test.js
```

> On Node 24, pass the glob explicitly (`test/*.test.js`): `node --test test/` treats the directory
> as a module path and fails with `MODULE_NOT_FOUND`. `npm test` already does the right thing.

---

## 7. Adding a New Test

The pattern for a new endpoint is always these four steps:

```javascript
test("GET /example requires notes:read and returns 200 for the owner (Ch06)", async () => {
  // 1. Arrange — get the credentials you need (the helper does the login round-trip)
  const owner = await login("user");

  // 2. Act — one call through the real pipeline, with only the headers that matter
  const res = await api("/api/v1/example/42", { token: owner.token });

  // 3. Assert — the status, then the specific field that proves the behaviour
  assert.equal(res.status, 200);
  assert.equal(res.body.data.ownerId, owner.userId);

  // 4. Assert the SECURITY property, not just the happy path
  const other = await login("other");
  assert.equal((await api("/api/v1/example/42", { token: other.token })).status, 403);
});
```

Rules that keep the suite trustworthy:

* **Every feature test is paired with a negative case** — wrong user, wrong scope, forged or
  expired credential, revoked key.
* **Never assert on randomised values** (`tokenId`, `jti`, `requestId`). Assert on shape
  (`/^usr_[0-9a-f]{12}$/`) or on inequality (`assert.notEqual(nextCookie, previousCookie)`).
* **Do not leak state between tests.** Tests that mutate global state (deactivate an account,
  change a role) restore it before finishing, so the suite stays order-independent and repeatable.
* **Prefer HTTP over unit tests for behaviour.** Hitting the real Express app is what catches
  middleware-order regressions — the class of bug this service can least afford.

---

## 8. Manual Verification (the 60-second smoke test)

```bash
cd day04/code
npm install
cp -n .env.example .env

npm test > /tmp/day04-tests.log 2>&1; echo "tests exit=$?"

npm start > /tmp/day04-server.log 2>&1 &
sleep 4
BASE=http://localhost:4000

printf 'health:      %s\n' "$(curl -s -o /dev/null -w '%{http_code}' $BASE/health)"
printf 'login:       %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/v1/auth/login \
  -H 'content-type: application/json' -d '{"email":"bob@example.com","password":"User$Passw0rd"}')"
printf 'me(anon):    %s\n' "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/v1/auth/me)"
printf '404:         %s\n' "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/v1/nope)"
printf 'cors denied: %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS $BASE/api/v1/auth/login \
  -H 'Origin: https://evil-example.com' -H 'Access-Control-Request-Method: POST')"

kill %1
```

Expected:

```text
tests exit=0
health:      200
login:       200
me(anon):    401
404:         404
cors denied: 403
```

### 8.1 The production guard (a test you run once per deploy target)

```bash
NODE_ENV=production node -e "import('./src/config/env.js').then(m => m.assertSecureConfiguration())"
# exits non-zero with an explicit list of what must change before this can ship
```

### 8.2 Coverage map — which guide produced which assertion

| Assertion group | Born in guide |
| :--- | :--- |
| bcrypt policy, salting, `needsRehash` | 03 |
| registration normalisation & privilege escalation | 04 |
| login enumeration/timing cookie behaviour | 05 |
| JWT anatomy, tampering, `alg:none` | 06 |
| rotation, replay, logout, sessions | 07 |
| cookie flags and clearing | 08 |
| 401 semantics, hot-path status check | 09 |
| RBAC matrix, anti-BOLA, 404 vs 403 | 10 |
| API keys: scopes, revocation, per-key 429 | 11 |
| CORS allow/deny, security headers, limiter | 12 |
| 404 envelope, malformed JSON, correlation id | 13 |
| config contract, health snapshot | 02 / 14 |

---

## 9. Why This Matters

* **Negative assertions *are* the test suite.** `expect(200)` proves a feature exists; only
  `expect(401)`, `expect(403)` and "the raw key appears zero times" prove a security property holds.
* **Tests are the only reliable refactoring tool for middleware order.** Reordering `app.use(...)`
  is invisible in code review and catastrophic in production; an end-to-end suite protects the
  order with assertions instead of comments.
* **Environment-driven configuration keeps tests honest.** The suite runs the *same* code with a
  different `.env` — never a parallel "test mode" implementation — so a green suite means the
  production path works.
* **Zero-dependency tooling shrinks the trust boundary.** `node:test` means no test framework in
  the supply chain of a security-critical service, and no framework upgrade blocking a security
  fix.



