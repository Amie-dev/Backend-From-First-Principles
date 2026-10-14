import crypto from "crypto";
import { config } from "../config/env.js";

/**
 * ApiKeyService — Machine-to-Machine (M2M) API Key Generation & Verification
 *
 * Chapter Ref: Day04 Ch04 — API Keys & Machine-to-Machine Authentication
 *
 * Architecture:
 * ─────────────
 * • Keys are generated with a Stripe-style structured prefix so that
 *   automated secret scanners (GitHub, GitLab) can detect and flag
 *   accidentally committed keys.
 *   Format:  sk_<env>_<48-hex-chars>
 *
 * • Only the SHA-256 hash of the full key is stored.  The plaintext
 *   key is returned exactly ONCE at creation and never stored.
 *   (SHA-256 is appropriate here: the key contains 192 bits of CSPRNG
 *   entropy so GPU dictionary attacks are mathematically infeasible.)
 *
 * • Each key record carries a `scopes` array so callers can enforce
 *   least-privilege access (e.g. ["notes:read"] vs ["notes:read","notes:write"]).
 *
 * • A fixed-window per-key rate limiter is bundled into the store to
 *   throttle abusive integrations without needing a separate Redis instance
 *   (suitable for learning; in production use Redis + Lua atomic counters).
 */

// ──────────────────────────────────────────────────────────────────────────────
// In-Memory API Key Vault  (simulates the database table)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ApiKeyRecord
 * @property {string}   id           - Opaque record identifier
 * @property {string}   name         - Human label (e.g. "CI/CD Pipeline")
 * @property {string}   prefix       - First 14 chars of raw key (for UI display)
 * @property {string}   hashedSecret - SHA-256 hex digest of the full raw key
 * @property {string[]} scopes       - Allowed permission scopes
 * @property {number}   rateLimitRpm - Max requests per minute for this key
 * @property {number}   _windowStart - Internal: sliding-window start time (ms)
 * @property {number}   _requestCount- Internal: request count in current window
 * @property {boolean}  active       - Whether the key is currently enabled
 * @property {Date}     createdAt
 * @property {Date|null}expiresAt
 */

class ApiKeyVault {
  constructor() {
    /** @type {Map<string, ApiKeyRecord>}  keyed by hashedSecret */
    this._byHash   = new Map();
    /** @type {Map<string, ApiKeyRecord>}  keyed by id (for revocation UX) */
    this._byId     = new Map();
  }

  /**
   * Persist a new record.
   * @param {ApiKeyRecord} record
   */
  _persist(record) {
    this._byHash.set(record.hashedSecret, record);
    this._byId.set(record.id, record);
  }

  /** @param {string} rawKey @returns {ApiKeyRecord|null} */
  findByRawKey(rawKey) {
    const hash = sha256(rawKey);
    return this._byHash.get(hash) ?? null;
  }

  /** @param {string} id @returns {ApiKeyRecord|null} */
  findById(id) {
    return this._byId.get(id) ?? null;
  }

  /** @returns {ApiKeyRecord[]} */
  listAll() {
    return [...this._byId.values()];
  }

  /**
   * Deactivate a key by its record ID.
   * @param {string} id
   * @returns {boolean}
   */
  revoke(id) {
    const r = this._byId.get(id);
    if (!r) return false;
    r.active = false;
    return true;
  }

  _createRecord({ name, scopes, rateLimitRpm, environment, expiresAt }) {
    const rawEntropy = crypto.randomBytes(24).toString("hex"); // 192 bits
    const rawKey     = `sk_${environment}_${rawEntropy}`;
    const prefix     = rawKey.substring(0, 14);
    const record = {
      id:            "key_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12),
      name:          name || "Unnamed Integration",
      prefix,
      hashedSecret:  sha256(rawKey),
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

  /**
   * Generate a new API key.
   *
   * @param {object} opts
   * @param {string}   opts.name
   * @param {string[]} opts.scopes
   * @param {number}   [opts.rateLimitRpm=60]
   * @param {"live"|"test"} [opts.environment="live"]
   * @param {Date|null}[opts.expiresAt]
   * @returns {{ rawKey: string, record: ApiKeyRecord }}
   */
  generate(opts) {
    return this._createRecord({
      environment: "live",
      ...opts,
    });
  }
}

/**
 * @param {string} data @returns {string} SHA-256 hex digest
 */
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * The complete, closed set of scopes this API understands. Validating against
 * an allow-list prevents typos ("note:read") from silently creating a key that
 * can never do anything — a classic integration-debugging black hole (Ch04).
 */
export const AVAILABLE_SCOPES = Object.freeze(["notes:read", "notes:write", "notes:delete"]);

export const API_KEY_ENVIRONMENTS = Object.freeze(["live", "test"]);

export const apiKeyVault = new ApiKeyVault();

// ──────────────────────────────────────────────────────────────────────────────
// ApiKeyService
// ──────────────────────────────────────────────────────────────────────────────
export class ApiKeyService {
  /**
   * Authenticate a raw API key from the incoming request.
   * Applies:
   *   1. Existence check
   *   2. Active / expiry check
   *   3. Fixed-window rate limit
   *
   * @param {string} rawKey
   * @returns {{ record: ApiKeyRecord, remaining: number, resetAfterMs: number }}
   * @throws {Error} with code property set to "INVALID_API_KEY" | "EXPIRED" | "RATE_LIMITED"
   */
  static authenticate(rawKey) {
    const record = apiKeyVault.findByRawKey(rawKey);

    if (!record || !record.active) {
      const e = new Error("Invalid or revoked API key");
      e.code  = "INVALID_API_KEY";
      throw e;
    }

    if (record.expiresAt && record.expiresAt < new Date()) {
      const e = new Error("API key has expired");
      e.code  = "EXPIRED";
      throw e;
    }

    // ── Fixed-window rate limiting ──────────────────────────────────────────
    const now = Date.now();
    if (now - record._windowStart >= 60_000) {
      // Reset window
      record._windowStart  = now;
      record._requestCount = 0;
    }
    record._requestCount++;
    record._lastUsedAt = now;

    if (record._requestCount > record.rateLimitRpm) {
      const resetAfterMs = 60_000 - (now - record._windowStart);
      const e = new Error(
        `Rate limit exceeded — max ${record.rateLimitRpm} req/min for this key`
      );
      e.code         = "RATE_LIMITED";
      e.retryAfter   = Math.max(1, Math.ceil(resetAfterMs / 1000));
      e.resetAfterMs = resetAfterMs;
      throw e;
    }

    const remaining   = record.rateLimitRpm - record._requestCount;
    const resetAfterMs = 60_000 - (now - record._windowStart);
    return { record, remaining, resetAfterMs };
  }

  /**
   * Assert that a record carries all required scopes.
   *
   * @param {ApiKeyRecord} record
   * @param {string[]}     requiredScopes
   * @throws {Error} code = "INSUFFICIENT_SCOPE"
   */
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

  /**
   * Generate and persist a new API key.  Returns the plaintext key
   * (shown to the caller exactly once) and the metadata record.
   */
  static generate(opts) {
    return apiKeyVault.generate(opts);
  }

  /** @param {string} id  Deactivate a key (admin revocation) */
  static revoke(id) {
    return apiKeyVault.revoke(id);
  }

  /** List metadata for all keys (never exposes hashedSecret or rawKey) */
  static listMetadata() {
    return apiKeyVault.listAll().map(({ hashedSecret, _windowStart, _requestCount, ...safe }) => safe);
  }
}
