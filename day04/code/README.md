# Day 04 — Authentication & Authorization API (Express + JWT + bcrypt)

A production-shaped **AuthN/AuthZ** service built **from first principles**, following the
**[Day 04 chapter notes](../notes/README.md)**. Every security decision in the code is
annotated with the chapter that justifies it — read the notes, then read the code, and the
"why" is always one line away.

```
Authentication = "Who are you?"    →  the WHO   (JWT · bcrypt · cookies)
Authorization  = "What may you do?" →  the WHAT  (RBAC · ownership · scopes)
```

---

## 📚 Chapter → Implementation Map

| Ch | Topic | Where it lives in this codebase |
| :-- | :--- | :--- |
| **01** | AuthN vs AuthZ, the dual gatekeeper | `middlewares/authenticate.middleware.js`, `middlewares/authorise.middleware.js`, `errors/api-error.js` (401 vs 403) |
| **02** | Sessions, JWTs, Cookies | `services/token.service.js` (`jsonwebtoken`, HS256), `middlewares/cookies.middleware.js`, cookie flags in `controllers/auth.controller.js` |
| **03** | Stateful vs Stateless vs **Hybrid** | Access JWT (stateless) + refresh-token store with **rotation** and a **breach circuit breaker** — `services/token.service.js` |
| **04** | API keys & M2M authentication | `services/api-key.service.js`, `middlewares/api-key-auth.middleware.js`, `routes/v1/integration.routes.js` |
| **05** | OAuth 2.0 / OIDC (concepts) | Not implemented (concepts only in the notes) — see the extension roadmap at the bottom |
| **06** | RBAC, ownership, anti-BOLA | `middlewares/authorise.middleware.js` (permission matrix), `db/note.store.js` (ownership scoped **inside the query**) |
| **07** | Cryptographic password storage | `services/password.service.js` — **bcrypt**, cost factor from `.env`, per-hash salt, policy, `needsRehash()` upgrades |
| **08** | Threat modelling & defences | uniform login errors, dummy-hash timing equaliser, sliding-window rate limits, CORS allow-list, `alg` allow-list |
| **09** | End-to-end pipeline & safe egress | `app.js` (7-stage assembly), `config/env.js` (12-Factor + fail-fast), `middlewares/request-context.middleware.js` (audit log), `middlewares/error.middleware.js` |

---

## 🚀 Quick Start

```bash
cd day04/code

# 1. Dependencies: express, jsonwebtoken, bcrypt, dotenv
npm install

# 2. Environment (the repo .gitignore already excludes the real .env)
cp .env.example .env
#    Generate real secrets for anything public-facing:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Run
npm start        # → http://localhost:4000
npm run dev      # watch mode

# 4. Verify (38 end-to-end tests, no test framework needed)
npm test
```

### Seeded demo accounts

| Role | Email | Password |
| :--- | :--- | :--- |
| `admin` | `aminul@example.com` | `SuperSecret#2024!` |
| `moderator` | `sarah@example.com` | `Moderate@Pass99` |
| `user` | `bob@example.com` | `User$Passw0rd` |
| `user` | `alice@example.com` | `Alice$Secure1` |

Passwords are **bcrypt-hashed at boot** (never stored or logged in plaintext).
Set `SEED_DEMO_DATA=false` to start with an empty user table.

---

## 🧭 Step-by-Step Implementation Guide

Prefer to build this codebase yourself rather than read the finished article? The
**[implementation-guide](./implementation-guide/README.md)** walks through every file in the order
they depend on each other: setup → config → bcrypt → registration → login → JWTs → refresh
rotation → cookies → AuthN gate → RBAC/anti-BOLA → API keys → CORS & limits → errors/audit →
pipeline assembly → tests. Each guide contains the real source, a line-by-line rationale, and the
`curl`/`node` command that proves it works.

---

## 🧱 The 7-Stage Request Pipeline (Ch09)

```
 ① Network boundary   trust proxy → security headers (nosniff/HSTS/CSP/no-store)
 ② Abuse prevention   sliding-window rate limits (IP + account + API-key RPM)
 ③ Input parsing      JSON body cap (REQUEST_BODY_LIMIT) → cookies (null-proto bag)
 ④ Authentication     authenticate (JWT/API key) ──fail──► 401 Unauthorized
 ⑤ Authorization      requirePermission / requireScopes ─fail► 403 Forbidden
 ⑥ Scoped logic       controllers → stores (tenant + owner scoped queries)
 ⑦ Safe egress        audit log line + single JSON error envelope (no internals)
```

The **middleware order in `src/app.js` is the security model** — each stage is a comment
block explaining what breaks if it is moved.

---

## 📁 Project Structure

```
day04/code
├── .env / .env.example          # 12-Factor config (secrets, TTLs, CORS, limits)
├── package.json                 # express · jsonwebtoken · bcrypt · dotenv
├── test/auth.e2e.test.js        # 38 end-to-end tests (node:test)
├── implementation-guide/        # 📚 15 step-by-step build guides (see README there)
└── src
    ├── app.js                   # pipeline assembly (stages ①–⑦)
    ├── server.js                # boot, fail-fast guards, graceful shutdown
    ├── bootstrap.js             # seeding + maintenance timers (used by tests too)
    ├── config/env.js            # dotenv loader → frozen typed config + logger
    ├── routes/v1/               # auth · notes · admin · integration → index.js
    ├── middlewares/
    │   ├── cors.middleware.js            # env-driven allow-list + preflight (Ch08)
    │   ├── security-headers.middleware.js
    │   ├── request-context.middleware.js # X-Request-Id + JSON audit log
    │   ├── cookies.middleware.js         # hardened RFC-6265 parser (no dependency)
    │   ├── authenticate.middleware.js    # AuthN gate (JWT verify + status check)
    │   ├── authorise.middleware.js       # AuthZ gate (RBAC permission matrix)
    │   ├── api-key-auth.middleware.js    # M2M gate + scope guard
    │   └── error.middleware.js           # safe egress / one error envelope
    ├── controllers/             # auth · notes · users · api-key · health
    ├── services/                # password (bcrypt) · token (JWT+RTR) · api-key · limiter
    ├── db/                      # in-memory user + note stores (swap for SQL/Redis)
    └── errors/api-error.js      # 400/401/403/404/409/429/500 hierarchy
```

---

## ⚙️ Configuration (.env)

Every value is typed and validated in `src/config/env.js`; nothing is hard-coded in the
business logic. Production boots are **fail-fast**: if `NODE_ENV=production` and any of the
guards below trip, the process refuses to start (`assertSecureConfiguration()`).

| Variable | Default | Why it matters |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Enables production-only guards (HSTS, Secure cookies, secret length) |
| `PORT` / `HOST` | `4000` / `0.0.0.0` | Bind address |
| `TRUST_PROXY` | `1` | Trusted proxy hops — without it `req.ip` is the LB's IP and rate limiting is defeated |
| `REQUEST_BODY_LIMIT` | `32kb` | Cheap DoS guard before any parsing work |
| `ACCESS_TOKEN_SECRET` | dev placeholder | HS256 signing key — **must be ≥ 32 chars and unique in production** |
| `REFRESH_TOKEN_SECRET` | dev placeholder | Reserved for signed refresh tokens (rotation is stateful today) |
| `ACCESS_TOKEN_TTL` | `15m` | Short-lived so a stolen token has a bounded blast radius |
| `REFRESH_TOKEN_TTL` | `7d` | Session lifetime; also drives the cookie `Max-Age` |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `day04-auth-api` / `day04-client` | Blocks token-confusion between services |
| `BCRYPT_COST` | `12` | ~250 ms/hash; each +1 **doubles** attacker cost |
| `PASSWORD_MIN_LENGTH` / `PASSWORD_MAX_BYTES` | `10` / `72` | bcrypt silently truncates past 72 bytes → enforced at the edge |
| `PASSWORD_REQUIRE_COMPLEXITY` | `true` | Lowercase + uppercase + digit + symbol |
| `COOKIE_SECURE` | forced `true` in prod | HTTPS-only refresh cookie |
| `COOKIE_SAMESITE` | `strict` | Removes CSRF on state-changing routes |
| `REFRESH_COOKIE_PATH` | `/api/v1/auth` | Cookie is not sent on every unrelated API call |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Exact origins or `https://*.example.com` patterns; `*` is refused in prod with credentials |
| `CORS_*` | sensible defaults | Methods, allowed headers, exposed headers, preflight `Max-Age` |
| `LOGIN_IP_LIMIT` / `LOGIN_ACCOUNT_LIMIT` | `20`/min, `5`/15 min | Botnet spraying vs targeted dictionary attacks |
| `REGISTER_IP_LIMIT` | `10`/hour | Blocks mass fake-account creation |
| `ENFORCE_USER_STATUS_ON_REQUEST` | `true` | Reject tokens of deactivated/re-roled users (one indexed read per request) |
| `API_KEY_DEFAULT_RATE_LIMIT_RPM` | `60` | Default per-key throughput |
| `SEED_DEMO_DATA` | `true` | **Must be `false` in production** — demo credentials are public |

---

## 🔌 API Reference

| Method | Path | Gate | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/health`, `/api/v1/health` | public | Liveness + **redacted** config snapshot |
| `POST` | `/api/v1/auth/register` | public (IP-limited) | Create an account (role is always `user`) |
| `POST` | `/api/v1/auth/login` | public (IP + account limited) | Issue access JWT + HttpOnly refresh cookie |
| `POST` | `/api/v1/auth/refresh` | refresh cookie | Rotate the token pair; replay ⇒ breach |
| `POST` | `/api/v1/auth/logout` | refresh cookie | Revoke this session |
| `GET` | `/api/v1/auth/me` | `authenticate` | Live identity + session metadata |
| `GET` | `/api/v1/auth/sessions` | `authenticate` | Active sessions (ids masked) |
| `POST` | `/api/v1/auth/logout-all` | `authenticate` | Revoke every session for the user |
| `GET/POST` | `/api/v1/notes` | `notes:read_own` / `notes:create` | List (own only) / create |
| `GET/PATCH/DELETE` | `/api/v1/notes/:id` | `notes:read_own` / `notes:edit_own` / `notes:delete_own` | Owner **or** admin; 403 for other users, 404 across tenants |
| `GET` | `/api/v1/admin/notes/archived` | `notes:read_archived` | Admin-only moderation view |
| `GET` | `/api/v1/admin/users[/:id]` | `users:read` | User administration (no hashes ever serialised) |
| `PATCH` | `/api/v1/admin/users/:id` | `users:manage` | Change role / active — **revokes that user's sessions** |
| `DELETE` | `/api/v1/admin/users/:id/sessions` | `users:manage` | Incident response: kick a user off all devices |
| `POST/GET/DELETE` | `/api/v1/admin/api-keys[/:id]` | `apikeys:manage` | Mint / list / revoke M2M keys |
| `GET` | `/api/v1/integration/notes` | `X-API-Key` + `notes:read` | Machine-to-machine, cross-tenant read |

---

## 🧪 Live Walkthrough (curl)

```bash
BASE=http://localhost:4000
JAR=/tmp/day04.jar

# ── 1. Login (JWT in the body, refresh token in an HttpOnly cookie) ───────────
curl -s -c $JAR -X POST $BASE/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"bob@example.com","password":"User$Passw0rd"}'
# → 200 { data: { accessToken: "eyJ…", expiresIn: 900, ... } }
# Set-Cookie: refreshToken=…; HttpOnly; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800

TOKEN=$(curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"bob@example.com","password":"User$Passw0rd"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')

# ── 2. Who am I? ─────────────────────────────────────────────────────────────
curl -s $BASE/api/v1/auth/me -H "authorization: Bearer $TOKEN"

# ── 3. Create a note (ownership enforced inside the store query) ─────────────
curl -s -X POST $BASE/api/v1/notes -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"title":"Hello","content":"first note"}'

# ── 4. Rotate the refresh token (the old one is consumed) ────────────────────
curl -si -b $JAR -c $JAR -X POST $BASE/api/v1/auth/refresh | grep -i set-cookie

# ── 5. Replay the OLD cookie → the breach circuit breaker kills the family ───
curl -s -b $JAR -X POST $BASE/api/v1/auth/refresh
# → 401 "…already used — all sessions for the account have been revoked…"

# ── 6. CORS preflight (env allow-list; look-alike origins are rejected) ──────
curl -si -X OPTIONS $BASE/api/v1/auth/login \
  -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' | head -12
curl -s  -X OPTIONS $BASE/api/v1/auth/login \
  -H 'Origin: https://evil-example.com' -H 'Access-Control-Request-Method: POST'
# → 403 { error: { code: "CORS_ORIGIN_DENIED" } }

# ── 7. API key (admin) → M2M call with scopes + per-key rate limits ─────────
ATOKEN=$(curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"aminul@example.com","password":"SuperSecret#2024!"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')

KEY=$(curl -s -X POST $BASE/api/v1/admin/api-keys -H "authorization: Bearer $ATOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"ETL Pipeline","scopes":["notes:read"],"rateLimitRpm":10}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.apiKey')   # sk_live_…

curl -s -i $BASE/api/v1/integration/notes -H "x-api-key: $KEY" | head -8
# → 200 + X-RateLimit-Limit / -Remaining / -Reset headers
```

---

## 🧠 Security Decisions & Rationale

| Decision | Why (first principles) |
| :--- | :--- |
| **bcrypt with an env-driven cost factor** | General-purpose hashes (MD5/SHA-256) are built to be *fast* — a GPU tries billions per second. bcrypt's cost factor makes each guess deliberately expensive and doubles the attacker's bill per increment. Cost 12 ≈ 250 ms/hash on this hardware. |
| **72-byte password ceiling rejected, not truncated** | bcrypt silently ignores bytes past 72, so a long passphrase would be authenticated by its prefix only. The API refuses such input instead of quietly weakening it. |
| **`needsRehash()` on successful login** | Plaintext is available exactly once — during login. That is the only moment an old, cheaper digest can be transparently upgraded: a cost-factor migration with zero downtime and zero password resets. |
| **Dummy bcrypt compare for unknown accounts** | Without it, "unknown email" returns in ~1 ms and "wrong password" in ~250 ms, which announces which accounts exist. The equaliser makes both paths cost the same. |
| **Identical `401 Invalid email or password`** | One message for both failure modes ⇒ no user-enumeration oracle. |
| **Short access token + rotating refresh token** | Stateless JWTs cannot be un-issued, so their lifetime *is* the damage window. The stateful refresh token is the revocation lever; rotation + family tracking turns a silent hijack into a loud, bounded incident. |
| **`algorithms: ["HS256"]` on verify** | Refuses `alg: none` and RS256/HS256 confusion — the two classic JWT bypasses. |
| **`iss` / `aud` claims** | A token minted for another service is useless here (token-confusion defence). |
| **No PII in the JWT** | JWTs are signed, not encrypted: anyone holding one can read it. Only `sub`, `role`, `sid`, `jti` travel. |
| **HttpOnly + Secure + SameSite=Strict cookie** | XSS cannot read it, plaintext HTTP cannot leak it, cross-site requests do not carry it (CSRF-neutral). Scope is narrowed with `Path=/api/v1/auth`. |
| **Access token kept out of cookies** | It lives in client memory, so the API keeps Bearer semantics for non-browser clients and avoids cookie CSRF on API routes. |
| **User-status check on the hot path** | Closes the one true gap of stateless auth: a token issued before deactivation/demotion would otherwise survive its full 15-minute TTL. Configurable via `ENFORCE_USER_STATUS_ON_REQUEST`. |
| **Role change / deactivation revokes sessions** | "Revoke on privilege change": a demoted admin must not keep privileged sessions alive. |
| **Ownership enforced inside the store query** | The `owner_id = ? AND tenant_id = ?` predicate lives in one place, so no controller can forget it — the root cause of BOLA/IDOR. Cross-tenant misses return **404**, not 403, so existence is never leaked. |
| **API keys stored as SHA-256 of a 192-bit secret** | Per-key entropy makes GPU cracking infeasible, so a fast hash is correct here (unlike passwords). Keys carry identifiable prefixes (`sk_live_…`) so secret scanners can flag leaks. |
| **CORS allow-list with anchored wildcard matching** | `endsWith()` would let `evil-example.com` pass for `*.example.com`; the compiled regex does not. `Vary: Origin` keeps shared caches honest. |
| **Sliding-window rate limits (IP + account + key)** | A fixed window can be burst-abused at its boundary; a sliding window cannot. Limits stay cooperative: `X-RateLimit-*` and `Retry-After` are always returned. |
| **Fail-fast production guards** | A production boot with a dev JWT secret, insecure cookie, wildcard-CORS-with-credentials, or demo seeding is a total compromise — so the process refuses to start. |
| **One error envelope, no internals** | Stack traces, SQL, file paths and hashes never reach a client (Ch09 Stage 7); anything unexpected becomes a logged 500 with a generic message. |

---

## ✅ Testing

```bash
npm test            # 38 end-to-end tests via the built-in node:test runner
npm run test:watch
```

The suite boots the real app (no mocks) on an ephemeral port and asserts, among other things:

* registration policy violations are rejected (length, complexity, > 72 bytes);
* bcrypt digests are salted and `needsRehash()` detects cheaper cost factors;
* `alg: none`, tampered signatures and foreign-secret tokens are all rejected;
* refresh **rotation** works, and a replayed token revokes the entire family;
* RBAC matrix: `user` → own notes only, `moderator` → read-only, `admin` → full;
* cross-owner access returns 403, unauthenticated returns 401;
* privilege changes kill sessions; deactivation blocks tokens immediately;
* API keys: one-time disclosure, scope checks, revocation, per-key 429 + `Retry-After`;
* CORS: allowed origin negotiated, look-alike origin denied, `Vary: Origin` present;
* the production config guard rails and the sliding-window limiter semantics.

---

## 🏭 Production Readiness Notes (what to swap)

This is a teaching codebase: the stores are in-memory and the limiters are per-process.
Each component below was deliberately isolated so it can be replaced without touching the
business logic.

| Component | Teaching implementation | Production replacement |
| :--- | :--- | :--- |
| Users / notes | `src/db/*.store.js` (Maps) | PostgreSQL/MySQL with unique indexes + migrations |
| Refresh-token store | `RefreshTokenStore` (Map) | Redis keys with TTL + a per-family index |
| Rate limiter | `SlidingWindowRateLimiter` (Map) | Redis `ZADD`/`ZREMRANGEBYSCORE` (atomic, shared across replicas) |
| Password hashing | bcrypt (cost 12) | bcrypt (tuned) **or** Argon2id + a breached-password check (HIBP k-anonymity) |
| Audit logs | JSON lines to stdout | Log pipeline (Loki/Datadog/CloudWatch) + SIEM alert on `token family revoked` |
| Edge security | first-principles CORS/headers | Keep these as defence in depth; add WAF/CDN at the edge |
| TLS | terminated upstream | HTTPS everywhere — `COOKIE_SECURE=true` is enforced by the boot guard |

**Roadmap (Ch05):** Authorization Code Flow with **PKCE** against a real OIDC provider —
store the IdP `sub` in a federated-identity table and then mint *this* service's own session;
never treat an ID token as an API access token.

---

**Read the notes first, then the code.** Every module header cites the chapter it implements,
and every non-obvious line names the attack it prevents.




