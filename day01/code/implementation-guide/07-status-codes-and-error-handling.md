# Implementation Guide - Chapter 07: Status Codes & Global Error Handling

## 1. Overview & Goal

HTTP status codes inform clients about the outcome of requests (`2xx` success, `4xx` client error, `5xx` server crash).

In this chapter, we construct a custom API Exception hierarchy (`APIError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`) and a **Centralized Express Error Handling Middleware** that intercepts exceptions and serializes RFC-compliant JSON responses.

---

## 2. Terminal Test Commands

```bash
# 1. Trigger 404 Not Found
curl -v http://localhost:3000/api/v1/invalid-route

# 2. Trigger 401 Unauthorized (Missing Bearer Token)
curl -v http://localhost:3000/api/v1/users

# 3. Trigger 400 Bad Request (Missing JSON payload fields)
curl -v -X POST http://localhost:3000/api/v1/users \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{}'
```

---

## 3. Complete Source Code

### File 1: `src/errors/api-error.js`

```javascript
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
```

### File 2: `src/middlewares/error.middleware.js`

```javascript
import { APIError } from "../errors/api-error.js";

/**
 * Centralized Express Error Handling Middleware
 * Intercepts thrown API errors or unexpected server exceptions
 * and serializes them into standardized RFC-compliant HTTP JSON responses.
 */
export function globalErrorHandler(err, req, res, next) {
  // 1. Handle Known API Exceptions
  if (err instanceof APIError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.errorCode,
        message: err.message,
        status: err.statusCode
      }
    });
  }

  // 2. Handle Syntax Errors (e.g. malformed JSON body)
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Malformed JSON payload syntax in request body",
        status: 400
      }
    });
  }

  // 3. Handle Unexpected Server Crashes (500 Internal Server Error)
  console.error("[CRITICAL UNHANDLED SERVER EXCEPTION]", err);

  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred on the server.",
      status: 500
    }
  });
}
```

---

## 4. Deep Code Explanation

1. **`APIError extends Error`**: Base custom class extending JavaScript's built-in `Error`. Captures stack traces while binding custom numeric `statusCode` (e.g. 400, 401, 403, 404, 409).
2. **`Error.captureStackTrace(this, this.constructor)`**: Ensures V8 stack traces exclude internal constructor noise.
3. **Four-Parameter Express Error Middleware `(err, req, res, next)`**: Express identifies error handlers exclusively by having 4 arguments.
4. **`err instanceof APIError`**: Checks if the thrown error is part of our custom domain exception hierarchy. If true, extracts `err.statusCode` and outputs a clean, predictable JSON error object.
5. **Fallback `500 Internal Server Error`**: Catches unhandled runtime crashes (e.g. `TypeError`, database connection loss), logs the stack trace internally, and masks sensitive system details from external callers.
