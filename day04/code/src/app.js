import express from "express";
import { config } from "./config/env.js";

// Middlewares (pipeline stages)
import { requestContextMiddleware }  from "./middlewares/request-context.middleware.js";
import { securityHeadersMiddleware }  from "./middlewares/security-headers.middleware.js";
import { createCorsMiddleware }      from "./middlewares/cors.middleware.js";
import { cookieParserMiddleware }    from "./middlewares/cookies.middleware.js";
import { globalErrorHandler }        from "./middlewares/error.middleware.js";

// Routes
import v1Router from "./routes/v1/index.js";

// Controllers used directly by the app shell
import * as healthCtrl from "./controllers/health.controller.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Express application assembly — the "7-stage secure request pipeline"
 *  (Day 04 · Chapter 09)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Stage 1  Network boundary ...... trust-proxy + security headers          [↓]
 *  Stage 2  Abuse prevention ...... (per-route limits live in the auth ctrl) [↓]
 *  Stage 3  Input parsing ......... body size cap + JSON parse + cookies     [↓]
 *  Stage 4  Authentication ........ requirePermission → authenticate gates   [↓]
 *  Stage 5  Authorization ......... RBAC + scope + ownership (anti-BOLA)     [↓]
 *  Stage 6  Scoped business logic . controllers → stores (tenant-scoped)     [↓]
 *  Stage 7  Safe egress ........... audit log + one JSON error envelope      [↓]
 *
 * The middleware ORDER below is the security model. Moving `cookieParser` above
 * the body parser is harmless, but mounting a route before `authenticate` — or
 * forgetting `globalErrorHandler` last — silently removes a guarantee.
 */
const app = express();

// ─── Stage 1: platform & hardening ───────────────────────────────────────────

// Behind nginx/ALB the TCP peer is the proxy, not the client. Express must be told
// how many hops to trust, or every request shares one rate-limit bucket (the
// proxy's IP) and X-Forwarded-For becomes spoofable unless bounded.
app.set(
  "trust proxy",
  /^\d+$/.test(config.server.trustProxy) ? Number(config.server.trustProxy) : config.server.trustProxy
);

app.disable("x-powered-by"); // do not advertise the framework
app.set("etag", false);      // auth responses are no-store; weak ETags add nothing

// ─── Stage 2/7: correlation id + access/audit log (wraps everything below) ────
app.use(requestContextMiddleware);
app.use(securityHeadersMiddleware);

// ─── Stage 3: input parsing ──────────────────────────────────────────────────
// CORS runs before parsing: a preflight must be answered even for a body the
// server would reject, and browsers send no body with OPTIONS anyway.
app.use(createCorsMiddleware());
app.use(express.json({ limit: config.server.bodyLimit }));
app.use(express.urlencoded({ extended: false, limit: config.server.bodyLimit }));
app.use(cookieParserMiddleware);

// ─── Public shell routes ─────────────────────────────────────────────────────
app.get("/health", healthCtrl.health);
app.get("/api/v1/health", healthCtrl.health);

// ─── Stages 4-6: versioned API surface (gates live inside the routers) ───────
app.use("/api/v1", v1Router);

// ─── Stage 7a: catch-all 404 (never leaks whether a resource exists) ─────────
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Cannot ${req.method} ${req.path}`,
      status: 404,
      requestId: req.id,
    },
  });
});

// ─── Stage 7b: single error funnel (must be registered LAST) ─────────────────
app.use(globalErrorHandler);

export default app;
