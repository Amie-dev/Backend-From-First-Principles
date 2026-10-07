# Implementation Guide - Chapter 02: Static & Dynamic Path Parameters Routes

## 1. Overview & Goal

In this chapter, we implement static routes (`/api/v1/users/info`) and dynamic routes with **Path Parameters** (`/api/v1/users/:userId`).

Path parameters serve as primary entity identifiers in REST APIs, allowing clients to perform operations on specific resources.

---

## 2. Terminal Test Commands

```bash
# 1. Test Static Route
curl -v http://localhost:3000/api/v1/users/info

# 2. Test Dynamic Route with Path Parameter ID 2
curl -v http://localhost:3000/api/v1/users/2
```

---

## 3. Complete Source Code

### File 1: `src/controllers/user.controller.js`

```javascript
// Mock In-Memory User Database
const mockUsers = new Map([
  [1, { id: 1, name: "Alice Smith", email: "alice@example.com", role: "admin" }],
  [2, { id: 2, name: "Bob Jones", email: "bob@example.com", role: "developer" }],
  [3, { id: 3, name: "Charlie Brown", email: "charlie@example.com", role: "designer" }]
]);

/**
 * GET /api/v1/users (Static Route: Collection List)
 */
export function getAllUsers(req, res) {
  const users = Array.from(mockUsers.values());
  res.status(200).json({
    status: "success",
    routeType: "Static Collection Route",
    count: users.length,
    data: users
  });
}

/**
 * GET /api/v1/users/info (Static Route: Hardcoded System Info)
 */
export function getUserSystemInfo(req, res) {
  res.status(200).json({
    status: "success",
    routeType: "Static Metadata Route",
    info: "User Management Module v1.0.0",
    maxLimit: 100
  });
}

/**
 * GET /api/v1/users/:userId (Dynamic Route: Path Parameter Extraction)
 */
export function getUserById(req, res) {
  // Extract path parameter from req.params
  const { userId } = req.params;
  const numericId = parseInt(userId, 10);

  const user = mockUsers.get(numericId);

  if (!user) {
    return res.status(404).json({
      error: {
        code: "USER_NOT_FOUND",
        message: `User with ID '${userId}' was not found`,
        status: 404
      }
    });
  }

  res.status(200).json({
    status: "success",
    routeType: "Dynamic Route with Path Parameter (:userId)",
    extractedParams: req.params,
    data: user
  });
}
```

### File 2: `src/routes/v1/user.routes.js`

```javascript
import express from "express";
import { getAllUsers, getUserSystemInfo, getUserById } from "../../controllers/user.controller.js";
import postRouter from "./post.routes.js";

const router = express.Router();

// Static Routes
router.get("/info", getUserSystemInfo);
router.get("/", getAllUsers);

// Dynamic Route with Path Parameter
router.get("/:userId", getUserById);

// Mount Child Nested Router (/api/v1/users/:userId/posts)
router.use("/:userId/posts", postRouter);

export default router;
```

---

## 4. Deep Code Explanation

1. **Route Precedence Order**: In `user.routes.js`, the static route `GET /info` is registered **before** the dynamic route `GET /:userId`. If `GET /:userId` were registered first, Express would treat the string `"info"` as a dynamic `userId` parameter (`req.params.userId = "info"`). Specific static routes must always be declared before dynamic parameterized routes.
2. **`req.params.userId`**: Express automatically populates `req.params` with key-value pairs corresponding to colons in the route string (`/:userId`).
3. **`parseInt(userId, 10)`**: Path parameters arrive as strings over the network. We parse strings into numbers before querying databases or Map objects.
