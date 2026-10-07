# Implementation Guide - Chapter 05: API Route Versioning & Sunset Headers

## 1. Overview & Goal

In this chapter, we implement **API Route Versioning** (`/api/v1` vs `/api/v2`) and inject standardized RFC 8594 **`Sunset`** and **`Deprecation`** headers.

Versioning isolates breaking schema changes so existing mobile and frontend clients continue working without interruption while migrating to newer API versions.

---

## 2. Terminal Test Commands

```bash
# 1. Test V1 Endpoint (Inspect output headers for Deprecation: true and Sunset)
curl -v http://localhost:3000/api/v1/users

# 2. Test V2 Endpoint (Modern active schema version)
curl -v http://localhost:3000/api/v2/products
```

---

## 3. Complete Source Code

### File 1: `src/routes/v1/index.js`

```javascript
import express from "express";
import userRouter from "./user.routes.js";
import searchRouter from "./search.routes.js";

const v1Router = express.Router();

// Middleware adding Sunset & Deprecation headers to all V1 endpoints
v1Router.use((req, res, next) => {
  res.setHeader("Deprecation", "true");
  res.setHeader("Sunset", "Wed, 11 Nov 2026 00:00:00 GMT");
  res.setHeader("Link", '<https://api.example.com/docs/v2-migration>; rel="deprecation"');
  next();
});

// Mount V1 Sub-Routers
v1Router.use("/users", userRouter);
v1Router.use("/search", searchRouter);

export default v1Router;
```

### File 2: `src/controllers/product.controller.js`

```javascript
/**
 * GET /api/v2/products (Version 2 API endpoint with updated schema)
 */
export function getV2Products(req, res) {
  res.status(200).json({
    status: "success",
    apiVersion: "v2 (Current Active Version)",
    schemaChanges: "Price transformed into structured currency object",
    data: [
      {
        id: 1,
        title: "Mechanical Keyboard Pro",
        price: { amount: 149.99, currency: "USD" },
        inStock: true
      },
      {
        id: 2,
        title: "UltraWide 34-inch Monitor",
        price: { amount: 699.00, currency: "USD" },
        inStock: false
      }
    ]
  });
}
```

### File 3: `src/routes/v2/index.js`

```javascript
import express from "express";
import { getV2Products } from "../../controllers/product.controller.js";

const v2Router = express.Router();

// Route: /api/v2/products
v2Router.get("/products", getV2Products);

export default v2Router;
```

---

## 4. Deep Code Explanation

1. **`Deprecation: true` Header**: Standardized HTTP header (RFC 8594) signaling to clients that the requested endpoint is deprecated and will eventually be retired.
2. **`Sunset: Wed, 11 Nov 2026 00:00:00 GMT`**: Specifies the exact timestamp when the API version will be permanently shut down.
3. **`Link: <...>; rel="deprecation"`**: Provides an explicit link to migration documentation for frontend developers.
4. **Router Isolation (`app.use("/api/v1", v1Router)` and `app.use("/api/v2", v2Router)`)**: Keeps version pipelines cleanly separated. V1 handles legacy requests while V2 serves modern schema payloads.
