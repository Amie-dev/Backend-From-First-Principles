# Chapter 06: Catch-All Routes & Fallback Handlers

## 1. What is a Catch-All Route?

A **Catch-All Route** is a fallback handler registered on the server to intercept any request that fails to match any previously defined route path.

```http
GET /api/v1/unknown-endpoint
```

```
Request Received
       |
  Matches /api/v1/auth/login?  --> No
  Matches /api/v1/users?       --> No
  Matches /api/v1/products?    --> No
       |
       v
  Falls through to Catch-All (*)
       |
       v
  Returns HTTP 404 Not Found JSON
```

---

## 2. Route Matching Precedence

Express processes routes **in the exact order they are registered**.

```javascript
// 1. Specific routes registered first
app.get("/api/v1/users", handler1);
app.get("/api/v1/products", handler2);

// 2. Catch-all route registered LAST
app.use("*", catchAll404Handler);
```

> ⚠️ **Critical Rule**: If a catch-all route is placed at the top of your script, it will intercept **all** incoming requests before they ever reach your specific controllers! Catch-all routes must always be placed at the very end of the routing pipeline.

---

## 3. Benefits of a Structured Catch-All Handler

1. **User Experience & API Predictability**: Returns a clean, RFC-compliant JSON response (`404 Not Found`) instead of raw stack traces or default HTML error pages.
2. **Security**: Obfuscates internal server mechanics by returning a unified error envelope for invalid endpoints.
3. **Observability**: Allows logging of invalid route access attempts to detect broken links or scanning bots.

---

## 4. JavaScript Pseudocode: Express Catch-All Route Implementation

```javascript
// ==============================================================================
// JavaScript / Express Implementation of Catch-All Fallback Routes
// ==============================================================================

import express from "express";

const app = express();

// ------------------------------------------------------------------------------
// 1. SPECIFIC API ROUTES
// ------------------------------------------------------------------------------
app.get("/api/v1/status", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

app.get("/api/v1/users", (req, res) => {
  res.status(200).json({ users: [] });
});

// ------------------------------------------------------------------------------
// 2. CATCH-ALL WILDCARD ROUTE (MUST BE REGISTERED LAST)
// Wildcard '*' matches any method and any URL path
// ------------------------------------------------------------------------------
app.use("*", (req, res) => {
  console.warn(`[404 NOT FOUND] Unmatched request: ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `The requested endpoint '${req.method} ${req.originalUrl}' does not exist on this server.`,
      status: 404,
      timestamp: new Date().toISOString()
    }
  });
});
```

---

## 5. Key Takeaways

1. **Catch-All Routes** catch unmatched requests using wildcard syntax (`*`).
2. They must be placed **at the very end of the router pipeline** after all specific endpoints.
3. They provide a predictable, standardized **HTTP 404 JSON error response**.
