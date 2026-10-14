import crypto from "crypto";
import { config, logger } from "../config/env.js";

/**
 * Request Context & Audit Logging Middleware (Ch09 Stage 7)
 *
 * Chapter Ref: Day04 Ch09 — "Audit Logging & Safe Response Egress"
 *
 * Responsibilities:
 *  1. Assign a correlation id to every request (reuse an inbound, well-formed
 *     `X-Request-Id`, otherwise mint one) so a single logical call can be traced
 *     across logs, proxies, and downstream services.
 *  2. Echo it back in the response header so clients can quote it in bug reports.
 *  3. Emit ONE structured JSON access-log line per completed request containing
 *     who (principal / api key), what (method + route), the outcome (status),
 *     and how long it took (durationMs).
 *
 * What is deliberately NEVER logged:
 *   • request bodies (passwords, tokens)
 *   • the Authorization / Cookie / X-API-Key header values
 *   • full query strings (secrets end up in query strings far too often)
 */

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const QUIET_PATHS = new Set(["/health", "/favicon.ico"]);

/**
 * @param {import("express").Request} req
 * @returns {string}
 */
function resolveRequestId(req) {
  const inbound = req.headers["x-request-id"];
  if (typeof inbound === "string" && REQUEST_ID_PATTERN.test(inbound)) return inbound;

  // Fresh 128-bit id, human-scannable format: 8-4-4-4-12
  return crypto.randomUUID();
}

export function requestContextMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const requestId = resolveRequestId(req);

  req.id = requestId;
  req.startedAt = Date.now();
  res.setHeader(config.cors.requestIdHeader, requestId);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    const entry = {
      requestId,
      method: req.method,
      path: req.path,                 // query string intentionally dropped
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ip: req.ip,
      userId: req.principal?.sub ?? null,       // populated after AuthN
      apiKeyId: req.apiClient?.id ?? null,      // populated after M2M AuthN
      userAgent: req.headers["user-agent"] ?? null,
    };

    if (res.statusCode >= 500) {
      logger.error("request failed", entry);
    } else if (res.statusCode >= 400) {
      logger.warn("request rejected", entry);
    } else if (!QUIET_PATHS.has(req.path)) {
      logger.info("request completed", entry);
    }
  });

  next();
}

export default requestContextMiddleware;
