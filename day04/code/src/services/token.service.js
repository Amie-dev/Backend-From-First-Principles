import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config, logger } from "../config/env.js";
import { userStore } from "../db/user.store.js";

/**
 * TokenService — Hybrid Authentication: stateless JWT access tokens +
 *                 stateful, rotating refresh tokens with lineage tracking.
 *
 * Chapter Ref: Day04 Ch02 (JWT anatomy), Ch03 (stateful vs stateless vs hybrid,
 *              refresh-token rotation, token-family reuse detection),
 *              Ch08 (token theft / replay defence), Ch09 (audit trail).
 *
 * ─── The hybrid model, and why it wins ───────────────────────────────────────
 *   Access token  : 15-minute HS256 JWT. Verified with a local secret → ZERO
 *                   database lookups on the hot path, so it scales horizontally
 *                   by simply adding replicas.
 *   Refresh token : 7-day OPAQUE random id, stored server-side with its lineage.
 *                   It is the revocation lever the stateless JWT cannot provide:
 *                   logging out, or detecting a replay, kills the session within
 *                   one token lifetime (15 min worst case) instead of 7 days.
 *
 * ─── Refresh Token Rotation (RTR) + breach circuit breaker ───────────────────
 *   Every successful refresh consumes the presented token and mints a new one in
 *   the SAME family (`sid`). If a token that was already consumed shows up again,
 *   both the thief and the legitimate client now hold a copy — we cannot tell the
 *   attacker from the victim, so the ENTIRE family is revoked immediately and the
 *   user is forced to re-authenticate. This converts a silent, indefinite session
 *   hijack into a loud, bounded incident.
 */

// ─── Typed token errors (mapped to HTTP statuses by the auth controller) ──────
export class TokenError extends Error {
  /**
   * @param {"INVALID_REFRESH_TOKEN"|"REFRESH_TOKEN_EXPIRED"|"REFRESH_TOKEN_REUSE_DETECTED"|"ACCOUNT_DISABLED"} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "TokenError";
    this.code = code;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Refresh-token store (in-memory stand-in for Redis — swap the 4 methods below)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RefreshRecord
 * @property {string}  tokenId     - opaque 128-bit id (what the cookie carries)
 * @property {string}  familyId    - lineage id; a breach kills the whole family
 * @property {string}  userId
 * @property {string}  role        - role snapshot (re-verified on every rotation)
 * @property {boolean} revoked     - true once consumed, replayed, or logged out
 * @property {number}  createdAt   - unix ms
 * @property {number}  lastUsedAt  - unix ms (audit: detect stale sessions)
 * @property {number}  expiresAt   - unix ms
 */

class RefreshTokenStore {
  constructor() {
    /** @type {Map<string, RefreshRecord>} keyed by tokenId */
    this._store = new Map();
  }

  /**
   * Mint a new refresh record. Omitting `familyId` starts a brand-new family,
   * which is what a fresh login does.
   *
   * @param {string} userId
   * @param {string} role
   * @param {string} [familyId]
   * @param {{ ip?: string, userAgent?: string }} [context]
   * @returns {RefreshRecord}
   */
  create(userId, role, familyId, context = {}) {
    const now = Date.now();
    /** @type {RefreshRecord} */
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

  /**
   * @param {string} tokenId
   * @returns {RefreshRecord|null}
   */
  find(tokenId) {
    if (typeof tokenId !== "string" || tokenId.length === 0) return null;
    return this._store.get(tokenId) ?? null;
  }

  /** Consume (or hard-revoke) a single token. */
  revoke(tokenId) {
    const record = this._store.get(tokenId);
    if (record) record.revoked = true;
  }

  /**
   * BREACH CIRCUIT BREAKER — revoke every token descended from one login.
   * @param {string} familyId
   * @returns {number} number of sessions terminated
   */
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

  /**
   * Global sign-out / role change / deactivation: kill every session a user holds.
   * @param {string} userId
   * @returns {number}
   */
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

  /** @param {string} userId @returns {RefreshRecord[]} active sessions only */
  listActiveForUser(userId) {
    const now = Date.now();
    return [...this._store.values()].filter(
      (r) => r.userId === userId && !r.revoked && r.expiresAt > now
    );
  }

  /** Purge expired rows (a Redis TTL would do this for free). @returns {number} */
  prune() {
    const now = Date.now();
    let removed = 0;
    for (const [id, record] of this._store.entries()) {
      if (now > record.expiresAt) {
        this._store.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

export const refreshStore = new RefreshTokenStore();

// ──────────────────────────────────────────────────────────────────────────────
// TokenService
// ──────────────────────────────────────────────────────────────────────────────

/** Access-token lifetime in seconds (what the client puts in its refresh timer). */
export const ACCESS_TOKEN_TTL_SECONDS = Math.max(1, Math.floor(config.jwt.accessTtlMs / 1000));

export class TokenService {
  /**
   * Sign a short-lived stateless access token with HS256.
   *
   * Claim choices:
   *   sub  → user id (the only identity claim anything should trust)
   *   role → RBAC role, so the AuthZ gate needs no database read
   *   sid  → refresh-token family id, letting logs correlate a call to a session
   *   jti  → unique token id, ready for a future deny-list (Ch03)
   *   iss/aud → strongest defence against token confusion between services
   *
   * NOTE: no PII (email, name) and no permissions beyond `role` are embedded —
   * JWTs are signed, NOT encrypted, so anyone holding the token can read them.
   *
   * @param {{ id: string, role: string }} user
   * @param {string} [sessionId]  refresh-token family id
   * @returns {string}
   */
  static signAccessToken(user, sessionId) {
    return jwt.sign(
      {
        sub: user.id,
        role: user.role,
        ...(sessionId ? { sid: sessionId } : {}),
      },
      config.jwt.accessSecret,
      {
        algorithm: config.jwt.algorithm,
        expiresIn: config.jwt.accessTtl,
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
        jwtid: crypto.randomUUID(),
      }
    );
  }

  /**
   * Verify signature, expiry, issuer and audience.
   * The `algorithms` allow-list is mandatory: without it a library that trusts
   * the header can be tricked into accepting `alg: none` or RS256-with-HMAC-confusion.
   *
   * @param {string} token
   * @returns {{ sub: string, role: string, sid?: string, iat: number, exp: number, jti: string }}
   * @throws {jwt.TokenExpiredError|jwt.JsonWebTokenError}
   */
  static verifyAccessToken(token) {
    const claims = jwt.verify(token, config.jwt.accessSecret, {
      algorithms: [config.jwt.algorithm],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });

    if (typeof claims === "string" || !claims.sub) {
      throw new jwt.JsonWebTokenError("Malformed token payload");
    }
    return claims;
  }

  /**
   * Decode without verifying — ONLY for logging/telemetry. Never gate access on it.
   * @param {string} token
   * @returns {object|null}
   */
  static decodeUnsafe(token) {
    try {
      return jwt.decode(token);
    } catch {
      return null;
    }
  }

  /**
   * Issue an access + refresh pair for a fresh login (starts a new token family).
   *
   * @param {{ id: string, role: string }} user
   * @param {{ ip?: string, userAgent?: string }} [context]
   * @returns {{ accessToken: string, refreshTokenId: string, familyId: string, expiresIn: number }}
   */
  static issueTokenPair(user, context = {}) {
    const refresh = refreshStore.create(user.id, user.role, undefined, context);
    const accessToken = TokenService.signAccessToken(user, refresh.familyId);

    return {
      accessToken,
      refreshTokenId: refresh.tokenId,
      familyId: refresh.familyId,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /**
   * Refresh Token Rotation — the heart of the hybrid model.
   *
   * Steps and their security rationale:
   *   1. Unknown token            → reject (never existed, already pruned, or forged).
   *   2. Already-revoked token    → REPLAY. Kill the whole family (circuit breaker).
   *   3. Expired token            → reject and stop tracking it.
   *   4. Re-read the user from the database. This is the critical check that a
   *      purely stateless design cannot do: it makes role changes and account
   *      deactivations take effect at the next refresh instead of at the end of
   *      the refresh-token's 7-day life.
   *   5. Consume the old token and mint a new one in the same family.
   *
   * @param {string} presentedTokenId
   * @param {{ ip?: string, userAgent?: string }} [context]
   * @returns {{ accessToken: string, refreshTokenId: string, familyId: string, expiresIn: number }}
   * @throws {TokenError}
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

    // 4. Re-validate the principal against current state, not the token snapshot
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

  /**
   * Revoke one refresh token (logout of a single device).
   * @param {string} tokenId
   * @returns {boolean} whether a record was found
   */
  static revokeRefreshToken(tokenId) {
    const record = refreshStore.find(tokenId);
    if (!record) return false;
    refreshStore.revoke(tokenId);
    return true;
  }

  /**
   * Revoke every session for a user — "sign out everywhere", password reset,
   * role change, or admin deactivation (Ch03: revocation is why state exists).
   *
   * @param {string} userId
   * @returns {number} sessions terminated
   */
  static revokeAllSessionsForUser(userId) {
    const killed = refreshStore.revokeAllForUser(userId);
    if (killed > 0) {
      logger.warn("all sessions revoked", { userId, killed });
    }
    return killed;
  }

  /**
   * Active-session inventory for the account page ("where am I signed in?").
   * @param {string} userId
   * @returns {Array<{ tokenId: string, familyId: string, createdAt: number, lastUsedAt: number, expiresAt: number, ip: string|null, userAgent: string|null }>}
   */
  static listActiveSessions(userId) {
    return refreshStore.listActiveForUser(userId).map((r) => ({
      tokenId: r.tokenId,
      familyId: r.familyId,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      expiresAt: r.expiresAt,
      ip: r.ip,
      userAgent: r.userAgent,
    }));
  }
}


