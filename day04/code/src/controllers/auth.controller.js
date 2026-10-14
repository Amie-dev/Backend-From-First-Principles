import { config, logger } from "../config/env.js";
import { userStore } from "../db/user.store.js";
import { PasswordService } from "../services/password.service.js";
import { TokenService, TokenError } from "../services/token.service.js";
import {
  ipLoginLimiter,
  accountLoginLimiter,
  registerIpLimiter,
} from "../services/rate-limiter.service.js";
import {
  BadRequestError,
  UnauthorizedError,
  TooManyRequestsError,
  ConflictError,
} from "../errors/api-error.js";

/**
 * Auth Controller — register · login · refresh · logout · sessions · me
 *
 * Chapter Ref:
 *   Ch01 — dual gatekeeper (AuthN before AuthZ)
 *   Ch02 — cookies as hardened transport (HttpOnly/Secure/SameSite/Path)
 *   Ch03 — hybrid model + refresh-token rotation + breach detection
 *   Ch07 — bcrypt password storage, policy enforcement, hash upgrades
 *   Ch08 — brute force, credential stuffing, enumeration, timing attacks
 *   Ch09 — audit logging and safe response egress
 *
 * ─── Cookie design decisions ─────────────────────────────────────────────────
 *  HttpOnly : JavaScript cannot read it → a single XSS cannot exfiltrate the
 *             refresh token (the access token lives in SPA memory only).
 *  Secure   : HTTPS-only in production.
 *  SameSite : Strict by default → the cookie is not attached to cross-site
 *             requests, which removes CSRF for state-changing endpoints.
 *  Path     : scoped to /api/v1/auth so the credential is not transmitted with
 *             every unrelated API call (smaller attack surface, less traffic).
 *  Max-Age  : mirrors the server-side TTL so client and server cannot drift.
 */

const REFRESH_COOKIE = config.cookie.name;

/**
 * @param {import("express").Request} req
 * @returns {{ ip: string, userAgent: string|null }} audit context for a session
 */
function clientContext(req) {
  return {
    ip: req.ip ?? null,
    userAgent: (req.headers["user-agent"] ?? null)?.slice(0, 255) ?? null,
  };
}

/**
 * Cookie attributes, resolved once per request so that an inconsistent
 * COOKIE_SAMESITE=none + COOKIE_SECURE=false combination degrades to `lax`
 * instead of making Express throw a runtime error on every login.
 * @returns {import("express").CookieOptions}
 */
function refreshCookieOptions() {
  const secure = config.cookie.secure;
  const sameSite =
    config.cookie.sameSite === "none" && !secure ? "lax" : config.cookie.sameSite;

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: config.cookie.path,
    domain: config.cookie.domain,
    maxAge: config.cookie.maxAgeMs,
  };
}

/**
 * @param {import("express").Response} res
 * @param {string} refreshTokenId opaque 128-bit session id
 */
function setRefreshCookie(res, refreshTokenId) {
  res.cookie(REFRESH_COOKIE, refreshTokenId, refreshCookieOptions());
}

/** Clears the cookie with the SAME attributes it was set with (RFC 6265). */
function clearRefreshCookie(res) {
  const { maxAge, ...attrs } = refreshCookieOptions(); // eslint-disable-line no-unused-vars
  res.clearCookie(REFRESH_COOKIE, attrs);
}

/**
 * Publishes transparent throttling metadata so legitimate clients can back off
 * BEFORE they get blocked (Ch08 — cooperative rate limiting).
 *
 * @param {import("express").Response} res
 * @param {{ remaining: number, retryAfterMs: number }} result
 * @param {number} limit
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
 * per-account gate (catches targeted attacks). Returns null when both allow.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {string} emailKey normalised email used as the account bucket key
 * @returns {TooManyRequestsError|null}
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

/** Pragmatic RFC-5322-lite check — full RFC compliance belongs in a mail library. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/register
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Creates an account with a bcrypt-hashed password.
 *
 * Security notes:
 *  • The `role` field is IGNORED on purpose — accepting it would let anyone
 *    self-register as `admin` (mass-assignment / privilege-escalation). Roles are
 *    only granted by an admin through PATCH /api/v1/admin/users/:id.
 *  • No session is issued here; the client must log in. That keeps the
 *    registration endpoint free of credential-stuffing value.
 *  • The response never echoes the password or its hash.
 */
export async function register(req, res, next) {
  try {
    const throttle = registerIpLimiter.attempt(`ip:${req.ip}`);
    if (!throttle.allowed) {
      return next(
        new TooManyRequestsError(
          "Too many accounts created from this network — try again later",
          Math.ceil(throttle.retryAfterMs / 1000)
        )
      );
    }

    const { email, username, password } = req.body ?? {};

    if (typeof email !== "string" || typeof username !== "string" || typeof password !== "string") {
      throw new BadRequestError("email, username and password are required (all strings)");
    }

    const normalisedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalisedEmail)) {
      throw new BadRequestError("A valid email address is required");
    }

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 40) {
      throw new BadRequestError("username must be between 3 and 40 characters");
    }

    // Password policy lives in the service so every entry point agrees (Ch07)
    PasswordService.assertAcceptable(password);

    if (userStore.findByEmail(normalisedEmail)) {
      // NOTE: this reveals account existence. Trade-off: better UX at registration
      // vs. zero enumeration. Public APIs with sensitive user bases should return
      // a generic 202 + "check your email" flow instead.
      throw new ConflictError("An account with that email already exists");
    }

    // Deliberately expensive: ~250 ms of bcrypt. Rate limiting above stops abuse.
    const passwordHash = await PasswordService.hash(password);

    const user = userStore.create({
      email: normalisedEmail,
      username: cleanUsername,
      passwordHash,
      role: "user",
      tenantId: "tenant_alpha",
    });

    logger.info("account registered", { userId: user.id, email: user.email });

    res.status(201)
      .setHeader("Location", `/api/v1/admin/users/${user.id}`)
      .json({
        status: "success",
        message: "Account created — sign in to receive an access token",
        data: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
  } catch (err) {
    next(err);
  }
}


// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/login
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Authenticates credentials and issues the hybrid token pair.
 *
 * Defence stack, applied in order (Ch08):
 *   1. IP rate limit      — 20 attempts/min  → defeats distributed spraying
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
      await PasswordService.runDummyVerify(password); // burn the same ~250 ms
      logger.warn("login failed", { reason: "unknown_account", email: emailKey, ip: req.ip });
      throw new UnauthorizedError("Invalid email or password");
    }

    const passwordOk = await PasswordService.verify(password, user.passwordHash);
    if (!passwordOk) {
      logger.warn("login failed", { reason: "bad_password", userId: user.id, ip: req.ip });
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.active === false) {
      // Checked AFTER password verification so a disabled account cannot be
      // enumerated without valid credentials.
      throw new UnauthorizedError("This account has been deactivated — contact an administrator");
    }

    // ── Ch07: transparent cost-factor migration ──────────────────────────────
    // The plaintext is available only at this exact moment, so this is the only
    // point where an old, cheaper bcrypt digest can be upgraded to the current one.
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
    setRefreshCookie(res, refreshTokenId);

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
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          tenantId: user.tenantId,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}


// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/refresh
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Rotates the refresh token and mints a new access token.
 *
 * The client only ever sends the HttpOnly cookie, so a successful call also
 * proves the browser still holds the credential — and because the old token is
 * consumed, a replay attack is loud rather than silent (Ch03).
 */
export function refresh(req, res, next) {
  const presented = req.cookies?.[REFRESH_COOKIE];

  try {
    if (!presented) {
      clearRefreshCookie(res);
      throw new UnauthorizedError("Refresh token missing — sign in again");
    }

    const rotated = TokenService.rotateTokenPair(presented, clientContext(req));
    setRefreshCookie(res, rotated.refreshTokenId);

    res.status(200).json({
      status: "success",
      message: "Access token renewed (refresh token rotated)",
      data: {
        accessToken: rotated.accessToken,
        tokenType: "Bearer",
        expiresIn: rotated.expiresIn,
      },
    });
  } catch (err) {
    clearRefreshCookie(res); // never let the client retry with a dead credential

    if (err instanceof TokenError) {
      logger.warn("refresh rejected", { code: err.code, ip: req.ip });
      return next(
        new UnauthorizedError(
          err.code === "REFRESH_TOKEN_REUSE_DETECTED"
            ? `${err.message}. If this was not you, your credentials may be compromised — sign in again.`
            : err.message
        )
      );
    }
    return next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/logout      (revokes the presented session)
// POST /api/v1/auth/logout-all  (requires a valid access token)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Ends the current session by revoking the refresh token server-side.
 * Stateless access tokens cannot be un-issued, which is precisely why the
 * access-token TTL is short (15 min) — the blast radius of a leaked token is
 * bounded by its lifetime, and the refresh path is the revocation lever.
 */
export function logout(req, res, next) {
  try {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (presented) TokenService.revokeRefreshToken(presented);
    clearRefreshCookie(res);

    logger.info("logout", { userId: req.principal?.sub ?? null, ip: req.ip });

    res.status(200).json({ status: "success", message: "Signed out — session revoked" });
  } catch (err) {
    next(err);
  }
}

/**
 * "Sign out everywhere" — revokes every refresh family for the authenticated
 * user. Use this after a suspicious login alert or a password change.
 */
export function logoutAll(req, res, next) {
  try {
    const revoked = TokenService.revokeAllSessionsForUser(req.principal.sub);
    clearRefreshCookie(res);

    res.status(200).json({
      status: "success",
      message: `Signed out of ${revoked} session(s) on all devices`,
      data: { revokedSessions: revoked },
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/sessions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Lists the caller's active sessions (account-security page: "where am I
 * signed in?"). Session ids are MASKED — they are bearer credentials, and the
 * response may end up in logs, screenshots, or analytics pipelines.
 */
export function listSessions(req, res, next) {
  try {
    const sessions = TokenService.listActiveSessions(req.principal.sub).map((s) => ({
      id: `${s.tokenId.slice(0, 8)}…`,
      current: s.familyId === req.principal.sid,
      createdAt: new Date(s.createdAt).toISOString(),
      lastUsedAt: new Date(s.lastUsedAt).toISOString(),
      expiresAt: new Date(s.expiresAt).toISOString(),
      ip: s.ip,
      userAgent: s.userAgent,
    }));

    res.status(200).json({ status: "success", count: sessions.length, data: sessions });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/me   (requires authenticate)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Identity of the caller, resolved from the verified JWT plus the live record.
 * `req.user` is populated by the authenticate middleware (single store read).
 */
export function me(req, res, next) {
  try {
    const user = req.user ?? userStore.findById(req.principal.sub);
    if (!user) throw new UnauthorizedError("User account no longer exists");

    res.status(200).json({
      status: "success",
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
        sessionId: req.principal.sid ?? null, // refresh family this call belongs to
        tokenIssuedAt: new Date(req.principal.iat * 1000).toISOString(),
        tokenExpiresAt: new Date(req.principal.exp * 1000).toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

