import { APIError, TooManyRequestsError, UnauthorizedError } from "../errors/api-error.js";

/**
 * globalErrorHandler — Centralised Express 4-arity Error Middleware
 *
 * Chapter Ref: Day04 Ch08 — Safe Response Egress (never leak internals)
 *
 * Intercepts EVERY error passed via next(err) and serialises it into one
 * consistent JSON envelope:
 *
 *   { "error": { "code": "…", "message": "…", "status": N } }
 *
 * Production-safety guarantees:
 *  1. Only APIError subclasses may contribute their message. Anything else is
 *     logged internally and returned as a generic 500 — no stack traces, no SQL,
 *     no file paths, no password material ever reach the client (Ch09 Stage 7).
 *  2. 401 responses carry `WWW-Authenticate: Bearer` (RFC 6750) so standards-aware
 *     clients know which scheme to use.
 *  3. 429 responses carry `Retry-After` so well-behaved clients can back off
 *     instead of hammering the limiter (Ch08).
 */
export function globalErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // ─── Known API Errors ───────────────────────────────────────────────────
  if (err instanceof APIError) {
    // Surface Retry-After for rate-limit errors
    if (err instanceof TooManyRequestsError) {
      const retryAfterSeconds = err.retryAfterSeconds ?? 60;
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("X-RateLimit-Remaining", "0");
    }

    // RFC 6750: tell the client the expected authentication scheme
    if (err instanceof UnauthorizedError) {
      res.setHeader("WWW-Authenticate", `Bearer realm="${req.path}", error="invalid_token"`);
    }

    return res.status(err.statusCode).json({
      error: {
        code:    err.errorCode,
        message: err.message,
        status:  err.statusCode,
      },
    });
  }


  // ─── Malformed JSON Body (express.json SyntaxError) ──────────────────────
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: {
        code:    "INVALID_JSON",
        message: "Malformed JSON payload in request body",
        status:  400,
      },
    });
  }

  // ─── Unexpected Server Crash — log internally, return generic 500 ─────────
  console.error("[CRITICAL UNHANDLED ERROR]", {
    message: err.message,
    stack:   err.stack,
    path:    req.path,
    method:  req.method,
  });

  return res.status(500).json({
    error: {
      code:    "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred. Please try again later.",
      status:  500,
    },
  });
}
