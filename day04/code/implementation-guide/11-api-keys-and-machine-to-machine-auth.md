# Implementation Guide 11: API Keys & Machine-to-Machine Authentication

## 1. Goal & First-Principles Context

A server-to-server integration is not a user. It has no browser, no cookie jar, no password, and
— crucially — **no human to click "authorize"**. OAuth's delegated flows exist for third parties
acting on *someone else's* data; for your own jobs (a nightly ETL, a CI pipeline, a partner
feed) the right primitive is an **API key** (Ch04).

The design questions and their answers here:

| Question | Answer in this codebase |
| :--- | :--- |
| How do we recognise our own keys in logs/scanners? | Structured prefix `sk_<env>_<48 hex>` |
| Do we store the key? | **No** — only `sha256(rawKey)`; the plaintext is returned exactly once |
| Why is a *fast* hash acceptable? | The key contains 192 bits of CSPRNG entropy, so GPU cracking is infeasible |
| How do we scope it? | An explicit `scopes` array checked per route (`notes:read`, …) |
| How do we stop a runaway job? | Per-key fixed-window rate limit (`rateLimitRpm`) |
| How do we kill it? | `active` flag flipped by revocation; effective on the next request |

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `src/services/api-key.service.js` | `ApiKeyVault` (storage) + `ApiKeyService` (auth, scopes, generation) |
| `src/middlewares/api-key-auth.middleware.js` | `authenticateApiKey` + `requireScopes` |
| `src/controllers/api-key.controller.js` | admin CRUD + the M2M integration endpoint |
| `src/routes/v1/admin.routes.js`, `src/routes/v1/integration.routes.js` | mounting + gates |

---

## 3. Source: Generation & Storage

```javascript
import crypto from "crypto";
import { config } from "../config/env.js";

/** The complete, closed set of scopes this API understands. */
export const AVAILABLE_SCOPES = Object.freeze(["notes:read", "notes:write", "notes:delete"]);
export const API_KEY_ENVIRONMENTS = Object.freeze(["live", "test"]);

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

class ApiKeyVault {
  constructor() {
    /** @type {Map<string, ApiKeyRecord>}  keyed by hashedSecret (the only lookup the hot path needs) */
    this._byHash = new Map();
    /** @type {Map<string, ApiKeyRecord>}  keyed by id (for admin listing / revocation) */
    this._byId = new Map();
  }

  _persist(record) {
    this._byHash.set(record.hashedSecret, record);
    this._byId.set(record.id, record);
  }

  /** Hot path: hash what the client sent, then look it up. O(1), no scan, no timing leak. */
  findByRawKey(rawKey) {
    return this._byHash.get(sha256(rawKey)) ?? null;
  }

  findById(id)   { return this._byId.get(id) ?? null; }
  listAll()      { return [...this._byId.values()]; }

  revoke(id) {
    const r = this._byId.get(id);
    if (!r) return false;
    r.active = false;
    return true;
  }

  _createRecord({ name, scopes, rateLimitRpm, environment, expiresAt }) {
    const rawEntropy = crypto.randomBytes(24).toString("hex");   // 24 bytes = 192 bits
    const rawKey     = `sk_${environment}_${rawEntropy}`;
    const prefix     = rawKey.substring(0, 14);                  // stored for UI display only

    const record = {
      id:            "key_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12),
      name:          name || "Unnamed Integration",
      prefix,
      hashedSecret:  sha256(rawKey),        // ← the ONLY form that is ever persisted
      scopes:        scopes || [],
      rateLimitRpm:  rateLimitRpm ?? config.apiKey.defaultRateLimitRpm,
      _windowStart:  Date.now(),
      _requestCount: 0,
      active:        true,
      createdAt:     new Date(),
      expiresAt:     expiresAt ?? null,
    };

    this._persist(record);
    return { rawKey, record };
  }

  generate(opts) {
    return this._createRecord({ environment: "live", ...opts });
  }
}

export const apiKeyVault = new ApiKeyVault();
```

### Deep explanation

1. **`crypto.randomBytes(24)` = 192 bits of CSPRNG entropy.** Guessing is physically hopeless, and
   *because* of that, a plain SHA-256 is the correct hash here. Contrast with passwords
   (Guide 03): humans pick low-entropy strings, so those need a slow KDF.
2. **`findByRawKey` hashes the input and performs a map lookup.** No decryption, no comparison
   against every stored key (which would be O(n) *and* a timing oracle), and the database never
   contains anything that can be replayed.
3. **Two indexes: by hash (hot path) and by id (admin UX).** Revocation and listing happen on the
   id index, so the authentication path never needs to scan.
4. **`prefix` is stored deliberately** (`sk_live_d49950`) so the admin UI can show *which* key a
   record refers to without ever handling the secret again.
5. **`sk_${environment}_` mirrors Stripe's convention** because it makes leaks *detectable*:
   GitHub/GitLab secret scanning and regex-based pre-commit hooks can recognise the pattern in a
   committed `.env`.
6. **`_windowStart` / `_requestCount` live on the record** so rate limiting needs no second store.
   In production this is a Redis counter (`INCR` + `EXPIRE`) so all replicas share it.
7. **`id` is prefixed (`key_…`)** for the same reason user ids are — instant recognisability in
   logs and audit trails.

---

## 4. Source: Authentication, Scopes & Rate Limiting

```javascript
export class ApiKeyService {
  /**
   * Authenticate a raw API key from the incoming request.
   *   1. Existence check (hash lookup)
   *   2. Active / expiry check
   *   3. Fixed-window rate limit
   */
  static authenticate(rawKey) {
    const record = apiKeyVault.findByRawKey(rawKey);

    if (!record || !record.active) {
      const e = new Error("Invalid or revoked API key");
      e.code = "INVALID_API_KEY";
      throw e;
    }

    if (record.expiresAt && record.expiresAt < new Date()) {
      const e = new Error("API key has expired");
      e.code = "EXPIRED";
      throw e;
    }

    // ── Fixed-window rate limiting (per key) ────────────────────────────────
    const now = Date.now();
    if (now - record._windowStart >= 60_000) {
      record._windowStart  = now;      // new window
      record._requestCount = 0;
    }
    record._requestCount++;
    record._lastUsedAt = now;

    if (record._requestCount > record.rateLimitRpm) {
      const resetAfterMs = 60_000 - (now - record._windowStart);
      const e = new Error(`Rate limit exceeded — max ${record.rateLimitRpm} req/min for this key`);
      e.code         = "RATE_LIMITED";
      e.retryAfter   = Math.max(1, Math.ceil(resetAfterMs / 1000));
      e.resetAfterMs = resetAfterMs;
      throw e;
    }

    const remaining    = record.rateLimitRpm - record._requestCount;
    const resetAfterMs = 60_000 - (now - record._windowStart);
    return { record, remaining, resetAfterMs };
  }

  /** Assert that a record carries all required scopes (least privilege). */
  static assertScopes(record, requiredScopes) {
    const missing = requiredScopes.filter((s) => !record.scopes.includes(s));
    if (missing.length > 0) {
      const e = new Error(
        `API key lacks required scopes: [${missing.join(", ")}]. ` +
        `Key scopes: [${record.scopes.join(", ")}]`
      );
      e.code = "INSUFFICIENT_SCOPE";
      throw e;
    }
  }

  static generate(opts) { return apiKeyVault.generate(opts); }
  static revoke(id)     { return apiKeyVault.revoke(id); }

  /** List metadata for all keys — never exposes hashedSecret or the raw key. */
  static listMetadata() {
    return apiKeyVault
      .listAll()
      .map(({ hashedSecret, _windowStart, _requestCount, ...safe }) => safe);
  }
}
```

### Deep explanation

1. **"Invalid *or revoked*" is one message.** A caller cannot distinguish a mistyped key from a
   disabled one, so key enumeration yields nothing.
2. **Rate limiting happens *inside* `authenticate`** — before the handler runs and therefore
   before any expensive work. The counters are attributes of the key, so a noisy integration
   throttles itself without affecting anyone else.
3. **The 429 error carries `retryAfter` and `resetAfterMs`**, letting the middleware emit both
   `Retry-After` and `X-RateLimit-Reset` without re-deriving them.
4. **`assertScopes` reports the *missing* scope and the key's actual scopes.** Integration
   debugging becomes a diff between two lists instead of a support ticket.
5. **`listMetadata` strips `hashedSecret` (and internal counters) at the source.** Only `prefix`
   survives, so the admin UI can identify a key while the secret material is structurally unable
   to leave the process.
6. **Fixed window vs. sliding window:** the per-key limiter is intentionally simpler (a counter +
   window start), because the threat is a runaway job rather than a determined attacker. The
   *login* limiter (Guide 12) is a sliding window, because there the attacker is the threat.

---

## 5. Source: The M2M Middleware

```javascript
// src/middlewares/api-key-auth.middleware.js
import { ApiKeyService } from "../services/api-key.service.js";
import { UnauthorizedError, ForbiddenError, TooManyRequestsError } from "../errors/api-error.js";

/**
 * Accepts the raw key via either:
 *   X-API-Key: sk_live_…            (preferred for M2M)
 *   Authorization: Bearer sk_live_… (alternative for clients that can set only one header)
 */
export function authenticateApiKey(req, res, next) {
  const rawKey =
    req.headers["x-api-key"] ||
    (req.headers["authorization"]?.startsWith("Bearer ")
      ? req.headers["authorization"].split(" ")[1]
      : null);

  if (!rawKey) {
    return next(new UnauthorizedError(
      "Missing API key — supply via X-API-Key header or Authorization: Bearer"
    ));
  }

  try {
    const { record, remaining, resetAfterMs } = ApiKeyService.authenticate(rawKey);
    req.apiClient = record;

    // Transparent rate-limit metadata (reset as epoch seconds, GitHub/Stripe style)
    res.setHeader("X-RateLimit-Limit",     record.rateLimitRpm);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset",     Math.ceil((Date.now() + resetAfterMs) / 1000));

    next();
  } catch (err) {
    switch (err.code) {
      case "INVALID_API_KEY":
      case "EXPIRED":
        return next(new UnauthorizedError(err.message));                            // 401
      case "RATE_LIMITED":
        return next(new TooManyRequestsError(err.message, err.retryAfter ?? 60));   // 429
      default:
        return next(new UnauthorizedError("API key authentication failed"));
    }
  }
}

/** Verifies that the authenticated key has ALL the required scopes. */
export function requireScopes(...requiredScopes) {
  return function scopeGuard(req, res, next) {
    if (!req.apiClient) {
      return next(new UnauthorizedError(
        "API client context missing — authenticateApiKey must run first"
      ));
    }
    try {
      ApiKeyService.assertScopes(req.apiClient, requiredScopes);
      next();
    } catch (err) {
      return next(new ForbiddenError(err.message));   // 403: identity known, scope insufficient
    }
  };
}
```

### Deep explanation

1. **Two accepted header styles, one code path.** `X-API-Key` is what integrators expect;
   accepting `Authorization: Bearer` as well lets a client library that only exposes one header
   authenticate — an interoperability choice, not a security weakening.
2. **`req.apiClient = record` is the M2M equivalent of `req.principal`** — one trusted identity
   object, written in exactly one place.
3. **The `switch` maps service codes → HTTP statuses.** This is the boundary where *policy* (the
   service's error codes) becomes *protocol* (401/403/429), which keeps the service testable
   without Express.
4. **`INSUFFICIENT_SCOPE` becomes 403, not 401** — the client is authenticated; it is simply not
   authorised for this scope. An integrator then sees "your key works, it needs `notes:read`"
   instead of chasing a phantom credential problem.
5. **`requireScopes` refuses to run without `req.apiClient`**, mirroring `requirePermission`'s
   defensive 401 — the same "fail loudly when the pipeline is misconfigured" principle.
6. **`X-RateLimit-Reset` is epoch seconds**, the widely-adopted convention, so existing client
   libraries compute backoff without custom parsing.

---

## 6. Source: The M2M Integration Route

```javascript
// src/routes/v1/integration.routes.js
import { Router } from "express";
import * as apiKeyCtrl from "../../controllers/api-key.controller.js";
import { authenticateApiKey, requireScopes } from "../../middlewares/api-key-auth.middleware.js";

/**
 * Deliberately a SEPARATE pipeline from the user-facing one:
 *   • credentials arrive as `X-API-Key`, not a Bearer JWT — a stolen user token can never
 *     be replayed against a machine route, and vice versa (credential-domain separation);
 *   • no cookies are involved, so CSRF is structurally impossible here;
 *   • access is narrowed by an explicit scope check rather than a role.
 */
const router = Router();

router.get("/notes", authenticateApiKey, requireScopes("notes:read"), apiKeyCtrl.integrationGetNotes);

export default router;
```

And the controller that serves it (`noteStore.listAll()` is the only cross-tenant read in the
codebase, reachable solely through this scope guard):

```javascript
export function integrationGetNotes(req, res, next) {
  try {
    const allNotes = noteStore.listAll();
    const tenants  = [...new Set(allNotes.map((n) => n.tenantId))];

    res.status(200).json({
      status: "success", source: "M2M API Key Integration",
      client: req.apiClient.name, scopes: req.apiClient.scopes,
      tenants, count: allNotes.length, data: allNotes,
    });
  } catch (err) {
    next(err);
  }
}
```

---

## 7. Verification

### 7.1 Admin mints a key (the secret is shown exactly once)

```bash
BASE=http://localhost:4000
ADMIN=$(curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"aminul@example.com","password":"SuperSecret#2024!"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')

KEY=$(curl -s -X POST $BASE/api/v1/admin/api-keys -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' \
  -d '{"name":"ETL Pipeline","scopes":["notes:read"],"rateLimitRpm":10}')
echo "$KEY"
```

```json
{"status":"success","warning":"COPY THIS KEY NOW — it will never be shown again",
 "data":{"apiKey":"sk_live_<random 48-hex secret — redacted in this doc>",
 "keyMeta":{"id":"key_767429ac74e4","name":"ETL Pipeline","prefix":"sk_live_d49950",
 "scopes":["notes:read"],"rateLimitRpm":10,"environment":"live","createdAt":"…","expiresAt":null}}}
```

> The `apiKey` value is generated fresh at runtime with 192 bits of CSPRNG entropy
> (`src/services/api-key.service.js`), so it is never a fixed string — the example above is
> redacted on purpose. Only the `prefix` (used for admin-UI display) is stable, and the raw
> key is returned by exactly one response and then only ever stored as a SHA-256 digest.

```bash
RAW=$(echo "$KEY" | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.apiKey')

# Listing shows the prefix but NEVER the secret or the hash
curl -s $BASE/api/v1/admin/api-keys -H "authorization: Bearer $ADMIN" | grep -o "$RAW" | wc -l
# → 0
curl -s $BASE/api/v1/admin/api-keys -H "authorization: Bearer $ADMIN" | grep -c hashedSecret
# → 0
```

### 7.2 A non-admin cannot mint keys

```bash
curl -s -X POST $BASE/api/v1/admin/api-keys -H "authorization: Bearer $BOB" \
  -H 'content-type: application/json' -d '{"name":"rogue","scopes":["notes:read"]}'
# → 403 {"error":{"code":"FORBIDDEN","message":"Forbidden — role 'user' lacks: [apikeys:manage]", …}}
```

### 7.3 The M2M call works — with rate-limit transparency

```bash
curl -si $BASE/api/v1/integration/notes -H "x-api-key: $RAW" | grep -iE 'HTTP/|x-ratelimit'
# HTTP/1.1 200 OK
# X-RateLimit-Limit: 10
# X-RateLimit-Remaining: 9
# X-RateLimit-Reset: 1791961626

curl -s $BASE/api/v1/integration/notes -H "x-api-key: $RAW" | head -c 240
# → {"status":"success","source":"M2M API Key Integration","client":"ETL Pipeline",
#    "scopes":["notes:read"],"tenants":["tenant_alpha"],"count":5,"data":[…]}
```

### 7.4 Negative cases: missing, unknown, revoked, wrong scope, wrong credential domain

```bash
# no key
curl -s -o /dev/null -w 'no key            → %{http_code}\n' $BASE/api/v1/integration/notes

# unknown key (valid format, never issued)
curl -s -o /dev/null -w 'unknown key       → %{http_code}\n' \
  $BASE/api/v1/integration/notes -H "x-api-key: sk_live_$(printf '0%.0s' {1..48})"

# a user JWT cannot be replayed on the machine route
curl -s -o /dev/null -w 'user JWT          → %{http_code}\n' \
  $BASE/api/v1/integration/notes -H "authorization: Bearer $BOB"

# insufficient scope (key minted with notes:write only)
WKEY=$(curl -s -X POST $BASE/api/v1/admin/api-keys -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d '{"name":"Writer","scopes":["notes:write"]}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.apiKey')
curl -s -o /dev/null -w 'wrong scope       → %{http_code}\n' \
  $BASE/api/v1/integration/notes -H "x-api-key: $WKEY"

# revoked key
KEYID=$(curl -s $BASE/api/v1/admin/api-keys -H "authorization: Bearer $ADMIN" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.find(k=>k.prefix==="sk_live_d49950").id')
curl -s -o /dev/null -w 'revoke            → %{http_code}\n' -X DELETE \
  $BASE/api/v1/admin/api-keys/$KEYID -H "authorization: Bearer $ADMIN"
curl -s -o /dev/null -w 'revoked key       → %{http_code}\n' \
  $BASE/api/v1/integration/notes -H "x-api-key: $RAW"
```

```text
no key            → 401
unknown key       → 401
user JWT          → 401
wrong scope       → 403
revoke            → 200
revoked key       → 401
```

### 7.5 The per-key rate limit returns 429 with `Retry-After`

```bash
TKEY=$(curl -s -X POST $BASE/api/v1/admin/api-keys -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' \
  -d '{"name":"Throttled","scopes":["notes:read"],"rateLimitRpm":2}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.apiKey')

for i in 1 2 3; do
  curl -s -o /dev/null -w "call $i → %{http_code}\n" $BASE/api/v1/integration/notes -H "x-api-key: $TKEY"
done
# call 1 → 200
# call 2 → 200
# call 3 → 429
```

### 7.6 The suite

```bash
npm test
# ✔ only an admin can mint API keys and the raw key is shown exactly once (Ch04)
# ✔ API key creation validates scopes, environment and expiry (Ch04)
# ✔ M2M endpoint enforces the API key and its scopes (Ch04)
# ✔ revoking an API key takes effect on the very next request (Ch04)
# ✔ per-key rate limiting returns 429 with Retry-After (Ch04/Ch08)
```

---

## 8. Why This Matters

* **Different credential, different pipeline.** A user token and a machine key have different
  lifetimes, different revocation semantics and different blast radii. Keeping the two flows
  separate means a compromised CI key cannot be replayed as a user session.
* **One-time disclosure forces good secret hygiene.** Because the plaintext cannot be retrieved,
  integrators must store it in a secret manager — the design *teaches* the right behaviour.
* **Scopes are least privilege made concrete.** A read-only ETL key that physically cannot delete
  notes is worth more than a policy document saying it should not.
* **Rate limiting per key protects the platform from its own customers** — one misconfigured cron
  job retrying in a tight loop would otherwise take the API down for everyone.
* **Everything is auditable.** Creation, revocation and prefix are logged with the responsible
  admin's id, so "which key did this, who made it, and when was it revoked?" is a query, not an
  investigation.





