import { config } from "../config/env.js";
import { TokenService } from "../services/token.service.js";
import { userStore } from "../db/user.store.js";
import { UnauthorizedError } from "../errors/api-error.js";

/**
 * authenticate — Stateless JWT Access-Token Gate (AuthN, gate 1 of 2)
 *
 * Chapter Ref: Day04 Ch01 (dual gatekeeper), Ch02 (JWT verification),
 *              Ch03 (hybrid model: stateless hot path + revocable refresh token),
 *              Ch08 (token theft, privilege staleness)
 *
 * Pipeline position (Ch09 Stage 4):
 *   security headers → CORS → cookies → JSON parser → [ this gate ] → AuthZ gate
 *   → controller → store → error handler
 *
 * What this middleware does:
 *   1. Extracts `Authorization: Bearer <jwt>`.
 *   2. Verifies signature / expiry / issuer / audience via TokenService
 *      (HS256 allow-list, so `alg: none` and algorithm-confusion attacks die here).
 *   3. Optionally re-checks the account against the database
 *      (`ENFORCE_USER_STATUS_ON_REQUEST=true`, the default) which closes the one
 *      real gap of stateless tokens: a token minted before the account was
 *      deactivated or demoted would otherwise stay valid for its full lifetime.
 *   4. Publishes the verified principal on `req.principal`.
 *
 * It NEVER returns 403 — deciding whether the identity is *allowed* to do the
 * thing is the authorisation gate's job (see authorise.middleware.js).
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(
      new UnauthorizedError(
        "Missing or malformed Authorization header — expected: Bearer <access_token>"
      )
    );
  }

  const rawToken = authHeader.slice("Bearer ".length).trim();
  if (!rawToken) {
    return next(new UnauthorizedError("Empty bearer token supplied"));
  }

  let claims;
  try {
    claims = TokenService.verifyAccessToken(rawToken);
  } catch (err) {
    const message =
      err.name === "TokenExpiredError"
        ? "Access token has expired — call POST /api/v1/auth/refresh to renew it"
        : "Invalid access token";
    return next(new UnauthorizedError(message));
  }

  // ── Hot-path account re-validation (configurable, DB-read-per-request) ──────
  if (config.security.enforceUserStatusOnRequest) {
    const user = userStore.findById(claims.sub);

    if (!user || user.active === false) {
      return next(
        new UnauthorizedError("Account is no longer active — access token rejected")
      );
    }

    // The token embeds a role snapshot. If the account was re-roled since the
    // token was minted, the snapshot is stale privilege — force a refresh so the
    // client picks up the current grant (refresh re-reads the role from the DB).
    if (user.role !== claims.role) {
      return next(
        new UnauthorizedError("Your permissions changed — refresh your access token to continue")
      );
    }
  }

  /**
   * `req.principal` = authenticated identity context.
   * Shape: { sub, role, sid?, iat, exp, jti }
   */
  req.principal = claims;
  req.user = userStore.findById(claims.sub) ?? null; // convenience for controllers

  return next();
}

export default authenticate;

