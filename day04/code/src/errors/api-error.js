/**
 * Centralized API Error Hierarchy
 * Chapter Ref: Day04 Ch08 - Threat Modeling (HTTP 401 vs 403 semantics)
 *
 * All domain errors extend APIError so the globalErrorHandler can
 * serialize them into a consistent JSON envelope without leaking
 * stack traces or internal context to the client.
 */

export class APIError extends Error {
  /**
   * @param {number} statusCode  - HTTP status code to return
   * @param {string} message     - Human-readable error description
   * @param {string} errorCode   - Machine-readable code for API consumers
   */
  constructor(statusCode, message, errorCode = "API_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 400 Bad Request
// ─────────────────────────────────────────────────────────────────────────────
export class BadRequestError extends APIError {
  constructor(message = "Bad request — invalid input or missing required fields") {
    super(400, message, "BAD_REQUEST");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 401 Unauthorized  ← "Unauthenticated" (credential is missing / invalid)
// Re: Day04 Ch08: Return 401 when the identity cannot be established.
// ─────────────────────────────────────────────────────────────────────────────
export class UnauthorizedError extends APIError {
  constructor(message = "Authentication credentials are missing or invalid") {
    super(401, message, "UNAUTHORIZED");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 403 Forbidden  ← "Authorized identity but insufficient permission"
// Re: Day04 Ch08: Return 403 when identity is known but access is denied.
// ─────────────────────────────────────────────────────────────────────────────
export class ForbiddenError extends APIError {
  constructor(message = "Forbidden — insufficient permissions for this operation") {
    super(403, message, "FORBIDDEN");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 404 Not Found
// ─────────────────────────────────────────────────────────────────────────────
export class NotFoundError extends APIError {
  constructor(message = "The requested resource was not found") {
    super(404, message, "NOT_FOUND");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 409 Conflict
// ─────────────────────────────────────────────────────────────────────────────
export class ConflictError extends APIError {
  constructor(message = "Resource conflict — duplicate entity or state collision") {
    super(409, message, "CONFLICT");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 429 Too Many Requests
// Re: Day04 Ch08: Rate limiting brute-force and credential stuffing attacks.
// ─────────────────────────────────────────────────────────────────────────────
export class TooManyRequestsError extends APIError {
  /**
   * @param {string} message
   * @param {number} retryAfterSeconds - Inform client when to retry
   */
  constructor(
    message = "Too many requests — rate limit exceeded",
    retryAfterSeconds = 60
  ) {
    super(429, message, "TOO_MANY_REQUESTS");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 500 Internal Server Error
// ─────────────────────────────────────────────────────────────────────────────
export class InternalServerError extends APIError {
  constructor(message = "An unexpected internal server error occurred") {
    super(500, message, "INTERNAL_SERVER_ERROR");
  }
}
