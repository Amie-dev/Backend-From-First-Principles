import http from "http";
import app from "./app.js";
import { config, assertSecureConfiguration, describeConfiguration, logger } from "./config/env.js";
import { bootstrapData, startMaintenanceJobs, stopMaintenanceJobs } from "./bootstrap.js";

/**
 * Server entry point
 *
 * Chapter Ref: Ch09 — 12-Factor configuration, fail-fast validation, and graceful
 *              shutdown so in-flight authenticated requests are never severed.
 *
 * Boot order matters:
 *   1. assertSecureConfiguration() — refuse to start a production process with
 *      development defaults (a leaked dev JWT secret is a total auth bypass).
 *   2. bootstrapData()             — seed/verify the data layer (bcrypt hashing).
 *   3. startMaintenanceJobs()      — expire tokens & rate-limit buckets.
 *   4. listen()                    — only now accept traffic.
 */

async function main() {
  // ── 1. Fail-fast configuration validation ──────────────────────────────────
  assertSecureConfiguration();

  // ── 2. Data layer ──────────────────────────────────────────────────────────
  const seeded = await bootstrapData();

  // ── 3. Background housekeeping ─────────────────────────────────────────────
  const maintenanceTimer = startMaintenanceJobs();

  // ── 4. HTTP server ─────────────────────────────────────────────────────────
  const server = http.createServer(app);

  // Slowloris-style attacks hold sockets open forever; cap the idle window.
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 65_000; // > typical load-balancer idle timeout (60 s)

  server.listen(config.server.port, config.server.host, () => {
    printBanner(seeded);
    logger.info("server listening", {
      url: `http://${config.server.host}:${config.server.port}`,
      env: config.env,
      pid: process.pid,
    });
  });

  // ── 5. Graceful shutdown ───────────────────────────────────────────────────
  // SIGTERM is what Kubernetes/Docker send before SIGKILL: stop accepting new
  // connections, let in-flight requests finish, then exit. Without this, a deploy
  // can drop a request mid-login and leave the client without a refresh cookie.
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn("shutdown initiated", { signal });

    stopMaintenanceJobs(maintenanceTimer);

    const forceExit = setTimeout(() => {
      logger.error("graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close((err) => {
      clearTimeout(forceExit);
      if (err) {
        logger.error("error during shutdown", { message: err.message });
        process.exit(1);
      }
      logger.info("shutdown complete");
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));   // Ctrl-C
  process.on("SIGTERM", () => shutdown("SIGTERM")); // orchestrator

  // Never let an unexpected rejection kill the process silently: log it with
  // enough context to file a bug, and let the orchestrator decide on restarts.
  process.on("unhandledRejection", (reason) => {
    logger.error("unhandled promise rejection", { reason: String(reason) });
  });
  process.on("uncaughtException", (err) => {
    logger.error("uncaught exception — shutting down", { message: err.message, stack: err.stack });
    shutdown("uncaughtException");
  });
}

/**
 * @param {{ users: number, notes: number }} seeded
 */
function printBanner(seeded) {
  const snapshot = describeConfiguration();
  const line = "═".repeat(78);

  console.log(`
╔${line}╗
║  Day 04 — Authentication & Authorization API  ·  Express + JWT + bcrypt       ║
╠${line}╣
║  📡  Server          http://localhost:${snapshot.port}
║  🌍  Environment     ${snapshot.env}   ·   pid ${process.pid}
║  🔐  Access tokens   ${snapshot.accessTokenTtl} HS256 JWT (stateless)
║  🔄  Refresh tokens  ${snapshot.refreshTokenTtl} opaque + rotation + breach circuit breaker
║  🍪  Cookie          ${snapshot.cookie.name}  secure=${snapshot.cookie.secure}  sameSite=${snapshot.cookie.sameSite}  path=${snapshot.cookie.path}
║  🔒  Passwords       bcrypt cost ${snapshot.bcryptCost} (~250ms/hash) + timing equaliser
║  🌐  CORS            ${snapshot.cors.origins.join(", ")}  (credentials: ${snapshot.cors.credentials})
║  🗝️   API keys        sk_live_… SHA-256 hashed, scope + RPM limited
║  🧱  12-factor       secrets from .env · fail-fast production guards
╠${line}╣
║  SEEDED DEMO DATA   (${seeded.users} users · ${seeded.notes} notes)
║  ─────────────────────────────────────────────────────────────────────────
║  admin      aminul@example.com   SuperSecret#2024!
║  moderator  sarah@example.com    Moderate@Pass99
║  user       bob@example.com      User$Passw0rd
║  user       alice@example.com    Alice$Secure1
╠${line}╣
║  PUBLIC     POST /api/v1/auth/{register,login,refresh,logout}
║             GET  /health
║  AUTHN      GET  /api/v1/auth/{me,sessions}   POST /api/v1/auth/logout-all
║             GET|POST|PATCH|DELETE /api/v1/notes[/:id]
║  ADMIN      GET  /api/v1/admin/users[/:id]    PATCH /api/v1/admin/users/:id
║             GET  /api/v1/admin/notes/archived
║             POST|GET|DELETE /api/v1/admin/api-keys[/:id]
║  M2M        GET  /api/v1/integration/notes    (X-API-Key: sk_live_…)
╚${line}╝
`);
}

main().catch((err) => {
  logger.error("bootstrap failed — process exiting", { message: err.message, stack: err.stack });
  process.exit(1);
});
