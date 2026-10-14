/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Day 04 — End-to-end authentication & authorization test-suite
 *  Run with:  npm test        (node --test, no external test framework needed)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Coverage map (against the day04 chapter notes):
 *    Ch01  AuthN before AuthZ; 401 vs 403 semantics
 *    Ch02  JWT anatomy + HttpOnly / Secure / SameSite cookie attributes
 *    Ch03  Refresh-token rotation, replay (breach) detection, revocation
 *    Ch04  API keys: hashed storage, scopes, revocation, per-key rate limiting
 *    Ch06  RBAC matrix + resource ownership (anti-BOLA) + admin lock-out guards
 *    Ch07  bcrypt policy enforcement + cost-factor upgrade detection
 *    Ch08  Uniform failure messages (enumeration defence), CORS allow-list,
 *          algorithm-confusion rejection, sliding-window limiter semantics
 *    Ch09  Security headers, request-id correlation, safe error envelope, config
 */

// ─── Environment overrides MUST be applied before the app graph is imported ───
// (dotenv never overwrites variables that already exist in process.env)
process.env.NODE_ENV = "test";
process.env.BCRYPT_COST = "8";                       // keep tests fast (~15 ms/hash)
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

const { default: app } = await import("../src/app.js");
const { bootstrapData } = await import("../src/bootstrap.js");
const { SlidingWindowRateLimiter } = await import("../src/services/rate-limiter.service.js");
const { PasswordService } = await import("../src/services/password.service.js");

// ─── Fixtures & helpers ──────────────────────────────────────────────────────

const CREDENTIALS = {
  admin:     { email: "aminul@example.com", password: "SuperSecret#2024!" },
  moderator: { email: "sarah@example.com",  password: "Moderate@Pass99" },
  user:      { email: "bob@example.com",    password: "User$Passw0rd" },
  other:     { email: "alice@example.com",  password: "Alice$Secure1" },
};

let server;
let baseUrl;

before(async () => {
  await bootstrapData();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/**
 * Extracts the refresh cookie from a response's Set-Cookie headers.
 * @param {Response} res
 * @param {string} [name]
 * @returns {string|null} "name=value" pair, ready to be sent as a Cookie header
 */
function readSetCookie(res, name = "refreshToken") {
  const raw = res.headers.getSetCookie?.() ?? [];
  const match = raw.find((c) => c.startsWith(`${name}=`));
  return match ? match.split(";")[0] : null;
}

/**
 * Minimal fetch wrapper that behaves like a stateful API client.
 *
 * @param {string} path
 * @param {object} [options]
 * @returns {Promise<{ status: number, headers: Headers, body: any, cookie: string|null }>}
 */
async function api(path, options = {}) {
  const { method = "GET", body, token, apiKey, cookie, origin, requestId, headers = {} } = options;

  const finalHeaders = { ...headers };
  if (body !== undefined) finalHeaders["content-type"] = "application/json";
  if (token) finalHeaders["authorization"] = `Bearer ${token}`;
  if (apiKey) finalHeaders["x-api-key"] = apiKey;
  if (cookie) finalHeaders.cookie = cookie;
  if (origin) finalHeaders.origin = origin;
  if (requestId) finalHeaders["x-request-id"] = requestId;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep the raw text for non-JSON responses */
  }

  return { status: res.status, headers: res.headers, body: parsed, cookie: readSetCookie(res) };
}

/** Convenience: log in and return the access token + refresh cookie. */
async function login(credentialKey) {
  const res = await api("/api/v1/auth/login", { method: "POST", body: CREDENTIALS[credentialKey] });
  assert.equal(res.status, 200, `login as ${credentialKey} failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.data.accessToken, cookie: res.cookie };
}

// ══════════════════════════════════════════════════════════════════════════════
// Ch09 — platform: health, headers, correlation id, 404 envelope
// ══════════════════════════════════════════════════════════════════════════════

test("GET /health returns a redacted config snapshot and security headers (Ch09)", async () => {
  const res = await api("/health", { requestId: "test-correlation-id-123" });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "healthy");

  // Secrets are NEVER serialised — only fingerprints
  assert.ok(res.body.config.accessSecretFingerprint.includes("chars"));
  assert.equal(JSON.stringify(res.body).includes("test_access_secret"), false);

  // Hardening headers (Ch09 Stage 1 + Stage 7)
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-powered-by"), null);

  // Correlation id is echoed back (Stage 7 tracing)
  assert.equal(res.headers.get("x-request-id"), "test-correlation-id-123");
});

test("unknown routes return a consistent 404 envelope (Ch09)", async () => {
  const res = await api("/api/v1/does-not-exist");

  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, "NOT_FOUND");
  assert.equal(res.body.error.status, 404);
});

// ══════════════════════════════════════════════════════════════════════════════
// Ch07 — password policy + bcrypt storage
// ══════════════════════════════════════════════════════════════════════════════

test("registration rejects passwords that violate the password policy (Ch07)", async () => {
  const weak = await api("/api/v1/auth/register", {
    method: "POST",
    body: { email: "weak@example.com", username: "weakling", password: "short1!" },
  });
  assert.equal(weak.status, 400);
  assert.match(weak.body.error.message, /at least 10 characters/);

  const noSymbol = await api("/api/v1/auth/register", {
    method: "POST",
    body: { email: "nosym@example.com", username: "nosymbol", password: "NoSymbol12345" },
  });
  assert.equal(noSymbol.status, 400);
  assert.match(noSymbol.body.error.message, /symbol/);

  // 73 ASCII chars = 73 bytes → bcrypt would silently truncate → must be rejected
  const tooLong = await api("/api/v1/auth/register", {
    method: "POST",
    body: { email: "long@example.com", username: "toolong", password: `Aa1!${"x".repeat(70)}` },
  });
  assert.equal(tooLong.status, 400);
  assert.match(tooLong.body.error.message, /bytes/);
});

test("bcrypt digests are salted, self-describing and upgrade-aware (Ch07)", async () => {
  const hashA = await PasswordService.hash("Same$Password123");
  const hashB = await PasswordService.hash("Same$Password123");

  assert.match(hashA, /^\$2[aby]\$08\$/); // cost 8 in the test environment
  assert.notEqual(hashA, hashB);           // unique salt per hash
  assert.equal(await PasswordService.verify("Same$Password123", hashA), true);
  assert.equal(await PasswordService.verify("wrong-password", hashA), false);

  // needsRehash() flags digests created with a cheaper factor than the policy
  assert.equal(PasswordService.needsRehash("$2b$04$abcdefghijklmnopqrstuu"), true);
  assert.equal(PasswordService.needsRehash(hashA), false);
});

// ══════════════════════════════════════════════════════════════════════════════
// Ch07 / Ch08 — registration hardening
// ══════════════════════════════════════════════════════════════════════════════

test("registration normalises email, never auto-logs-in, and rejects duplicates", async () => {
  const created = await api("/api/v1/auth/register", {
    method: "POST",
    body: { email: "NewUser@Example.com", username: "newuser", password: "Brand$New99x" },
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.data.email, "newuser@example.com"); // normalised
  assert.equal(created.body.data.role, "user");                 // role cannot be self-assigned
  assert.equal(created.cookie, null);                           // no session issued

  const duplicate = await api("/api/v1/auth/register", {
    method: "POST",
    body: { email: "newuser@example.com", username: "newuser2", password: "Brand$New99x" },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, "CONFLICT");
});

test("an attempted admin self-registration is ignored (privilege escalation, Ch08)", async () => {
  const res = await api("/api/v1/auth/register", {
    method: "POST",
    body: {
      email: "sneaky@example.com",
      username: "sneaky",
      password: "Sneaky$Pass99",
      role: "admin", // mass-assignment attempt
    },
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.role, "user");
});

// ══════════════════════════════════════════════════════════════════════════════
// Ch01 / Ch02 / Ch08 — login, cookies, enumeration defences
// ══════════════════════════════════════════════════════════════════════════════

test("login returns an identical error for unknown account and bad password (Ch08)", async () => {
  const unknown = await api("/api/v1/auth/login", {
    method: "POST",
    body: { email: "ghost@example.com", password: "Whatever$1234" },
  });
  const wrongPassword = await api("/api/v1/auth/login", {
    method: "POST",
    body: { email: CREDENTIALS.user.email, password: "Wrong$Password1" },
  });

  assert.equal(unknown.status, 401);
  assert.equal(wrongPassword.status, 401);
  // Byte-for-byte identical message → no user-enumeration signal
  assert.equal(unknown.body.error.message, wrongPassword.body.error.message);
  assert.equal(wrongPassword.body.error.message, "Invalid email or password");
  assert.match(wrongPassword.headers.get("www-authenticate"), /^Bearer/);
});

test("login issues a short-lived JWT plus a hardened HttpOnly refresh cookie (Ch02)", async () => {
  const res = await api("/api/v1/auth/login", { method: "POST", body: CREDENTIALS.user });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.tokenType, "Bearer");
  assert.equal(res.body.data.expiresIn, 15 * 60); // 15-minute access token

  // JWT anatomy: three base64url segments (header.payload.signature)
  const parts = res.body.data.accessToken.split(".");
  assert.equal(parts.length, 3);
  const decodedHeader = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  const decodedPayload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  assert.equal(decodedHeader.alg, "HS256");
  assert.equal(decodedPayload.iss, "day04-auth-api");
  assert.equal(decodedPayload.aud, "day04-client");
  assert.match(decodedPayload.sub, /^usr_[0-9a-f]{12}$/, "opaque surrogate key, no PII");
  assert.ok(decodedPayload.jti, "jti claim present for future deny-listing");
  assert.ok(decodedPayload.sid, "sid links the access token to its refresh family");
  assert.equal(decodedPayload.email, undefined, "no PII inside a readable JWT");

  // Cookie hardening flags
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith("refreshToken="));
  assert.ok(setCookie, "refresh cookie must be set");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Path=\/api\/v1\/auth/i);
  assert.match(setCookie, /Max-Age=604800/i); // 7 days
});

test("the refresh cookie value is never exposed in the JSON body (Ch02)", async () => {
  const res = await api("/api/v1/auth/login", { method: "POST", body: CREDENTIALS.user });
  const cookieValue = res.cookie.split("=")[1];

  assert.equal(JSON.stringify(res.body).includes(cookieValue), false);
});

test("login rejects malformed payloads and wrong body types with 400 (Ch09)", async () => {
  const noPassword = await api("/api/v1/auth/login", {
    method: "POST",
    body: { email: CREDENTIALS.user.email },
  });
  assert.equal(noPassword.status, 400);

  const malformedJson = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ not valid json",
  });
  assert.equal(malformedJson.status, 400);
  const body = await malformedJson.json();
  assert.equal(body.error.code, "INVALID_JSON");
});

// ══════════════════════════════════════════════════════════════════════════════
// Ch01 / Ch08 — the authentication gate (401) and the authorization gate (403)
// ══════════════════════════════════════════════════════════════════════════════

test("GET /auth/me rejects missing, malformed and tampered tokens with 401 (Ch01)", async () => {
  const missing = await api("/api/v1/auth/me");
  assert.equal(missing.status, 401);
  assert.equal(missing.body.error.code, "UNAUTHORIZED");

  assert.equal((await api("/api/v1/auth/me", { token: "not-a-jwt" })).status, 401);

  const { token } = await login("user");
  const [h, p, s] = token.split(".");
  const tampered = `${h}.${p}.${s.slice(0, -3)}xyz`; // signature bit-flip
  assert.equal((await api("/api/v1/auth/me", { token: tampered })).status, 401);
});

test("GET /auth/me returns the live identity and session metadata (Ch01)", async () => {
  const { token } = await login("admin");
  const res = await api("/api/v1/auth/me", { token });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.email, CREDENTIALS.admin.email);
  assert.equal(res.body.data.role, "admin");
  assert.equal(res.body.data.tenantId, "tenant_alpha");
  assert.ok(res.body.data.sessionId);
  assert.equal(res.body.data.passwordHash, undefined); // safe egress
});

test("tokens signed with a different secret are rejected (Ch02)", async () => {
  const jwt = (await import("jsonwebtoken")).default;
  const forgedToken = jwt.sign(
    { sub: "usr_anything", role: "admin" },
    "attacker-supplied-secret",
    { algorithm: "HS256", expiresIn: "15m", issuer: "day04-auth-api", audience: "day04-client" }
  );

  assert.equal((await api("/api/v1/auth/me", { token: forgedToken })).status, 401);
});

test("a token with alg=none is rejected — algorithm confusion (Ch08)", async () => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: "usr_forged", role: "admin", iss: "day04-auth-api", aud: "day04-client" })
  ).toString("base64url");

  assert.equal((await api("/api/v1/auth/me", { token: `${header}.${payload}.` })).status, 401);
});

// ══════════════════════════════════════════════════════════════════════════════
// Ch03 — refresh-token rotation and the breach circuit breaker
// ══════════════════════════════════════════════════════════════════════════════

test("refresh rotates the token and the old token is consumed (Ch03)", async () => {
  const { cookie: cookie1 } = await login("user");

  const first = await api("/api/v1/auth/refresh", { method: "POST", cookie: cookie1 });
  assert.equal(first.status, 200);
  assert.ok(first.body.data.accessToken);
  assert.notEqual(first.cookie, cookie1, "a brand-new refresh token must be issued");

  // The rotated access token works...
  assert.equal((await api("/api/v1/auth/me", { token: first.body.data.accessToken })).status, 200);

  // ...and the new refresh token remains usable (same family, next generation)
  const second = await api("/api/v1/auth/refresh", { method: "POST", cookie: first.cookie });
  assert.equal(second.status, 200);
  assert.notEqual(second.cookie, first.cookie);
});

test("replaying a consumed refresh token revokes the whole family (breach detection, Ch03)", async () => {
  const { cookie: cookie1 } = await login("moderator");
  const rotated = await api("/api/v1/auth/refresh", { method: "POST", cookie: cookie1 });
  assert.equal(rotated.status, 200);

  // An attacker replays the stolen, already-consumed token
  const replay = await api("/api/v1/auth/refresh", { method: "POST", cookie: cookie1 });
  assert.equal(replay.status, 401);
  assert.match(replay.body.error.message, /already used|compromised/i);

  // The circuit breaker also killed the legitimate client's newest token
  const legitimate = await api("/api/v1/auth/refresh", { method: "POST", cookie: rotated.cookie });
  assert.equal(legitimate.status, 401);
});

test("refresh without a cookie, or with a forged cookie, is rejected (Ch03)", async () => {
  assert.equal((await api("/api/v1/auth/refresh", { method: "POST" })).status, 401);

  const forged = await api("/api/v1/auth/refresh", {
    method: "POST",
    cookie: "refreshToken=00000000-0000-4000-8000-000000000000",
  });
  assert.equal(forged.status, 401);
});

test("logout revokes the session server-side and clears the cookie (Ch03)", async () => {
  const { cookie } = await login("other");

  const out = await api("/api/v1/auth/logout", { method: "POST", cookie });
  assert.equal(out.status, 200);
  assert.match(out.headers.getSetCookie()[0], /refreshToken=;/); // cleared

  assert.equal((await api("/api/v1/auth/refresh", { method: "POST", cookie })).status, 401);
});

test("logout-all kills every refresh family; stateless access tokens expire naturally", async () => {
  const { token, cookie } = await login("user");

  const res = await api("/api/v1/auth/logout-all", { method: "POST", token, cookie });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.revokedSessions >= 1);

  // A stateless JWT stays valid until it expires — this is exactly WHY its TTL is
  // 15 minutes and why the refresh path carries revocation.
  assert.equal((await api("/api/v1/auth/me", { token })).status, 200);

  // ...while the revoked credential can never mint a new one again
  assert.equal((await api("/api/v1/auth/refresh", { method: "POST", cookie })).status, 401);
});

test("GET /auth/sessions lists active sessions with masked ids (Ch03)", async () => {
  const { token } = await login("admin");
  const res = await api("/api/v1/auth/sessions", { token });

  assert.equal(res.status, 200);
  assert.ok(res.body.count >= 1);
  assert.ok(res.body.data[0].id.endsWith("…"), "session ids must be masked");
  assert.equal(res.body.data.some((s) => s.current), true);
});

// ══════════════════════════════════════════════════════════════════════════════
// Ch06 — RBAC matrix, resource ownership (anti-BOLA) and tenant isolation
// ══════════════════════════════════════════════════════════════════════════════

test("a user can touch only their own notes; other users get 403 (anti-BOLA, Ch06)", async () => {
  const bob = await login("user");
  const alice = await login("other");
  const admin = await login("admin");

  const created = await api("/api/v1/notes", {
    method: "POST",
    token: bob.token,
    body: { title: "Bob's secret", content: "Owned by bob" },
  });
  assert.equal(created.status, 201);
  const noteId = created.body.data.id;

  // Owner: allowed
  assert.equal((await api(`/api/v1/notes/${noteId}`, { token: bob.token })).status, 200);

  // Same tenant, different owner → 403 (identity known, resource not owned)
  const crossRead = await api(`/api/v1/notes/${noteId}`, { token: alice.token });
  assert.equal(crossRead.status, 403);
  assert.equal(crossRead.body.error.code, "FORBIDDEN");

  // No credentials → 401 (identity could not be established at all)
  assert.equal((await api(`/api/v1/notes/${noteId}`)).status, 401);

  // Admin override
  assert.equal((await api(`/api/v1/notes/${noteId}`, { token: admin.token })).status, 200);
  const adminPatch = await api(`/api/v1/notes/${noteId}`, {
    method: "PATCH",
    token: admin.token,
    body: { content: "moderated by admin" },
  });
  assert.equal(adminPatch.status, 200);

  const ownerPatch = await api(`/api/v1/notes/${noteId}`, {
    method: "PATCH",
    token: bob.token,
    body: { title: "Renamed by owner" },
  });
  assert.equal(ownerPatch.status, 200);

  // Cross-owner delete blocked; owner delete allowed
  assert.equal(
    (await api(`/api/v1/notes/${noteId}`, { method: "DELETE", token: alice.token })).status,
    403
  );
  assert.equal(
    (await api(`/api/v1/notes/${noteId}`, { method: "DELETE", token: bob.token })).status,
    204
  );
});

test("moderators read everything in the tenant but cannot write others' notes (Ch06)", async () => {
  const bob = await login("user");
  const moderator = await login("moderator");

  const created = await api("/api/v1/notes", {
    method: "POST",
    token: bob.token,
    body: { title: "Moderation target", content: "Read-only for moderators" },
  });
  const noteId = created.body.data.id;

  assert.equal((await api(`/api/v1/notes/${noteId}`, { token: moderator.token })).status, 200);

  const write = await api(`/api/v1/notes/${noteId}`, {
    method: "PATCH",
    token: moderator.token,
    body: { content: "moderator tampering" },
  });
  assert.equal(write.status, 403);

  await api(`/api/v1/notes/${noteId}`, { method: "DELETE", token: bob.token });
});

test("role-based route guards return 403 for insufficient roles and never leak hashes (Ch06)", async () => {
  const user = await login("user");
  const moderator = await login("moderator");
  const admin = await login("admin");

  // Archived notes: admin-only
  assert.equal((await api("/api/v1/admin/notes/archived", { token: user.token })).status, 403);
  assert.equal((await api("/api/v1/admin/notes/archived", { token: moderator.token })).status, 403);

  const archived = await api("/api/v1/admin/notes/archived", { token: admin.token });
  assert.equal(archived.status, 200);
  assert.ok(archived.body.data.every((n) => n.archived === true));

  // User administration: admin-only
  assert.equal((await api("/api/v1/admin/users", { token: user.token })).status, 403);
  assert.equal((await api("/api/v1/admin/users", { token: moderator.token })).status, 403);

  const users = await api("/api/v1/admin/users", { token: admin.token });
  assert.equal(users.status, 200);
  assert.ok(users.body.count >= 4);
  assert.equal(JSON.stringify(users.body).includes("passwordHash"), false);
  assert.equal(JSON.stringify(users.body).includes("$2b$"), false);
});

test("list endpoints are scoped: a user sees only their own notes (Ch06)", async () => {
  const bob = await login("user");
  const admin = await login("admin");

  const list = await api("/api/v1/notes", { token: bob.token });
  assert.equal(list.status, 200);

  const me = await api("/api/v1/auth/me", { token: bob.token });
  assert.ok(list.body.data.every((n) => n.ownerId === me.body.data.id));

  const adminList = await api("/api/v1/notes", { token: admin.token });
  assert.ok(adminList.body.count >= list.body.count);
});

// ══════════════════════════════════════════════════════════════════════════════
// Ch03 / Ch06 — privileged mutations take effect immediately
// ══════════════════════════════════════════════════════════════════════════════

test("deactivating an account revokes its sessions instantly (Ch03/Ch06)", async () => {
  const alice = await login("other");
  const admin = await login("admin");

  const users = await api("/api/v1/admin/users", { token: admin.token });
  const aliceRecord = users.body.data.find((u) => u.email === CREDENTIALS.other.email);
  assert.ok(aliceRecord);

  const deactivate = await api(`/api/v1/admin/users/${aliceRecord.id}`, {
    method: "PATCH",
    token: admin.token,
    body: { active: false },
  });
  assert.equal(deactivate.status, 200);
  assert.ok(deactivate.body.data.revokedSessions >= 1);

  // The existing access token is refused by the hot-path status check
  assert.equal((await api("/api/v1/auth/me", { token: alice.token })).status, 401);

  // ...and no refresh can resurrect the session
  assert.equal(
    (await api("/api/v1/auth/refresh", { method: "POST", cookie: alice.cookie })).status,
    401
  );

  // Login is refused too, checked AFTER the password comparison so a disabled
  // account cannot be enumerated without valid credentials
  const relogin = await api("/api/v1/auth/login", { method: "POST", body: CREDENTIALS.other });
  assert.equal(relogin.status, 401);

  // Restore the account so a re-run of the suite starts from a clean state
  const reactivate = await api(`/api/v1/admin/users/${aliceRecord.id}`, {
    method: "PATCH",
    token: admin.token,
    body: { active: true },
  });
  assert.equal(reactivate.status, 200);
});

test("an admin cannot demote or deactivate their own account (lock-out guard, Ch06)", async () => {
  const admin = await login("admin");
  const me = await api("/api/v1/auth/me", { token: admin.token });

  const demote = await api(`/api/v1/admin/users/${me.body.data.id}`, {
    method: "PATCH",
    token: admin.token,
    body: { role: "user" },
  });
  assert.equal(demote.status, 403);

  const deactivate = await api(`/api/v1/admin/users/${me.body.data.id}`, {
    method: "PATCH",
    token: admin.token,
    body: { active: false },
  });
  assert.equal(deactivate.status, 403);
});

test("changing a role kills existing sessions and forces a fresh login (Ch06/Ch08)", async () => {
  const bob = await login("user");
  const admin = await login("admin");

  const me = await api("/api/v1/auth/me", { token: bob.token });
  const bobId = me.body.data.id;

  const promote = await api(`/api/v1/admin/users/${bobId}`, {
    method: "PATCH",
    token: admin.token,
    body: { role: "moderator" },
  });
  assert.equal(promote.status, 200);
  assert.ok(promote.body.data.revokedSessions >= 1, "privilege change must revoke sessions");

  // 1. The old access token still claims role:user → the AuthN gate rejects it
  const stale = await api("/api/v1/auth/me", { token: bob.token });
  assert.equal(stale.status, 401);
  assert.match(stale.body.error.message, /permissions changed/i);

  // 2. The refresh token was revoked too, so the client must re-authenticate —
  //    the new grant can never be minted from a token issued before the change
  assert.equal((await api("/api/v1/auth/refresh", { method: "POST", cookie: bob.cookie })).status, 401);

  // 3. A fresh login carries the new role
  const relogin = await login("user");
  const updated = await api("/api/v1/auth/me", { token: relogin.token });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.role, "moderator");

  // Restore the original role (and revoke the moderator session created above)
  await api(`/api/v1/admin/users/${bobId}`, {
    method: "PATCH",
    token: admin.token,
    body: { role: "user" },
  });
});

test("an admin can force-revoke every session of another user (incident response, Ch03)", async () => {
  const victim = await login("user");
  const admin = await login("admin");

  const me = await api("/api/v1/auth/me", { token: victim.token });

  const res = await api(`/api/v1/admin/users/${me.body.data.id}/sessions`, {
    method: "DELETE",
    token: admin.token,
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.revokedSessions >= 1);

  assert.equal(
    (await api("/api/v1/auth/refresh", { method: "POST", cookie: victim.cookie })).status,
    401
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// Ch04 — API keys & machine-to-machine authentication
// ══════════════════════════════════════════════════════════════════════════════

test("only an admin can mint API keys and the raw key is shown exactly once (Ch04)", async () => {
  const user = await login("user");
  const admin = await login("admin");

  const forbidden = await api("/api/v1/admin/api-keys", {
    method: "POST",
    token: user.token,
    body: { name: "rogue key", scopes: ["notes:read"] },
  });
  assert.equal(forbidden.status, 403);

  const created = await api("/api/v1/admin/api-keys", {
    method: "POST",
    token: admin.token,
    body: { name: "Analytics ETL", scopes: ["notes:read"], rateLimitRpm: 5 },
  });

  assert.equal(created.status, 201);
  assert.match(created.body.data.apiKey, /^sk_live_[0-9a-f]{48}$/); // structured prefix
  assert.ok(created.body.data.keyMeta.scopes.includes("notes:read"));
  assert.match(created.body.warning, /never be shown again/i);

  // Listing never reveals the secret material again
  const list = await api("/api/v1/admin/api-keys", { token: admin.token });
  assert.equal(list.status, 200);
  assert.equal(JSON.stringify(list.body).includes(created.body.data.apiKey), false);
  assert.equal(JSON.stringify(list.body).includes("hashedSecret"), false);
  assert.ok(list.body.data.some((k) => k.prefix === created.body.data.keyMeta.prefix));
});

test("API key creation validates scopes, environment and expiry (Ch04)", async () => {
  const admin = await login("admin");

  const badScope = await api("/api/v1/admin/api-keys", {
    method: "POST",
    token: admin.token,
    body: { name: "typo key", scopes: ["note:read"] }, // singular → invalid
  });
  assert.equal(badScope.status, 400);
  assert.match(badScope.body.error.message, /Unknown scope/);

  const badExpiry = await api("/api/v1/admin/api-keys", {
    method: "POST",
    token: admin.token,
    body: { name: "expired key", scopes: ["notes:read"], expiresAt: "2001-01-01T00:00:00Z" },
  });
  assert.equal(badExpiry.status, 400);

  const badEnvironment = await api("/api/v1/admin/api-keys", {
    method: "POST",
    token: admin.token,
    body: { name: "weird env", scopes: ["notes:read"], environment: "staging" },
  });
  assert.equal(badEnvironment.status, 400);
});

test("M2M endpoint enforces the API key and its scopes (Ch04)", async () => {
  const admin = await login("admin");

  const reader = await api("/api/v1/admin/api-keys", {
    method: "POST",
    token: admin.token,
    body: { name: "Reader", scopes: ["notes:read"] },
  });
  const readKey = reader.body.data.apiKey;

  // Valid key + scope → cross-tenant read is explicitly granted
  const ok = await api("/api/v1/integration/notes", { apiKey: readKey });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.source, "M2M API Key Integration");
  assert.ok(ok.body.count >= 1);
  assert.ok(Array.isArray(ok.body.tenants));

  // Rate-limit metadata is transparent to integrators
  assert.equal(ok.headers.get("x-ratelimit-limit"), "60");
  assert.ok(Number(ok.headers.get("x-ratelimit-remaining")) >= 0);

  // Missing / unknown key → 401
  assert.equal((await api("/api/v1/integration/notes")).status, 401);
  assert.equal(
    (await api("/api/v1/integration/notes", { apiKey: `sk_live_${"0".repeat(48)}` })).status,
    401
  );

  // A user JWT cannot be replayed against the machine route (credential-domain split)
  const user = await login("user");
  assert.equal((await api("/api/v1/integration/notes", { token: user.token })).status, 401);

  // Insufficient scope → 403
  const writer = await api("/api/v1/admin/api-keys", {
    method: "POST",
    token: admin.token,
    body: { name: "Writer only", scopes: ["notes:write"] },
  });
  const scoped = await api("/api/v1/integration/notes", { apiKey: writer.body.data.apiKey });
  assert.equal(scoped.status, 403);
  assert.equal(scoped.body.error.code, "FORBIDDEN");
  assert.match(scoped.body.error.message, /notes:read/);
});

test("revoking an API key takes effect on the very next request (Ch04)", async () => {
  const admin = await login("admin");

  const created = await api("/api/v1/admin/api-keys", {
    method: "POST",
    token: admin.token,
    body: { name: "Short-lived", scopes: ["notes:read"] },
  });
  const rawKey = created.body.data.apiKey;
  const keyId = created.body.data.keyMeta.id;

  assert.equal((await api("/api/v1/integration/notes", { apiKey: rawKey })).status, 200);

  const revoked = await api(`/api/v1/admin/api-keys/${keyId}`, {
    method: "DELETE",
    token: admin.token,
  });
  assert.equal(revoked.status, 200);

  assert.equal((await api("/api/v1/integration/notes", { apiKey: rawKey })).status, 401);
});

test("per-key rate limiting returns 429 with Retry-After (Ch04/Ch08)", async () => {
  const admin = await login("admin");

  const throttled = await api("/api/v1/admin/api-keys", {
    method: "POST",
    token: admin.token,
    body: { name: "Throttled", scopes: ["notes:read"], rateLimitRpm: 2 },
  });
  const rawKey = throttled.body.data.apiKey;

  assert.equal((await api("/api/v1/integration/notes", { apiKey: rawKey })).status, 200);
  assert.equal((await api("/api/v1/integration/notes", { apiKey: rawKey })).status, 200);

  const blocked = await api("/api/v1/integration/notes", { apiKey: rawKey });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, "TOO_MANY_REQUESTS");
  assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
});

// ══════════════════════════════════════════════════════════════════════════════
// Ch08 — CORS policy (env-driven allow-list, wildcard subdomains, preflight)
// ══════════════════════════════════════════════════════════════════════════════

test("preflight from an allowed origin returns the negotiated policy (Ch08)", async () => {
  const res = await api("/api/v1/auth/login", {
    method: "OPTIONS",
    origin: "https://app.example.com", // matches the https://*.example.com pattern
    headers: {
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });

  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://app.example.com");
  assert.equal(res.headers.get("access-control-allow-credentials"), "true");
  assert.match(res.headers.get("access-control-allow-methods"), /POST/);
  assert.match(res.headers.get("access-control-allow-headers") ?? "", /Content-Type/i);
  assert.match(res.headers.get("vary"), /Origin/);
});

test("preflight from a look-alike origin is denied — no naive suffix matching (Ch08)", async () => {
  // "evil-example.com" must NOT match "https://*.example.com"
  const res = await api("/api/v1/auth/login", {
    method: "OPTIONS",
    origin: "https://evil-example.com",
    headers: { "access-control-request-method": "POST" },
  });

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "CORS_ORIGIN_DENIED");
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("actual requests from an allowed origin expose CORS + rate-limit metadata", async () => {
  const res = await api("/api/v1/auth/login", {
    method: "POST",
    origin: "http://localhost:5173",
    body: CREDENTIALS.user,
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.match(res.headers.get("access-control-expose-headers") ?? "", /X-Request-Id/i);
});

// ══════════════════════════════════════════════════════════════════════════════
// Unit: sliding-window limiter semantics (Ch08)
// ══════════════════════════════════════════════════════════════════════════════

test("sliding-window limiter blocks, reports retry-after, resets and prunes (Ch08)", () => {
  const limiter = new SlidingWindowRateLimiter(3, 1_000);

  assert.equal(limiter.attempt("k").allowed, true);
  assert.equal(limiter.attempt("k").allowed, true);

  const third = limiter.attempt("k");
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);

  const blocked = limiter.attempt("k");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 1_000);

  // Keys are independent namespaces
  assert.equal(limiter.attempt("other-key").allowed, true);

  // Explicit reset (after a successful login, or an admin unlock)
  limiter.reset("k");
  assert.equal(limiter.attempt("k").allowed, true);

  // prune() drops idle buckets without breaking live ones
  limiter.prune();
  assert.equal(limiter.attempt("k").allowed, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// Unit: typed configuration (Ch09 — 12-Factor, fail-fast, no hidden defaults)
// ══════════════════════════════════════════════════════════════════════════════

test("config module exposes frozen, typed settings derived from .env (Ch09)", async () => {
  const { config, parseDurationMs } = await import("../src/config/env.js");

  assert.equal(Object.isFrozen(config), true);
  assert.equal(config.jwt.algorithm, "HS256");
  assert.equal(config.password.bcryptCost, 8);             // from the test env override
  assert.equal(config.cookie.secure, false);               // HTTP in tests
  assert.equal(config.cookie.sameSite, "strict");
  assert.equal(config.cors.credentials, true);
  assert.deepEqual(config.cors.origins, ["http://localhost:5173", "https://*.example.com"]);
  assert.equal(config.security.enforceUserStatusOnRequest, true);

  // Duration parsing feeds TTLs, cookie Max-Age and limiter windows from one place
  assert.equal(parseDurationMs("15m"), 900_000);
  assert.equal(parseDurationMs("7d"), 604_800_000);
  assert.equal(parseDurationMs("30s"), 30_000);
  assert.equal(parseDurationMs("not-a-duration", 42), 42); // safe fallback
});







