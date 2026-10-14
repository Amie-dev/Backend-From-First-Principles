import { ApiKeyService, AVAILABLE_SCOPES, API_KEY_ENVIRONMENTS } from "../services/api-key.service.js";
import { config, logger } from "../config/env.js";
import { BadRequestError, NotFoundError } from "../errors/api-error.js";
import { noteStore } from "../db/note.store.js";

/**
 * ApiKey Controller — Key generation, listing, revocation
 *
 * Chapter Ref: Day04 Ch04 — API Keys & Machine-to-Machine Authentication
 *
 * POST /api/v1/admin/api-keys        — generate (admin only, requires 'apikeys:manage')
 * GET  /api/v1/admin/api-keys        — list metadata (admin only)
 * DELETE /api/v1/admin/api-keys/:id  — revoke (admin only)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT SECURITY CONTRACT:
 *   The raw API key is returned EXACTLY ONCE in the creation response.
 *   The response body will clearly state "Copy this now — it will not be shown again."
 *   The database (ApiKeyVault) stores only the SHA-256 hash of the raw key.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ── M2M Integration Demo ────────────────────────────────────────────────────
 * GET  /api/v1/integration/notes  — requires X-API-Key with scope "notes:read"
 */

// ─── Admin Key Management ─────────────────────────────────────────────────────

/**
 * POST /api/v1/admin/api-keys
 * Generates a new API key and returns the plaintext key ONCE.
 */
export function createApiKey(req, res, next) {
  try {
    const { name, scopes, rateLimitRpm, expiresAt, environment } = req.body ?? {};

    if (typeof name !== "string" || name.trim().length < 3) {
      throw new BadRequestError("'name' is required and must be at least 3 characters");
    }

    if (!Array.isArray(scopes) || scopes.length === 0) {
      throw new BadRequestError(`'scopes' must be a non-empty array — available: [${AVAILABLE_SCOPES.join(", ")}]`);
    }

    const unknownScopes = scopes.filter((s) => !AVAILABLE_SCOPES.includes(s));
    if (unknownScopes.length > 0) {
      throw new BadRequestError(
        `Unknown scope(s): [${unknownScopes.join(", ")}] — available: [${AVAILABLE_SCOPES.join(", ")}]`
      );
    }

    const env = environment ?? "live";
    if (!API_KEY_ENVIRONMENTS.includes(env)) {
      throw new BadRequestError(`'environment' must be one of [${API_KEY_ENVIRONMENTS.join(", ")}]`);
    }

    let expiresAtDate = null;
    if (expiresAt !== undefined && expiresAt !== null) {
      expiresAtDate = new Date(expiresAt);
      if (Number.isNaN(expiresAtDate.getTime())) {
        throw new BadRequestError("'expiresAt' must be a valid ISO-8601 date");
      }
      if (expiresAtDate <= new Date()) {
        throw new BadRequestError("'expiresAt' must be in the future");
      }
    }

    if (rateLimitRpm !== undefined && (!Number.isInteger(rateLimitRpm) || rateLimitRpm < 1)) {
      throw new BadRequestError("'rateLimitRpm' must be a positive integer");
    }

    const { rawKey, record } = ApiKeyService.generate({
      name: name.trim(),
      scopes,
      environment: env,
      rateLimitRpm: rateLimitRpm ?? config.apiKey.defaultRateLimitRpm,
      expiresAt: expiresAtDate,
    });

    // Audit trail: who minted which key, with which scopes (Ch09).
    logger.warn("api key created", {
      actorId: req.principal.sub,
      keyId: record.id,
      keyPrefix: record.prefix,
      scopes: record.scopes,
      environment: env,
    });

    // ⚠️  The raw key is shown here EXACTLY ONCE.  It is never stored.
    res.status(201).json({
      status:  "success",
      warning: "COPY THIS KEY NOW — it will never be shown again",
      data: {
        apiKey:  rawKey,
        keyMeta: {
          id:          record.id,
          name:        record.name,
          prefix:      record.prefix,
          scopes:      record.scopes,
          rateLimitRpm:record.rateLimitRpm,
          environment: env,
          createdAt:   record.createdAt,
          expiresAt:   record.expiresAt,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/admin/api-keys
 * List metadata for all API keys (never exposes hashed secrets or raw keys).
 */
export function listApiKeys(req, res, next) {
  try {
    const keys = ApiKeyService.listMetadata();
    res.status(200).json({ status: "success", count: keys.length, data: keys });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/admin/api-keys/:id
 * Revoke a key by its record ID.
 */
export function revokeApiKey(req, res, next) {
  try {
    const ok = ApiKeyService.revoke(req.params.id);
    if (!ok) throw new NotFoundError(`API key '${req.params.id}' not found`);

    logger.warn("api key revoked", { actorId: req.principal.sub, keyId: req.params.id });

    res.status(200).json({ status: "success", message: `Key '${req.params.id}' revoked` });
  } catch (err) {
    next(err);
  }
}

// ─── M2M Integration Endpoint ─────────────────────────────────────────────────

/**
 * GET /api/v1/integration/notes
 * Demonstrates M2M access: reads ALL notes from all tenants via API key.
 * Requires scope: "notes:read"
 * Protected by: authenticateApiKey + requireScopes("notes:read")
 */
export function integrationGetNotes(req, res, next) {
  try {
    // req.apiClient was attached by the authenticateApiKey middleware; the
    // requireScopes("notes:read") guard already ran, so cross-tenant visibility
    // is an explicitly granted privilege rather than an accident (Ch04 + Ch06).
    const allNotes = noteStore.listAll();

    const tenants = [...new Set(allNotes.map((n) => n.tenantId))];

    res.status(200).json({
      status: "success",
      source: "M2M API Key Integration",
      client: req.apiClient.name,
      scopes: req.apiClient.scopes,
      tenants,
      count:  allNotes.length,
      data:   allNotes,
    });
  } catch (err) {
    next(err);
  }
}
