# Implementation Guide - Chapter 11: Application Assembly & Complete Testing Playbook

## 1. Overview & Goal

In this final chapter, we assemble all components into the main Express application (`src/app.js`), start the HTTP server (`src/server.js`), and run through a complete `cURL` testing playbook covering all 11 Day 01 HTTP concepts.

---

## 2. Complete Source Code

### File 1: `src/app.js`

Create `day01/code/src/app.js`:

```javascript
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
```

---

### File 2: `src/server.js`

Create `day01/code/src/server.js`:

```javascript
import http from "http";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

// Create HTTP server instance
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`
===================================================================
🚀 Express Backend Server Running (ES Modules - Day 01)
===================================================================
📡 Server Address: http://localhost:${PORT}
🔐 Security Headers: Active (HSTS, CSP, X-Frame-Options)
🌐 CORS Preflight: Enabled for cross-origin requests
⚡ Caching & ETag: Active (Conditional 304 revalidation)
📦 Compression: Active (Gzip / Brotli negotiated)
🔑 Auth Mode: Stateless JWT (Bearer Authorization)
===================================================================
  `);
});
```

---

## 3. Complete Testing Playbook (`cURL`)

Run the main server:
```bash
npm start
```

### Test 1: Generate Stateless JWT Token
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "alice", "password": "password123"}'
```

### Test 2: Verify Security Headers & CORS Preflight (`OPTIONS`)
```bash
curl -v -X OPTIONS http://localhost:3000/api/v1/users \
     -H "Origin: https://myfrontend.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Authorization, Content-Type"
```

### Test 3: Test REST Verbs & Idempotency
```bash
# Export your token
TOKEN="<PASTE_YOUR_JWT_TOKEN_HERE>"

# GET Users
curl -v http://localhost:3000/api/v1/users -H "Authorization: Bearer $TOKEN"

# POST User (Non-Idempotent)
curl -v -X POST http://localhost:3000/api/v1/users \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "Charlie", "email": "charlie@example.com"}'

# PUT Replace User #1 (Idempotent)
curl -v -X PUT http://localhost:3000/api/v1/users/1 \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "Alice Updated", "email": "alice@example.com"}'

# DELETE User #1 (Idempotent 204 No Content)
curl -v -X DELETE http://localhost:3000/api/v1/users/1 \
     -H "Authorization: Bearer $TOKEN"
```

### Test 4: ETag Caching (`304 Not Modified`)
```bash
# Step 1: Fetch ETag
curl -v http://localhost:3000/api/v1/public

# Step 2: Test 304 Revalidation
curl -v http://localhost:3000/api/v1/public \
     -H 'If-None-Match: "<PASTE_ETAG_HASH>"'
```

### Test 5: Server-Sent Events (SSE Stream)
```bash
curl -N http://localhost:3000/api/v1/stream/events
```
