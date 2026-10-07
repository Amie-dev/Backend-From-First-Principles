import express from "express";
import { getPostsByUser, getSinglePostByUser } from "../../controllers/post.controller.js";

// CRITICAL: { mergeParams: true } enables child router to access parent req.params (:userId)
const router = express.Router({ mergeParams: true });

// Route: /api/v1/users/:userId/posts
router.get("/", getPostsByUser);

// Route: /api/v1/users/:userId/posts/:postId
router.get("/:postId", getSinglePostByUser);

export default router;
