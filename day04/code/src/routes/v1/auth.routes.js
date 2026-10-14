import { Router } from "express";
import * as authCtrl from "../../controllers/auth.controller.js";
import { authenticate } from "../../middlewares/authenticate.middleware.js";

/**
 * Auth routes — /api/v1/auth
 *
 * Chapter Ref: Ch01 (identity), Ch02 (cookies), Ch03 (token rotation),
 *              Ch07 (hashing), Ch08 (brute force & enumeration defences)
 *
 * Route classification by trust level:
 *   PUBLIC (credential-bearing)  : register, login, refresh, logout
 *   PROTECTED (Bearer required)  : me, sessions, logout-all
 *
 * NOTE: login responses carry no cache headers beyond the global no-store set in
 * security-headers.middleware.js — an authenticated response must never be cached.
 */
const router = Router();

// ── Public: credential exchange ───────────────────────────────────────────────
router.post("/register", authCtrl.register);
router.post("/login", authCtrl.login);
router.post("/refresh", authCtrl.refresh); // token lives in the HttpOnly cookie only
router.post("/logout", authCtrl.logout);   // idempotent; safe to call when expired

// ── Protected: session introspection & control ───────────────────────────────
router.get("/me", authenticate, authCtrl.me);
router.get("/sessions", authenticate, authCtrl.listSessions);
router.post("/logout-all", authenticate, authCtrl.logoutAll);

export default router;
