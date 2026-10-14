import { Router } from "express";
import * as apiKeyCtrl from "../../controllers/api-key.controller.js";
import { authenticateApiKey, requireScopes } from "../../middlewares/api-key-auth.middleware.js";

/**
 * Integration (M2M) routes — /api/v1/integration
 *
 * Chapter Ref: Ch04 — API keys and machine-to-machine authentication
 *
 * Deliberately a SEPARATE pipeline from the user-facing one:
 *   • credentials arrive as `X-API-Key: sk_live_…`, not a Bearer JWT — a stolen
 *     user token can therefore never be replayed against a machine route,
 *     and vice versa (credential-domain separation);
 *   • no cookies are involved, so CSRF is structurally impossible here;
 *   • access is narrowed by an explicit scope check rather than a role.
 */
const router = Router();

router.get(
  "/notes",
  authenticateApiKey,
  requireScopes("notes:read"),
  apiKeyCtrl.integrationGetNotes
);

export default router;
