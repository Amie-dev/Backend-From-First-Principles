import dotenv from "dotenv";
import crypto from "crypto";

/**
 * Environment Configuration Loader — single source of truth for runtime config
 *
 * Chapter Ref: Day04 Ch08 (never hard-code secrets), Ch09 (12-Factor config),
 *              Ch07 (bcrypt cost calibration), Ch02/Ch03 (cookie & token TTLs)
 *
 * Rules enforced here:
 *  1. `.env` is loaded ONCE, before any other module reads process.env.
 *  2. Every value is coerced to a typed value (string | number | boolean | array).
 *  3. Development falls back to safe demo defaults so `npm start` works out of
 *     the box — production REFUSES to boot with unsafe defaults (fail fast).
 */

// ─── 1. Load the .env file (silent; no noisy banner on boot) ───────────────────
dotenv.config({ quiet: true });

// ─── 2. Typed readers ─────────────────────────────────────────────────────────

/**
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function readString(key, fallback) {
  const raw = process.env[key];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

/**
 * @param {string} key
 * @param {number} fallback
 * @returns {number}
 */
function readInt(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Accepts: true/false, 1/0, yes/no, on/off
 * @param {string} key
 * @param {boolean} fallback
 * @returns {boolean}
 */
function readBool(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

/**
 * Comma-separated list → trimmed, de-duplicated array.
 * @param {string} key
 * @param {string[]} fallback
 * @returns {string[]}
 */
function readList(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  return [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))];
}

/**
 * Parse a human duration ("500ms", "30s", "15m", "12h", "7d", "900000") into ms.
 * Bare numbers are interpreted as milliseconds.
 *
 * @param {string} value
 * @param {number} fallbackMs
 * @returns {number}
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

/**
 * `jsonwebtoken` understands "15m"/"7d" natively, so the raw string is kept for
 * signing while the numeric ms form drives cookies and pruning.
 *
 * @param {string} value
 * @param {number} fallbackMs
 * @returns {string} canonical jwt duration string (integer seconds)
 */
function toJwtTtl(value, fallbackMs) {
  const ms = parseDurationMs(value, fallbackMs);
  return `${Math.max(1, Math.floor(ms / 1000))}s`;
}

// ─── 3. Environment flags ────────────────────────────────────────────────────
const NODE_ENV = readString("NODE_ENV", "development").toLowerCase();
const isProduction = NODE_ENV === "production";
const isTest = NODE_ENV === "test";

// ─── 4. Secrets ──────────────────────────────────────────────────────────────
// Dev defaults are intentionally obvious so a leaked default can never be
// mistaken for a real production secret (and assertSecureConfiguration() refuses
// to start production while they are in place).
const DEV_ACCESS_SECRET = "dev_only_access_secret__replace_me_with_32_bytes_min";
const DEV_REFRESH_SECRET = "dev_only_refresh_secret__replace_me_with_32_bytes_min";

const ACCESS_TOKEN_SECRET = readString("ACCESS_TOKEN_SECRET", DEV_ACCESS_SECRET);
const REFRESH_TOKEN_SECRET = readString("REFRESH_TOKEN_SECRET", DEV_REFRESH_SECRET);

// ─── 5. Durations ────────────────────────────────────────────────────────────
const ACCESS_TTL_MS = parseDurationMs(readString("ACCESS_TOKEN_TTL", "15m"), 15 * 60_000);
const REFRESH_TTL_MS = parseDurationMs(readString("REFRESH_TOKEN_TTL", "7d"), 7 * 86_400_000);

// ─── 6. Cookie policy ────────────────────────────────────────────────────────
const COOKIE_SAMESITE = readString("COOKIE_SAMESITE", "strict").toLowerCase();
const COOKIE_SECURE = readBool("COOKIE_SECURE", false) || isProduction;

// ─── 7. Frozen configuration object ──────────────────────────────────────────
export const config = Object.freeze({
  env: NODE_ENV,
  isProduction,
  isTest,
  isDevelopment: !isProduction && !isTest,

  server: Object.freeze({
    port: readInt("PORT", 4000),
    host: readString("HOST", "0.0.0.0"),
    // Number of trusted proxy hops — keeps req.ip honest behind nginx/ALB so that
    // rate limiting cannot be bypassed by spoofing X-Forwarded-For.
    trustProxy: readString("TRUST_PROXY", "1"),
    // Maximum accepted request body — a cheap, effective denial-of-service guard.
    bodyLimit: readString("REQUEST_BODY_LIMIT", "32kb"),
  }),

  jwt: Object.freeze({
    accessSecret: ACCESS_TOKEN_SECRET,
    refreshSecret: REFRESH_TOKEN_SECRET,
    accessTtlMs: ACCESS_TTL_MS,
    refreshTtlMs: REFRESH_TTL_MS,
    accessTtl: toJwtTtl(readString("ACCESS_TOKEN_TTL", "15m"), ACCESS_TTL_MS),
    refreshTtl: toJwtTtl(readString("REFRESH_TOKEN_TTL", "7d"), REFRESH_TTL_MS),
    algorithm: "HS256",
    issuer: readString("JWT_ISSUER", "day04-auth-api"),
    audience: readString("JWT_AUDIENCE", "day04-client"),
  }),

  password: Object.freeze({
    // bcrypt work factor: each +1 doubles the CPU time of an offline attack.
    bcryptCost: Math.min(15, Math.max(8, readInt("BCRYPT_COST", 12))),
    minLength: readInt("PASSWORD_MIN_LENGTH", 10),
    // bcrypt silently truncates beyond 72 bytes → enforced at the edge instead.
    maxBytes: readInt("PASSWORD_MAX_BYTES", 72),
    requireComplexity: readBool("PASSWORD_REQUIRE_COMPLEXITY", true),
  }),

  cookie: Object.freeze({
    name: readString("REFRESH_COOKIE_NAME", "refreshToken"),
    path: readString("REFRESH_COOKIE_PATH", "/api/v1/auth"),
    secure: COOKIE_SECURE,
    sameSite: ["strict", "lax", "none"].includes(COOKIE_SAMESITE) ? COOKIE_SAMESITE : "strict",
    domain: readString("COOKIE_DOMAIN", "") || undefined,
    maxAgeMs: REFRESH_TTL_MS,
  }),

  cors: Object.freeze({
    origins: readList("CORS_ORIGINS", ["http://localhost:3000", "http://localhost:5173"]),
    credentials: readBool("CORS_CREDENTIALS", true),
    methods: readList("CORS_METHODS", ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]),
    allowedHeaders: readList("CORS_ALLOWED_HEADERS", [
      "Authorization",
      "Content-Type",
      "X-API-Key",
      "X-Requested-With",
      "Accept",
    ]),
    exposedHeaders: readList("CORS_EXPOSED_HEADERS", [
      "X-Request-Id",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "Retry-After",
    ]),
    maxAgeSeconds: readInt("CORS_MAX_AGE_SECONDS", 86_400),
    // Correlation header propagated for end-to-end tracing (Ch09 Stage 7)
    requestIdHeader: "X-Request-Id",
  }),

  rateLimit: Object.freeze({
    loginIpLimit: readInt("LOGIN_IP_LIMIT", 20),
    loginIpWindowMs: parseDurationMs(readString("LOGIN_IP_WINDOW", "1m"), 60_000),
    loginAccountLimit: readInt("LOGIN_ACCOUNT_LIMIT", 5),
    loginAccountWindowMs: parseDurationMs(readString("LOGIN_ACCOUNT_WINDOW", "15m"), 900_000),
    registerIpLimit: readInt("REGISTER_IP_LIMIT", 10),
    registerIpWindowMs: parseDurationMs(readString("REGISTER_IP_WINDOW", "1h"), 3_600_000),
  }),

  apiKey: Object.freeze({
    defaultRateLimitRpm: readInt("API_KEY_DEFAULT_RATE_LIMIT_RPM", 60),
  }),

  security: Object.freeze({
    // Hot-path guard: reject tokens whose user was deleted/deactivated.
    // Costs one indexed lookup per request — the price of instant revocation.
    enforceUserStatusOnRequest: readBool("ENFORCE_USER_STATUS_ON_REQUEST", true),
  }),

  seedDemoData: readBool("SEED_DEMO_DATA", true),
});

// ─── 8. Fail-fast production guards ──────────────────────────────────────────

/**
 * Verifies that the process was NOT started with development-grade settings.
 * Called explicitly from the bootstrap sequence so unit tests stay unaffected.
 *
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

/**
 * Redacted snapshot for health endpoints / boot logs.
 * Never exposes secrets — only fingerprints (first 6 chars + length).
 */
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
    cookie: {
      name: config.cookie.name,
      secure: config.cookie.secure,
      sameSite: config.cookie.sameSite,
      path: config.cookie.path,
    },
    cors: {
      origins: config.cors.origins,
      credentials: config.cors.credentials,
    },
    enforceUserStatusOnRequest: config.security.enforceUserStatusOnRequest,
    seedDemoData: config.seedDemoData,
  });
}

// ─── 9. Structured logger (dependency-free, JSON lines for log shippers) ─────

function emit(level, message, meta = {}) {
  const line = { ts: new Date().toISOString(), level, message, ...meta };
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(JSON.stringify(line));
}

export const logger = Object.freeze({
  info: (message, meta) => emit("info", message, meta),
  warn: (message, meta) => emit("warn", message, meta),
  error: (message, meta) => emit("error", message, meta),
});

/**
 * Generates a URL-safe 384-bit secret.
 * Handy bootstrap helper:  node -e "import('./src/config/env.js').then(m=>console.log(m.generateSecret()))"
 * @returns {string}
 */
export function generateSecret() {
  return crypto.randomBytes(48).toString("base64url");
}

export default config;


