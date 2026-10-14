import { ApiKeyService } from "../services/api-key.service.js";
import { UnauthorizedError, ForbiddenError, TooManyRequestsError } from "../errors/api-error.js";

/**
 * authenticateApiKey — M2M API Key Authentication Middleware
 *
 * Chapter Ref: Day04 Ch04 — API Keys & Machine-to-Machine Authentication
 *
 * Accepts the raw API key via either:
 *   X-API-Key: sk_live_...          (preferred for M2M)
 *   Authorization: Bearer sk_live_... (alternative)
 *
 * On success attaches `req.apiClient` with the key record metadata.
 * The controller can then call `ApiKeyService.assertScopes()` to enforce
 * least-privilege scope requirements per endpoint.
 */
export function authenticateApiKey(req, res, next) {
  const rawKey =
    req.headers["x-api-key"] ||
    (req.headers["authorization"]?.startsWith("Bearer ")
      ? req.headers["authorization"].split(" ")[1]
      : null);

  if (!rawKey) {
    return next(
      new UnauthorizedError(
        "Missing API key — supply via X-API-Key header or Authorization: Bearer"
      )
    );
  }

  try {
    const { record, remaining, resetAfterMs } = ApiKeyService.authenticate(rawKey);
    req.apiClient = record;

    // Surface rate-limit metadata in response headers (transparency for integrators).
    // Reset is expressed as epoch seconds — the convention used by GitHub/Stripe.
    res.setHeader("X-RateLimit-Limit",     record.rateLimitRpm);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset",     Math.ceil((Date.now() + resetAfterMs) / 1000));

    next();
  } catch (err) {
    switch (err.code) {
      case "INVALID_API_KEY":
        return next(new UnauthorizedError(err.message));
      case "EXPIRED":
        return next(new UnauthorizedError(err.message));
      case "RATE_LIMITED":
        return next(new TooManyRequestsError(err.message, err.retryAfter ?? 60));
      default:
        return next(new UnauthorizedError("API key authentication failed"));
    }
  }
}

/**
 * requireScopes — Scope Authorization Middleware Factory for API Key routes
 *
 * Verifies that the authenticated API key has ALL the required scopes.
 *
 * @param {...string} requiredScopes
 */
export function requireScopes(...requiredScopes) {
  return function scopeGuard(req, res, next) {
    if (!req.apiClient) {
      return next(new UnauthorizedError("API client context missing — authenticateApiKey must run first"));
    }
    try {
      ApiKeyService.assertScopes(req.apiClient, requiredScopes);
      next();
    } catch (err) {
      return next(new ForbiddenError(err.message));
    }
  };
}
