/**
 * Centralized API Error Hierarchy for Standardized HTTP Status Code handling.
 */

export class APIError extends Error {
  constructor(statusCode, message, errorCode = "API_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends APIError {
  constructor(message = "Bad Request syntax or validation failure") {
    super(400, message, "BAD_REQUEST");
  }
}

export class UnauthorizedError extends APIError {
  constructor(message = "Authentication token missing or invalid") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends APIError {
  constructor(message = "Insufficient permissions for this resource") {
    super(403, message, "FORBIDDEN");
  }
}

export class NotFoundError extends APIError {
  constructor(message = "The requested resource URI was not found") {
    super(404, message, "NOT_FOUND");
  }
}

export class MethodNotAllowedError extends APIError {
  constructor(message = "HTTP Method not allowed for this route") {
    super(405, message, "METHOD_NOT_ALLOWED");
  }
}

export class ConflictError extends APIError {
  constructor(message = "Resource state conflict or duplicate entity") {
    super(409, message, "CONFLICT");
  }
}

export class TooManyRequestsError extends APIError {
  constructor(message = "Rate limit exceeded, try again later") {
    super(429, message, "TOO_MANY_REQUESTS");
  }
}
