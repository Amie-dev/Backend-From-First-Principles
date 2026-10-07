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
