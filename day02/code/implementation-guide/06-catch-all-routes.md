# Implementation Guide - Chapter 06: Catch-All Fallback & Express Server Assembly

## 1. Overview & Goal

In this chapter, we assemble the main Express application (`src/app.js`), register a **Catch-All Wildcard Route** (`app.use("*", ...)`), and launch the HTTP server (`src/server.js`).

Catch-all routes act as safety nets, intercepting unmatched request paths and returning structured RFC-compliant `404 Not Found` JSON envelopes instead of raw HTML error pages.

---

## 2. Terminal Test Commands

```bash
# 1. Start Express server
npm start

# 2. Test Catch-All Fallback on an unknown endpoint
curl -v http://localhost:3000/api/v1/invalid-route-name
```

---

## 3. Complete Source Code

### File 1: `src/app.js`

```javascript
import express from "express";
import v1Router from "./routes/v1/index.js";
import v2Router from "./routes/v2/index.js";

const app = express();

// Parse incoming request payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[HTTP Request] ${req.method} ${req.originalUrl}`);
  next();
});

// 1. Root Endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Day 02 Express Routing Architecture API Server",
    documentation: "/api/v1/users/info",
    activeVersions: ["v1", "v2"]
  });
});

// 2. Mount Version Routers
app.use("/api/v1", v1Router); // V1 Endpoints (Includes Sunset & Deprecation headers)
app.use("/api/v2", v2Router); // V2 Active Endpoints

// 3. Catch-All Wildcard Route (MUST BE REGISTERED LAST)
// Intercepts any unmatched HTTP request method and path
app.use("*", (req, res) => {
  console.warn(`[Catch-All 404 Handler] Unmatched Route: ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `The requested endpoint '${req.method} ${req.originalUrl}' does not exist on this server.`,
      status: 404,
      suggestedRoutes: [
        "GET /api/v1/users",
        "GET /api/v1/users/:userId",
        "GET /api/v1/users/:userId/posts/:postId",
        "GET /api/v1/search?query=val&category=backend",
        "GET /api/v2/products"
      ]
    }
  });
});

export default app;
```

### File 2: `src/server.js`

```javascript
import http from "http";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`
===================================================================
🚀 Express Routing Architecture Server Running (Day 02)
===================================================================
📡 Server Address: http://localhost:${PORT}
📍 Static Routes:  GET /api/v1/users/info
🎯 Dynamic Params: GET /api/v1/users/:userId
🔍 Query Params:   GET /api/v1/search?query=express&page=1&limit=5
🪆 Nested Routes:  GET /api/v1/users/:userId/posts/:postId
🏷️ API Versioning: GET /api/v1/... (Deprecated) vs GET /api/v2/products
🚫 Catch-All 404:  Active (Wildcard fallback envelope)
===================================================================
  `);
});
```

---

## 4. Deep Code Explanation

1. **`app.use("*", (req, res) => { ... })`**: The wildcard asterisk `*` matches **any** HTTP method and **any** URL path.
2. **Registration Precedence**: Because Express evaluates middleware sequentially, this route is placed at the **very bottom** of `app.js`. If a request matches `/api/v1/users`, it gets handled by `v1Router` and never falls through to `app.use("*")`. If no specific route matches, the request reaches the catch-all handler.
3. **Structured 404 Response**: Returning `{ error: { code: "NOT_FOUND", status: 404 } }` ensures frontends receive a clean JSON payload that can be parsed gracefully.
