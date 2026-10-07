# Implementation Guide - Chapter 03: Stateless JWT Authentication Middleware

## 1. Overview & Goal

HTTP is inherently **stateless**. The server stores no memory of past requests. In this chapter, we implement stateless authentication using **JSON Web Tokens (JWT)**.

When a client logs in, the server signs a token containing the user's identity claims. On subsequent requests, the client passes this token in the `Authorization: Bearer <token>` header. The server verifies the token cryptographically on-the-fly without looking up session memory in RAM.

---

## 2. Terminal Test Commands

```bash
# 1. Login to generate stateless JWT token
curl -X POST http://localhost:3000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "alice", "password": "password123"}'

# Response yields: {"token": "eyJhbGciOiJIUzI1Ni..."}

# 2. Access protected endpoint with Bearer token
curl -v http://localhost:3000/api/v1/users \
     -H "Authorization: Bearer <TOKEN_HERE>"
```

---

## 3. Complete Source Code: `src/middlewares/auth.middleware.js`

Create `day01/code/src/middlewares/auth.middleware.js`:

```javascript
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
```

---

## 4. Deep Code Explanation

1. **`publicPaths` array**: Defines endpoints accessible without authentication (e.g. login endpoint, public health check, live event stream). If `req.path` matches, we immediately call `next()` to bypass verification.
2. **`req.headers["authorization"]`**: Extracts the Authorization request header. HTTP headers are case-insensitive; Express normalizes header keys to lowercase.
3. **`authHeader.startsWith("Bearer ")`**: Enforces the RFC 6750 standard prefix `Bearer ` followed by the raw base64-encoded JWT token string.
4. **`jwt.verify(token, JWT_SECRET)`**: Cryptographically validates the HMAC-SHA256 signature using the server's secret key.
   - If valid: Returns the decoded payload (`userId`, `role`).
   - If tampered or expired: Throws an exception which is converted to an HTTP 401 Unauthorized response.
5. **`req.user = decoded`**: Attaches the reconstructed stateless user identity directly to Express's request context object (`req`), making it available to downstream controller handlers.
