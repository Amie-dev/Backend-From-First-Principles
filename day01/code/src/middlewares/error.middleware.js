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
