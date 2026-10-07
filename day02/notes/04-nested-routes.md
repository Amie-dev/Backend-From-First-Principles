# Chapter 04: Nested Routes & Hierarchical Resources

## 1. What are Nested Routes?

**Nested Routes** involve embedding parent and child resource identifiers within a single, continuous URL path structure to express **relational domain hierarchies**.

```http
GET /api/users/123/posts/456
```

```
Static Base:        /api/users
Parent Identifier:  /123            <-- User ID (Parent Entity)
Sub-Collection:     /posts
Child Identifier:   /456            <-- Post ID (Child Entity)
```

**Semantic Intent**: *"Fetch Post with ID 456 belonging to User with ID 123."*

---

## 2. Why Use Nested Routes in REST APIs?

1. **Clear Ownership Semantics**: Explicitly expresses that child resources belong to a specific parent resource.
2. **Encapsulated Scope**: Prevents ambiguous operations (e.g. updating a comment without specifying which post or user owns it).
3. **Natural Permission Checks**: Simplifies authorization checks in middleware to verify that the logged-in user owns the parent entity.

---

## 3. Route Hierarchy Decomposition

| Route Path | Meaning | Handled Action |
| :--- | :--- | :--- |
| `GET /users` | Top-level collection | List all users |
| `GET /users/:userId` | Top-level entity | Fetch single user |
| `GET /users/:userId/posts` | Nested sub-collection | List all posts created by `:userId` |
| `POST /users/:userId/posts` | Nested creation | Create a new post under `:userId` |
| `GET /users/:userId/posts/:postId` | Nested child entity | Fetch specific post `:postId` belonging to `:userId` |

---

## 4. JavaScript Pseudocode: Express Nested Routers (`mergeParams: true`)

```javascript
// ==============================================================================
// JavaScript / Express Implementation of Nested Routers with mergeParams
// ==============================================================================

import express from "express";

const app = express();

// 1. Child Router (Post Router)
// IMPORTANT: { mergeParams: true } allows child router to access parent req.params (:userId)
const postRouter = express.Router({ mergeParams: true });

// Route matches: /api/users/:userId/posts
postRouter.get("/", (req, res) => {
  const { userId } = req.params; // Parent parameter merged successfully!
  res.status(200).json({
    message: `Fetching all posts for User ${userId}`,
    userId: userId
  });
});

// Route matches: /api/users/:userId/posts/:postId
postRouter.get("/:postId", (req, res) => {
  const { userId, postId } = req.params;
  res.status(200).json({
    message: `Fetching Post ${postId} belonging to User ${userId}`,
    userId: userId,
    postId: postId
  });
});

// 2. Parent Router (User Router)
const userRouter = express.Router();

// Mount child router under parent path prefix
userRouter.use("/:userId/posts", postRouter);

// 3. Mount parent router on app
app.use("/api/users", userRouter);
```

---

## 5. Key Takeaways

1. **Nested Routes** model parent-child relationships in URL structures.
2. Express nested routers require **`express.Router({ mergeParams: true })`** so child route handlers can access parent parameters (like `:userId`).
3. Nested paths make APIs self-documenting and restfully compliant.
