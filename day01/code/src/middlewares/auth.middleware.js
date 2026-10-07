import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../errors/api-error.js";

export const JWT_SECRET = process.env.JWT_SECRET || "day01_first_principles_secret_key";

/**
 * Stateless Authentication Middleware
 * Reconstructs user identity state on-the-fly from incoming request headers
 * without requiring in-memory server session state.
 */
export function authenticateStateless(req, res, next) {
  // Public routes that bypass token verification
  const publicPaths = ["/api/v1/auth/login", "/api/v1/public", "/api/v1/stream/events"];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header (Expected: Bearer <token>)");
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify token signature & decode user context statelessly
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Attach identity to request context for downstream handlers
    next();
  } catch (err) {
    throw new UnauthorizedError("Invalid or expired JWT authentication token");
  }
}

/**
 * Helper to generate tokens for testing
 */
export function generateMockToken(userPayload) {
  return jwt.sign(userPayload, JWT_SECRET, { expiresIn: "1h" });
}
