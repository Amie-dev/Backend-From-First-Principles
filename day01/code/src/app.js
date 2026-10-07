import express from "express";
import { authenticateStateless, generateMockToken } from "./middlewares/auth.middleware.js";
import { securityHeadersMiddleware } from "./middlewares/security-headers.middleware.js";
import { createCorsMiddleware } from "./middlewares/cors.middleware.js";
import { etagCacheMiddleware } from "./middlewares/etag-cache.middleware.js";
import { compressionMiddleware } from "./middlewares/compression.middleware.js";
import { globalErrorHandler } from "./middlewares/error.middleware.js";

import * as userController from "./controllers/user.controller.js";
import * as streamController from "./controllers/stream.controller.js";

const app = express();

// 1. Global Pre-parsing Middlewares
app.use(securityHeadersMiddleware); // Chapter 04: Security headers (HSTS, CSP, Clickjacking)
app.use(createCorsMiddleware({ allowedOrigins: ["*"] })); // Chapter 06: CORS preflight & SOP bypass

// Parse body payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Global Performance Middlewares
app.use(compressionMiddleware); // Chapter 09: Content Negotiation (Gzip/Brotli)
app.use(etagCacheMiddleware); // Chapter 08: ETag calculation & 304 Not Modified conditional caching

// 3. Public Authentication Routes (Chapter 01 & Chapter 07)
app.post("/api/v1/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  // Generates stateless JWT token carrying identity claims
  const token = generateMockToken({ userId: 42, username, role: "admin" });

  res.status(200).json({
    status: "success",
    message: "Stateless JWT token generated successfully",
    token: token,
    tokenType: "Bearer"
  });
});

app.get("/api/v1/public", (req, res) => {
  res.status(200).json({ message: "Public endpoint accessible without authentication" });
});

// 4. Real-time Streaming Routes (Chapter 10)
app.post("/api/v1/stream/upload", streamController.streamUpload);
app.get("/api/v1/stream/events", streamController.streamEvents);

// 5. Authenticated REST API Routes (Chapter 01, 05, 07)
app.use(authenticateStateless); // Enforce stateless authentication for below routes

app.get("/api/v1/users", userController.getUsers);           // Safe & Idempotent
app.get("/api/v1/users/:id", userController.getUserById);     // Safe & Idempotent
app.post("/api/v1/users", userController.createUser);         // Unsafe & NON-IDEMPOTENT
app.put("/api/v1/users/:id", userController.replaceUser);     // Unsafe & IDEMPOTENT
app.patch("/api/v1/users/:id", userController.patchUser);     // Unsafe & Partial Update
app.delete("/api/v1/users/:id", userController.deleteUser);   // Unsafe & IDEMPOTENT

// 6. 404 Route Catch-All
app.use((req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `Cannot ${req.method} ${req.path}` } });
});

// 7. Centralized Error Handling Middleware (Chapter 07)
app.use(globalErrorHandler);

export default app;
