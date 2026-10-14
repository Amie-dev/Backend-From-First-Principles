import bcrypt from "bcrypt";
import { config } from "../config/env.js";
import { BadRequestError } from "../errors/api-error.js";

/**
 * PasswordService — Adaptive Cryptographic Password Storage (bcrypt)
 *
 * Chapter Ref: Day04 Ch07 — "Password Hashing & Cryptographic Storage"
 *
 * ─── Why bcrypt and not SHA-256? ──────────────────────────────────────────────
 * SHA-256 is engineered to be FAST (billions of guesses/sec on a GPU cluster).
 * bcrypt is engineered to be SLOW and affordable to slow down further: its cost
 * factor is an exponent applied to key expansion, so cost 12 ≈ 4 096 rounds.
 * Each increment DOUBLES the attacker's cost while adding ~2× login latency —
 * that asymmetry (cheap to verify once, expensive to brute-force billions of
 * times) is the entire point of a password-hashing function.
 *
 * ─── Design decisions ────────────────────────────────────────────────────────
 * 1. Cost factor is read from env (`BCRYPT_COST`, default 12 ≈ 250 ms/hash) and
 *    can be raised as hardware improves. `needsRehash()` detects stored hashes
 *    that were created with an older, cheaper factor and lets the login flow
 *    transparently upgrade them ("hash migration on successful auth").
 * 2. bcrypt embeds a 128-bit CSPRNG salt INSIDE the hash string
 *    (`$2b$12$<22-char-salt><31-char-digest>`), so identical passwords produce
 *    different digests — rainbow tables and cross-user correlation are dead.
 * 3. The 72-BYTE INPUT LIMIT is a real bcrypt footgun: bytes beyond 72 are
 *    silently ignored, so "correct horse battery staple" + 100 chars of padding
 *    would authenticate with only the first 72 bytes considered. We therefore
 *    reject over-long passwords at the edge instead of truncating them.
 * 4. `bcrypt.compare` performs a constant-time digest comparison internally, so
 *    no timing side-channel is exposed by the comparison itself.
 * 5. `runDummyVerify()` burns the SAME cpu time when the account does not exist,
 *    so response latency cannot be used to enumerate valid emails (Ch08).
 */

/** Matches `$2a$`/`$2b$`/`$2y$` modular-crypt bcrypt records (60 chars). */
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * A tiny deny-list of passwords that satisfy complexity rules yet dominate every
 * credential-stuffing wordlist. In production, check against HaveIBeenPwned's
 * k-anonymity range API instead of maintaining this list by hand.
 */
const COMMON_PASSWORDS = new Set([
  "password1234",
  "password123!",
  "qwerty123456",
  "letmein12345",
  "welcome12345",
  "admin1234567",
  "iloveyou1234",
  "changeme1234",
]);

export class PasswordService {
  /** Effective work factor applied to new hashes. @returns {number} */
  static get costFactor() {
    return config.password.bcryptCost;
  }

  /**
   * Validate a candidate password against the configured policy.
   * Returns a list of human-readable violations (empty array === acceptable).
   *
   * @param {string} password
   * @returns {string[]}
   */
  static validate(password) {
    const violations = [];
    const policy = config.password;

    if (typeof password !== "string" || password.length === 0) {
      return ["password is required"];
    }

    // Length is measured in CHARACTERS for UX, but bcrypt's ceiling is BYTES.
    if (password.length < policy.minLength) {
      violations.push(`must be at least ${policy.minLength} characters long`);
    }

    const byteLength = Buffer.byteLength(password, "utf8");
    if (byteLength > policy.maxBytes) {
      violations.push(
        `must be at most ${policy.maxBytes} bytes when UTF-8 encoded (bcrypt silently truncates longer input)`
      );
    }

    if (password.includes("\0")) {
      violations.push("must not contain null bytes");
    }

    if (policy.requireComplexity) {
      const missing = [];
      if (!/[a-z]/.test(password)) missing.push("a lowercase letter");
      if (!/[A-Z]/.test(password)) missing.push("an uppercase letter");
      if (!/\d/.test(password)) missing.push("a digit");
      if (!/[^A-Za-z0-9]/.test(password)) missing.push("a symbol");
      if (missing.length > 0) violations.push(`must contain ${missing.join(", ")}`);
    }

    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      violations.push("is on the common-password deny-list — choose something unique");
    }

    return violations;
  }

  /**
   * Assert the policy, throwing a 400 for the first batch of violations.
   * @param {string} password
   * @throws {BadRequestError}
   */
  static assertAcceptable(password) {
    const violations = PasswordService.validate(password);
    if (violations.length > 0) {
      throw new BadRequestError(`Password rejected: ${violations.join("; ")}`);
    }
  }

  /**
   * Hash a plaintext password with bcrypt.
   *
   * @param  {string} plaintext
   * @returns {Promise<string>} 60-character modular crypt record
   *                            e.g. `$2b$12$N9qo8uLOickgx2ZMRZoMye...`
   */
  static async hash(plaintext) {
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      throw new TypeError("PasswordService.hash() expects a non-empty string");
    }
    return bcrypt.hash(plaintext, config.password.bcryptCost);
  }

  /**
   * Verify a candidate password against a stored bcrypt record in constant time.
   * Never throws for a bad password — only for a malformed stored record.
   *
   * @param  {string} candidate
   * @param  {string} storedHash
   * @returns {Promise<boolean>}
   */
  static async verify(candidate, storedHash) {
    if (typeof candidate !== "string" || typeof storedHash !== "string") return false;
    if (!BCRYPT_HASH_PATTERN.test(storedHash)) {
      throw new Error("Unrecognised password hash format — expected a bcrypt record");
    }
    // bcrypt.compare is internally constant-time and independent of hash length.
    return bcrypt.compare(candidate, storedHash);
  }

  /**
   * Has this hash been produced with a work factor below the current policy?
   * When true, the caller should re-hash the (just verified) plaintext and
   * persist the upgraded digest — a zero-downtime cost-factor migration.
   *
   * @param  {string} storedHash
   * @returns {boolean}
   */
  static needsRehash(storedHash) {
    if (typeof storedHash !== "string" || !BCRYPT_HASH_PATTERN.test(storedHash)) return true;
    try {
      return bcrypt.getRounds(storedHash) < config.password.bcryptCost;
    } catch {
      return true;
    }
  }

  /**
   * Timing equaliser (Ch08 — user-enumeration defence).
   *
   * When credentials are rejected, an attacker can measure response latency:
   *   • unknown email → "no row found" → returns in ~1 ms
   *   • known email   → bcrypt.compare runs → returns in ~250 ms
   * That 250 ms delta announces which accounts exist. Running a throwaway
   * bcrypt comparison against a fixed hash makes both paths cost the same.
   *
   * @param {string} candidate  whatever the client submitted
   */
  static async runDummyVerify(candidate) {
    const dummyHash = await PasswordService.#getDummyHash();
    try {
      await bcrypt.compare(typeof candidate === "string" ? candidate : "", dummyHash);
    } catch {
      // Never surface anything from the equaliser path.
    }
  }

  /** Lazily-built, memoised dummy digest (computed once per process). */
  static #dummyHash = null;

  static async #getDummyHash() {
    if (!PasswordService.#dummyHash) {
      PasswordService.#dummyHash = await bcrypt.hash(
        "DUMMY_GUARD_TIMING_EQUALISER",
        config.password.bcryptCost
      );
    }
    return PasswordService.#dummyHash;
  }
}

export default PasswordService;


