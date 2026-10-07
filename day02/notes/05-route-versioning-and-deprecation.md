# Chapter 05: Route Versioning & Deprecation

## 1. Why API Versioning Matters

As web applications evolve, backend APIs require structural changes (e.g. changing field names, modifying payload schemas, or removing legacy properties).

If a backend directly modifies active production routes, mobile apps and frontend clients will break instantly. **Route Versioning** isolates API changes by maintaining multiple active versions concurrently.

```http
GET /api/v1/products   --> Legacy API format (Active)
GET /api/v2/products   --> New API format (V2 Release)
```

---

## 2. Managing Breaking Changes & Deprecation Windows

```
+-------------------------------------------------------------------------+
| Phase 1: V1 Active                                                      |
| All clients consume /api/v1/products                                    |
+-------------------------------------------------------------------------+
                                     |
                                     v (Release V2)
+-------------------------------------------------------------------------+
| Phase 2: Migration Window (Concurrent Support)                          |
| - New clients consume /api/v2/products                                  |
| - Legacy clients consume /api/v1/products + Warning Headers             |
+-------------------------------------------------------------------------+
                                     |
                                     v (Sunset Date Reached)
+-------------------------------------------------------------------------+
| Phase 3: V1 Deprecation                                                 |
| /api/v1/products returns 410 Gone / 404 Not Found                       |
+-------------------------------------------------------------------------+
```

---

## 3. Deprecation Headers Standard (RFC 8594)

To inform clients that a route version is scheduled for removal, servers send standardized HTTP headers:

* **`Deprecation: true`**: Signals that the endpoint is deprecated.
* **`Sunset: Wed, 11 Nov 2026 00:00:00 GMT`**: Defines the exact date when the route version will be disabled permanently.

---

## 4. JavaScript Pseudocode: Express API Versioning & Deprecation Warnings

```javascript
// ==============================================================================
// JavaScript / Express Implementation of Route Versioning & Deprecation
// ==============================================================================

import express from "express";

const app = express();

// ------------------------------------------------------------------------------
// 1. API VERSION 1 (DEPRECATED VERSION)
// ------------------------------------------------------------------------------
const v1Router = express.Router();

// Middleware adding Sunset & Deprecation headers to V1 endpoints
v1Router.use((req, res, next) => {
  res.setHeader("Deprecation", "true");
  res.setHeader("Sunset", "Wed, 11 Nov 2026 00:00:00 GMT");
  res.setHeader("Link", '<https://api.example.com/docs/v2-migration>; rel="deprecation"');
  next();
});

v1Router.get("/products", (req, res) => {
  // Legacy payload schema (e.g., product_name string)
  res.status(200).json({
    version: "v1",
    products: [{ id: 1, product_name: "Mechanical Keyboard", cost: 120 }]
  });
});

// ------------------------------------------------------------------------------
// 2. API VERSION 2 (CURRENT STABLE VERSION)
// ------------------------------------------------------------------------------
const v2Router = express.Router();

v2Router.get("/products", (req, res) => {
  // Modern payload schema (e.g., name string + currency object)
  res.status(200).json({
    version: "v2",
    products: [
      { id: 1, name: "Mechanical Keyboard", price: { amount: 120, currency: "USD" } }
    ]
  });
});

// Mount Version Routers onto distinct URL path prefixes
app.use("/api/v1", v1Router);
app.use("/api/v2", v2Router);
```

---

## 5. Key Takeaways

1. **Route Versioning** isolates breaking API schema changes across client applications.
2. Versions are typically embedded directly in the URI path (`/api/v1`, `/api/v2`).
3. Legacy routes should include **`Deprecation`** and **`Sunset`** headers to provide clients with a clear migration window before route retirement.
