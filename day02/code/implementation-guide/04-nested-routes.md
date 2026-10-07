# Implementation Guide - Chapter 04: Nested Routes & Relational Hierarchies

## 1. Overview & Goal

In this chapter, we implement **Nested Routes** to represent parent-child relational entities in REST APIs (`/users/:userId/posts/:postId`).

We configure Express's `{ mergeParams: true }` option so child routers can access parameters defined in parent routers.

---

## 2. Terminal Test Commands

```bash
# 1. Fetch sub-collection of posts belonging to User 1
curl -v http://localhost:3000/api/v1/users/1/posts

# 2. Fetch specific child entity (Post 102 belonging to User 1)
curl -v http://localhost:3000/api/v1/users/1/posts/102
```

---

## 3. Complete Source Code

### File 1: `src/controllers/post.controller.js`

```javascript
// Mock In-Memory Posts Database mapped by userId
const mockPosts = new Map([
  [1, [
    { id: 101, title: "Understanding REST Routing", content: "Routing maps HTTP method and URI to code handlers." },
    { id: 102, title: "Mastering Node.js Streams", content: "Streams save memory during large file transfers." }
  ]],
  [2, [
    { id: 201, title: "Building Scalable Architecture", content: "Decouple services to achieve fault tolerance." }
  ]]
]);

/**
 * GET /api/v1/users/:userId/posts (Nested Route: Sub-collection List)
 */
export function getPostsByUser(req, res) {
  // Access parent parameter merged from parent router
  const { userId } = req.params;
  const numericUserId = parseInt(userId, 10);

  const posts = mockPosts.get(numericUserId) || [];

  res.status(200).json({
    status: "success",
    routeType: "Nested Sub-Collection Route (/users/:userId/posts)",
    parentUserId: userId,
    count: posts.length,
    data: posts
  });
}

/**
 * GET /api/v1/users/:userId/posts/:postId (Nested Route: Child Entity Lookup)
 */
export function getSinglePostByUser(req, res) {
  const { userId, postId } = req.params;
  const numericUserId = parseInt(userId, 10);
  const numericPostId = parseInt(postId, 10);

  const userPosts = mockPosts.get(numericUserId) || [];
  const post = userPosts.find((p) => p.id === numericPostId);

  if (!post) {
    return res.status(404).json({
      error: {
        code: "POST_NOT_FOUND",
        message: `Post ${postId} for User ${userId} was not found`,
        status: 404
      }
    });
  }

  res.status(200).json({
    status: "success",
    routeType: "Nested Child Entity Route (/users/:userId/posts/:postId)",
    extractedParams: { userId, postId },
    data: post
  });
}
```

### File 2: `src/routes/v1/post.routes.js`

```javascript
import express from "express";
import { getPostsByUser, getSinglePostByUser } from "../../controllers/post.controller.js";

// CRITICAL: { mergeParams: true } enables child router to access parent req.params (:userId)
const router = express.Router({ mergeParams: true });

// Route: /api/v1/users/:userId/posts
router.get("/", getPostsByUser);

// Route: /api/v1/users/:userId/posts/:postId
router.get("/:postId", getSinglePostByUser);

export default router;
```

---

## 4. Deep Code Explanation

1. **`express.Router({ mergeParams: true })`**: By default in Express, parameter dictionaries are scoped locally to individual router instances. Enabling `mergeParams: true` forces Express to inherit parameter values from parent routers (`user.routes.js`). Without this flag, `req.params.userId` inside `post.controller.js` would evaluate to `undefined`.
2. **Mounting Nested Routers**: In `user.routes.js`, we mount `postRouter` using `userRouter.use("/:userId/posts", postRouter)`. Express automatically prepends `/:userId/posts` to all routes inside `post.routes.js`.
3. **Domain Ownership Verification**: Reading both `:userId` and `:postId` allows the controller to verify that Post 102 is actually owned by User 1 before returning data.
