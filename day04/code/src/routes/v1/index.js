import { Router } from "express";
import authRoutes from "./auth.routes.js";
import notesRoutes from "./notes.routes.js";
import adminRoutes from "./admin.routes.js";
import integrationRoutes from "./integration.routes.js";

/**
 * API v1 router — single mount point for the versioned surface
 *
 * Chapter Ref: Day02 Ch05 (URL versioning & deprecation) applied to auth.
 *
 * Why a version segment at all? Identity contracts are the hardest thing to
 * change later: token shapes, cookie names and error codes leak into every
 * client. `/api/v1` gives us the option to run v2 beside v1 for a migration
 * window instead of coordinating a flag-day rollout.
 */
const v1Router = Router();

v1Router.use("/auth", authRoutes);
v1Router.use("/notes", notesRoutes);
v1Router.use("/admin", adminRoutes);
v1Router.use("/integration", integrationRoutes);

export default v1Router;
