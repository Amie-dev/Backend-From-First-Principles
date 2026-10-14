# Implementation Guide 02: Typed `.env` Configuration & Fail-Fast Production Guards

## 1. Goal & First-Principles Context

Configuration is where security services quietly die. Two failure modes dominate:

1. **Scattered magic values** — a 15-minute TTL here, a 7-day TTL there, and a secret in a
   third file. Nobody can answer "what is our session lifetime?" without a full audit.
2. **Silent defaults in production** — the app boots happily with a development JWT secret,
   a non-`Secure` refresh cookie, and wildcard CORS with credentials. Every one of those is
   a total compromise, and none of them raise an error by default.

`src/config/env.js` solves both: **one** place reads `.env`, coerces every value to a typed
value, freezes the result, and **refuses to start** in production when a guard trips.

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `src/config/env.js` | dotenv loader → typed config → guards → JSON logger |
| `.env` | local values (git-ignored) |
| `.env.example` | committed documentation of every variable |
| `src/server.js` | calls `assertSecureConfiguration()` before accepting traffic |

---

## 3. Source: The Loader & Typed Readers

```javascript
import dotenv from "dotenv";
import crypto from "crypto";

// Loaded ONCE, before any other module reads process.env.
// quiet:true keeps boot logs clean; without it dotenv prints an injection banner.
dotenv.config({ quiet: true });

function readString(key, fallback) {
  const raw = process.env[key];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

function readInt(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Accepts true/false, 1/0, yes/no, on/off — ops teams write all five.
function readBool(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function readList(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  return [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))];
}

/**
 * "500ms" · "30s" · "15m" · "12h" · "7d" · "900000" → milliseconds
 * Bare numbers are milliseconds. Unknown input → fallback (never NaN).
 */
export function parseDurationMs(value, fallbackMs = 0) {
  if (value === undefined || value === null || String(value).trim() === "") return fallbackMs;
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
  if (!match) return fallbackMs;

  const amount = Number.parseFloat(match[1]);
  const unit = (match[2] || "ms").toLowerCase();
  const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Math.round(amount * multipliers[unit]);
}

// jsonwebtoken understands "15m"/"7d" natively; we canonicalise to integer seconds
// so ONE parser feeds BOTH the token TTL and the cookie Max-Age (no drift possible).
function toJwtTtl(value, fallbackMs) {
  const ms = parseDurationMs(value, fallbackMs);
  return `${Math.max(1, Math.floor(ms / 1000))}s`;
}
```

### Deep explanation

1. **`dotenv.config({ quiet: true })`** runs at import time. Because ES modules are evaluated
   once per process, the environment is loaded exactly one time no matter how many files
   import `config`.
2. **Typed readers** prevent the classic `.env` bug where `"false"` (a truthy string) and
   `"0"` behave unexpectedly, and where a typo'd number silently becomes `NaN` and disables
   a control. Every reader has a documented fallback — no `undefined` ever escapes.
3. **`parseDurationMs` is the single source of time.** `ACCESS_TOKEN_TTL=15m` drives the JWT
   `exp`, the `expiresIn` field in the JSON response, and any future cache header. A client
   can never be told "900 s" while the server enforces something else.
4. **`toJwtTtl` converts to `900s`** rather than passing `15m` through, because an integer
   seconds string is unambiguous to `jsonwebtoken` and comparable in tests.

---

## 4. Source: The Frozen Config Object

```javascript
const NODE_ENV = readString("NODE_ENV", "development").toLowerCase();
const isProduction = NODE_ENV === "production";

// Dev placeholders are deliberately obvious so a leaked default can never be
// mistaken for a real secret — and the production guard rejects them outright.
const DEV_ACCESS_SECRET  = "dev_only_access_secret__replace_me_with_32_bytes_min";
const DEV_REFRESH_SECRET = "dev_only_refresh_secret__replace_me_with_32_bytes_min";

export const config = Object.freeze({
  env: NODE_ENV,
  isProduction,

  server: Object.freeze({
    port: readInt("PORT", 4000),
    host: readString("HOST", "0.0.0.0"),
    // Trusted proxy hops: behind nginx/ALB `req.ip` is the proxy unless Express is told
    // how many hops to trust — otherwise every client shares one rate-limit bucket.
    trustProxy: readString("TRUST_PROXY", "1"),
    bodyLimit: readString("REQUEST_BODY_LIMIT", "32kb"),
  }),

  jwt: Object.freeze({
    accessSecret:  readString("ACCESS_TOKEN_SECRET", DEV_ACCESS_SECRET),
    refreshSecret: readString("REFRESH_TOKEN_SECRET", DEV_REFRESH_SECRET),
    accessTtlMs:   ACCESS_TTL_MS,
    refreshTtlMs:  REFRESH_TTL_MS,
    accessTtl:     toJwtTtl(readString("ACCESS_TOKEN_TTL", "15m"), ACCESS_TTL_MS),
    refreshTtl:    toJwtTtl(readString("REFRESH_TOKEN_TTL", "7d"), REFRESH_TTL_MS),
    algorithm: "HS256",
    issuer:   readString("JWT_ISSUER", "day04-auth-api"),
    audience: readString("JWT_AUDIENCE", "day04-client"),
  }),

  password: Object.freeze({
    bcryptCost: Math.min(15, Math.max(8, readInt("BCRYPT_COST", 12))), // clamp to a sane range
    minLength: readInt("PASSWORD_MIN_LENGTH", 10),
    maxBytes:  readInt("PASSWORD_MAX_BYTES", 72), // bcrypt truncates past 72 bytes
    requireComplexity: readBool("PASSWORD_REQUIRE_COMPLEXITY", true),
  }),

  cookie: Object.freeze({
    name:     readString("REFRESH_COOKIE_NAME", "refreshToken"),
    path:     readString("REFRESH_COOKIE_PATH", "/api/v1/auth"),
    secure:   readBool("COOKIE_SECURE", false) || isProduction, // forced ON in production
    sameSite: ["strict", "lax", "none"].includes(COOKIE_SAMESITE) ? COOKIE_SAMESITE : "strict",
    domain:   readString("COOKIE_DOMAIN", "") || undefined,
    maxAgeMs: REFRESH_TTL_MS,
  }),

  cors: Object.freeze({
    origins: readList("CORS_ORIGINS", ["http://localhost:3000", "http://localhost:5173"]),
    credentials: readBool("CORS_CREDENTIALS", true),
    methods: readList("CORS_METHODS", ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]),
    // …allowedHeaders, exposedHeaders, maxAgeSeconds, requestIdHeader…
  }),

  rateLimit: Object.freeze({
    loginIpLimit: readInt("LOGIN_IP_LIMIT", 20),
    loginIpWindowMs: parseDurationMs(readString("LOGIN_IP_WINDOW", "1m"), 60_000),
    loginAccountLimit: readInt("LOGIN_ACCOUNT_LIMIT", 5),
    loginAccountWindowMs: parseDurationMs(readString("LOGIN_ACCOUNT_WINDOW", "15m"), 900_000),
    registerIpLimit: readInt("REGISTER_IP_LIMIT", 10),
    registerIpWindowMs: parseDurationMs(readString("REGISTER_IP_WINDOW", "1h"), 3_600_000),
  }),

  security: Object.freeze({
    // One indexed read per request buys instant revocation of deactivated accounts.
    enforceUserStatusOnRequest: readBool("ENFORCE_USER_STATUS_ON_REQUEST", true),
  }),

  seedDemoData: readBool("SEED_DEMO_DATA", true),
});
```

### Deep explanation

1. **`Object.freeze` at every level** — nothing downstream can rebrand the JWT issuer or
   lower the bcrypt cost at runtime. A mutation attempt throws in strict mode (ES modules).
2. **`secure: readBool("COOKIE_SECURE", false) || isProduction`** — production can *never*
   ship a cookie without `Secure`, even if someone sets `COOKIE_SECURE=false` by mistake.
   Failing open here would leak refresh tokens over plaintext HTTP.
3. **`bcryptCost` is clamped to 8…15** — a typo such as `BCRYPT_COST=120` would otherwise
   turn every login into a multi-minute stall (self-inflicted DoS); `BCRYPT_COST=1` would
   make the hashes worthless.
4. **Config is read once, at import.** Middleware and services therefore take a *dependency*
   on `config`, never on `process.env` — one seam to stub in tests.

---

## 5. Source: Fail-Fast Production Guards

```javascript
/**
 * Verifies the process was NOT started with development-grade settings.
 * Called explicitly from the bootstrap sequence so unit tests stay unaffected.
 * @throws {Error} when a production-critical setting is unsafe
 */
export function assertSecureConfiguration() {
  if (!config.isProduction) {
    if (config.jwt.accessSecret === DEV_ACCESS_SECRET) {
      logger.warn("Development JWT secret in use — set ACCESS_TOKEN_SECRET before deploying");
    }
    return;
  }

  const failures = [];

  if (config.jwt.accessSecret === DEV_ACCESS_SECRET || config.jwt.accessSecret.length < 32) {
    failures.push("ACCESS_TOKEN_SECRET must be a unique secret of at least 32 characters");
  }
  if (config.jwt.refreshSecret === DEV_REFRESH_SECRET || config.jwt.refreshSecret.length < 32) {
    failures.push("REFRESH_TOKEN_SECRET must be a unique secret of at least 32 characters");
  }
  if (!config.cookie.secure) {
    failures.push("COOKIE_SECURE must be true in production (HttpOnly + Secure refresh cookie)");
  }
  if (config.cookie.sameSite === "none" && !config.cookie.secure) {
    failures.push("COOKIE_SAMESITE=none requires COOKIE_SECURE=true");
  }
  if (config.cors.credentials && config.cors.origins.includes("*")) {
    failures.push("CORS_ORIGINS cannot contain '*' when CORS_CREDENTIALS=true");
  }
  if (config.cors.origins.length === 0) {
    failures.push("CORS_ORIGINS must list the browser origins allowed to call this API");
  }
  if (config.seedDemoData) {
    failures.push("SEED_DEMO_DATA must be false in production (demo credentials are public)");
  }

  if (failures.length > 0) {
    throw new Error(
      `Refusing to start in production — insecure configuration:\n  • ${failures.join("\n  • ")}`
    );
  }
}
```

### Deep explanation

1. **All failures are collected before throwing** — you fix one deployment, not seven
   sequential ones. The message lists each offending variable.
2. **`length < 32`** — an HS256 secret shorter than the 256-bit output weakens the signature
   to the strength of the secret; 32 characters is the minimum defensible floor.
3. **`*` + credentials is rejected** — the Fetch spec forbids `Access-Control-Allow-Origin: *`
   with credentialed requests, so the only "fix" is echoing arbitrary origins, i.e. no CORS
   protection at all. Better to fail the deploy.
4. **`SEED_DEMO_DATA=true` blocks production** — publicly documented demo passwords
   (`SuperSecret#2024!`) in a production database are a guaranteed intrusion vector.
5. **The guard is called from `server.js`, not at import time** — that keeps the module
   importable by tests, which deliberately run with development settings.

---

## 6. Source: Redacted Snapshot & Structured Logger

```javascript
/** Redacted snapshot for health endpoints / boot logs — fingerprints, never secrets. */
export function describeConfiguration() {
  const fingerprint = (secret) => `${secret.slice(0, 6)}… (${secret.length} chars)`;

  return Object.freeze({
    env: config.env,
    port: config.server.port,
    bcryptCost: config.password.bcryptCost,
    accessTokenTtl: config.jwt.accessTtl,
    refreshTokenTtl: config.jwt.refreshTtl,
    accessSecretFingerprint: fingerprint(config.jwt.accessSecret),
    refreshSecretFingerprint: fingerprint(config.jwt.refreshSecret),
    cookie: { /* name, secure, sameSite, path */ },
    cors:   { origins: config.cors.origins, credentials: config.cors.credentials },
    enforceUserStatusOnRequest: config.security.enforceUserStatusOnRequest,
    seedDemoData: config.seedDemoData,
  });
}

function emit(level, message, meta = {}) {
  const line = { ts: new Date().toISOString(), level, message, ...meta };
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(JSON.stringify(line));           // one JSON object per line → log-shipper friendly
}

export const logger = Object.freeze({
  info:  (message, meta) => emit("info",  message, meta),
  warn:  (message, meta) => emit("warn",  message, meta),
  error: (message, meta) => emit("error", message, meta),
});
```

### Deep explanation

1. **Fingerprints, not values** — `dev_on… (52 chars)` lets an operator confirm *which*
   secret is loaded (dev placeholder vs. rotated prod secret) without ever printing it.
   `/health` is often the least-protected endpoint in production.
2. **JSON lines** — one object per line is trivially parsed by Loki/Datadog/CloudWatch and
   greppable in a terminal; no logger dependency required.
3. **`logger` is shared by every layer**, so audit events always look the same:
   `{ ts, level, message, …context }`.

---

## 7. Verification

Inspect the resolved configuration (no server needed):

```bash
node -e "import('./src/config/env.js').then(m => console.log(JSON.stringify(m.describeConfiguration(), null, 2)))"
```

Expected (abridged):

```json
{
  "env": "development",
  "port": 4000,
  "bcryptCost": 12,
  "accessTokenTtl": "900s",
  "refreshTokenTtl": "604800s",
  "accessSecretFingerprint": "dev_on… (52 chars)",
  "cookie": { "name": "refreshToken", "secure": false, "sameSite": "strict", "path": "/api/v1/auth" },
  "cors": { "origins": ["http://localhost:3000", "http://localhost:5173"], "credentials": true },
  "enforceUserStatusOnRequest": true,
  "seedDemoData": true
}
```

Now watch the guard refuse a bad production boot:

```bash
NODE_ENV=production node -e "import('./src/config/env.js').then(m => m.assertSecureConfiguration())"
```

Expected output (process throws / exits non-zero):

```text
Refusing to start in production — insecure configuration:
  • ACCESS_TOKEN_SECRET must be a unique secret of at least 32 characters
  • REFRESH_TOKEN_SECRET must be a unique secret of at least 32 characters
  • SEED_DEMO_DATA must be false in production (demo credentials are public)
```

> Notice `COOKIE_SECURE` is **not** in that list — it was auto-forced to `true` by
> `|| isProduction`, exactly as designed.

In development the guard downgrades to a warning printed on every boot:

```text
{"ts":"…","level":"warn","message":"Development JWT secret in use — set ACCESS_TOKEN_SECRET before deploying"}
```

The e2e suite asserts this module's contract (test: *"config module exposes frozen, typed
settings derived from .env"*):

```bash
npm test -- --test-name-pattern="config module"   # or just: npm test
```

---

## 8. Why This Matters

* **Fail fast beats fail silent.** A misconfigured auth service that boots is worse than one
  that crashes: the crash is visible, the misconfiguration is not.
* **One source of time and truth.** Token TTLs, cookie `Max-Age`, limiter windows and
  preflight caching all derive from the same parser, so a client timer can never disagree
  with server-side enforcement.
* **Secrets never leave the process.** Logs and `/health` expose fingerprints only, so an
  operational convenience cannot become an exfiltration channel (Ch09 safe egress).
* **Exactly one seam for tests.** The suite overrides `BCRYPT_COST`, secrets and CORS by
  setting environment variables *before* importing the app (Guide 15), which only works
  because config is read once, from one file.



