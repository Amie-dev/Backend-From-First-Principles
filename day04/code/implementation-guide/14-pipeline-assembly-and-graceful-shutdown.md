# Implementation Guide 14: Pipeline Assembly, Routing & Graceful Shutdown

## 1. Goal & First-Principles Context

Everything built so far is a component; this guide wires them into a **running service** and
covers the two operational behaviours that distinguish a demo from something deployable:

* **assembly** — the middleware order *is* the security model (Ch09's seven stages);
* **lifecycle** — boot validation, idempotent seeding, background maintenance, and a graceful
  shutdown that never drops an authenticated request mid-flight.

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `src/app.js` | the Express pipeline (stages ①–⑦) + trust proxy + 404 + error funnel |
| `src/routes/v1/index.js` | mounts auth · notes · admin · integration under `/api/v1` |
| `src/bootstrap.js` | seeded data + maintenance timers (used by both server and tests) |
| `src/server.js` | boot order, timeouts, banner, signal handling |

---

## 3. Source: `src/app.js`

```javascript
import express from "express";
import { config } from "./config/env.js";

import { requestContextMiddleware }  from "./middlewares/request-context.middleware.js";
import { securityHeadersMiddleware }  from "./middlewares/security-headers.middleware.js";
import { createCorsMiddleware }      from "./middlewares/cors.middleware.js";
import { cookieParserMiddleware }    from "./middlewares/cookies.middleware.js";
import { globalErrorHandler }        from "./middlewares/error.middleware.js";

import v1Router from "./routes/v1/index.js";
import * as healthCtrl from "./controllers/health.controller.js";

/**
 *  Stage 1  Network boundary ...... trust-proxy + security headers          [↓]
 *  Stage 2  Abuse prevention ...... (per-route limits live in the auth ctrl) [↓]
 *  Stage 3  Input parsing ......... body size cap + JSON parse + cookies     [↓]
 *  Stage 4  Authentication ........ authenticate gate (JWT)                  [↓]
 *  Stage 5  Authorization ......... RBAC + scope + ownership (anti-BOLA)     [↓]
 *  Stage 6  Scoped business logic . controllers → stores (tenant-scoped)     [↓]
 *  Stage 7  Safe egress ........... audit log + one JSON error envelope      [↓]
 */
const app = express();

// ─── Stage 1: platform & hardening ───────────────────────────────────────────
app.set(
  "trust proxy",
  /^\d+$/.test(config.server.trustProxy) ? Number(config.server.trustProxy) : config.server.trustProxy
);
app.disable("x-powered-by");
app.set("etag", false);          // auth responses are no-store; weak ETags add nothing

// ─── Stage 2/7: correlation id + access/audit log (wraps everything below) ───
app.use(requestContextMiddleware);
app.use(securityHeadersMiddleware);

// ─── Stage 3: input parsing ──────────────────────────────────────────────────
app.use(createCorsMiddleware());
app.use(express.json({ limit: config.server.bodyLimit }));
app.use(express.urlencoded({ extended: false, limit: config.server.bodyLimit }));
app.use(cookieParserMiddleware);

// ─── Public shell routes ─────────────────────────────────────────────────────
app.get("/health", healthCtrl.health);
app.get("/api/v1/health", healthCtrl.health);

// ─── Stages 4-6: versioned API surface (gates live inside the routers) ───────
app.use("/api/v1", v1Router);

// ─── Stage 7a: catch-all 404 ─────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `Cannot ${req.method} ${req.path}`, status: 404, requestId: req.id },
  });
});

// ─── Stage 7b: single error funnel (must be registered LAST) ─────────────────
app.use(globalErrorHandler);

export default app;
```

### Deep explanation

1. **The stage comments are load-bearing.** A future contributor moving `cookieParserMiddleware`
   above `securityHeadersMiddleware` is harmless; moving a route above `requestContextMiddleware`
   or the error handler away from last is not. Writing the *reason* next to the order is how the
   order survives refactoring.
2. **`trust proxy` parsing handles both forms** — `1` (hop count) for nginx/ALB, `loopback`/`true`
   for other topologies. Without it, `req.ip` is the proxy's address, so rate limiting degrades to
   one global bucket and audit logs point at the load balancer.
3. **`app.set("etag", false)`** — every response is `no-store`; computing weak ETags for
   credentials-bearing JSON is pure waste (and invites conditional-request bugs).
4. **CORS before body parsing** — a preflight carries no body and must be answered even for a
   payload the server would reject.
5. **Body parsers before the cookie parser** is not strictly required, but keeping "parse the
   request, then read the identity" ordered top-down mirrors the mental model, and both run before
   any authentication.
6. **`express.json({ limit })`** — the size cap is a DoS control evaluated while streaming, so an
   oversized payload is rejected before it is fully buffered.
7. **Health lives outside `/api/v1`** (and is mirrored inside it) so probes do not depend on the
   API version and stay valid across a v2 migration.
8. **The 404 handler is an ordinary middleware, not an error** — it runs only if nothing matched,
   and it returns the same envelope shape as every other failure, with the request id included so
   a user screenshot is traceable.

---

## 4. Source: Versioned Routing

```javascript
// src/routes/v1/index.js
import { Router } from "express";
import authRoutes from "./auth.routes.js";
import notesRoutes from "./notes.routes.js";
import adminRoutes from "./admin.routes.js";
import integrationRoutes from "./integration.routes.js";

const v1Router = Router();

v1Router.use("/auth", authRoutes);
v1Router.use("/notes", notesRoutes);
v1Router.use("/admin", adminRoutes);
v1Router.use("/integration", integrationRoutes);

export default v1Router;
```

```javascript
// src/routes/v1/auth.routes.js
const router = Router();

// ── Public: credential exchange ──────────────────────────────────────────────
router.post("/register", authCtrl.register);
router.post("/login",    authCtrl.login);
router.post("/refresh",  authCtrl.refresh);   // token lives in the HttpOnly cookie only
router.post("/logout",   authCtrl.logout);    // idempotent; safe to call when already expired

// ── Protected: session introspection & control ───────────────────────────────
router.get("/me",         authenticate, authCtrl.me);
router.get("/sessions",   authenticate, authCtrl.listSessions);
router.post("/logout-all", authenticate, authCtrl.logoutAll);
```

### Deep explanation

1. **One router per resource, one mount point per version.** `app.js` knows exactly one prefix
   (`/api/v1`); adding v2 later means adding a sibling folder, not editing every route.
2. **Why a version segment in an auth API?** Identity contracts (token shapes, cookie names,
   error codes) leak into every client. `/api/v1` buys the option to run v2 beside v1 during a
   migration window instead of coordinating a flag-day rollout.
3. **Public vs. protected is visually obvious in the route file** — the `authenticate` middleware
   appears inline, so "is this endpoint protected?" is answered by reading, not by grepping.
4. **Route files contain no logic.** They compose middleware and handlers, which keeps the
   security posture of each endpoint reviewable in a few lines (Guides 09–11).
5. **`/refresh` and `/logout` are deliberately public** (cookie-gated, not token-gated): a client
   whose access token has expired must still be able to refresh and log out — otherwise every
   session ends in a dead end.

---

## 5. Source: `src/bootstrap.js` (seeding + maintenance)

```javascript
import { config, logger } from "./config/env.js";
import { seedUsers, userStore } from "./db/user.store.js";
import { seedNotes } from "./db/note.store.js";
import { refreshStore } from "./services/token.service.js";
import { allLimiters } from "./services/rate-limiter.service.js";

/** Seeds demo data. Idempotent: `node --watch` restarts never duplicate records. */
export async function bootstrapData() {
  const users = await seedUsers();

  let notes = 0;
  if (config.seedDemoData) {
    const aminul = userStore.findByEmail("aminul@example.com");
    const bob    = userStore.findByEmail("bob@example.com");
    const alice  = userStore.findByEmail("alice@example.com");

    if (!aminul || !bob || !alice) {
      throw new Error("Demo user seeding failed — cannot seed notes without owners");
    }
    notes = seedNotes(aminul.id, bob.id, alice.id);
  } else {
    logger.info("demo note seeding skipped", { reason: "SEED_DEMO_DATA=false" });
  }

  return { users, notes };
}

/** Periodic housekeeping — the in-memory stand-in for Redis TTLs and cron jobs. */
export function startMaintenanceJobs() {
  const timer = setInterval(() => {
    const prunedTokens = refreshStore.prune();
    for (const limiter of allLimiters) limiter.prune();
    if (prunedTokens > 0) logger.info("maintenance sweep", { prunedRefreshTokens: prunedTokens });
  }, 10 * 60 * 1000);

  timer.unref();     // never hold the event loop open just for housekeeping
  return timer;
}

export function stopMaintenanceJobs(timer) {
  if (timer) clearInterval(timer);
}
```

### Deep explanation

1. **Separated from `server.js` on purpose.** Tests call `bootstrapData()` to build the same world
   (users, notes) **without binding a TCP port** — that is the difference between an integration
   test you trust and one that pokes at globals.
2. **Idempotence is a requirement, not a nicety.** `seedUsers()` skips existing emails and
   `seedNotes()` returns 0 if any note exists, so `npm run dev`'s watcher can restart freely.
3. **The failure path is explicit**: if the demo users are missing, seeding notes throws rather
   than creating orphaned rows referencing `undefined` owners.
4. **`timer.unref()`** means the maintenance timer does not keep the process alive — critical for
   clean shutdown and for test runners that would otherwise hang after the suite finishes.
5. **Every prunable store is registered in one list** (`allLimiters` + `refreshStore`), so adding
   a new limiter means adding it to one place instead of hunting for the cron job.

---

## 6. Source: `src/server.js` (boot order & graceful shutdown)

```javascript
import http from "http";
import app from "./app.js";
import { config, assertSecureConfiguration, describeConfiguration, logger } from "./config/env.js";
import { bootstrapData, startMaintenanceJobs, stopMaintenanceJobs } from "./bootstrap.js";

async function main() {
  // ── 1. Fail-fast configuration validation ──────────────────────────────────
  assertSecureConfiguration();

  // ── 2. Data layer (bcrypt-hashed demo users, idempotent) ───────────────────
  const seeded = await bootstrapData();

  // ── 3. Background housekeeping ─────────────────────────────────────────────
  const maintenanceTimer = startMaintenanceJobs();

  // ── 4. HTTP server ─────────────────────────────────────────────────────────
  const server = http.createServer(app);

  // Slowloris-style attacks hold sockets open forever; cap the idle window.
  server.headersTimeout   = 20_000;
  server.requestTimeout   = 30_000;
  server.keepAliveTimeout = 65_000;   // > typical LB idle timeout (60 s)

  server.listen(config.server.port, config.server.host, () => {
    printBanner(seeded);
    logger.info("server listening", {
      url: `http://${config.server.host}:${config.server.port}`,
      env: config.env, pid: process.pid,
    });
  });

  // ── 5. Graceful shutdown ───────────────────────────────────────────────────
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;              // SIGINT twice must not double-close
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
      if (err) { logger.error("error during shutdown", { message: err.message }); process.exit(1); }
      logger.info("shutdown complete");
      process.exit(0);
    });
  };

  process.on("SIGINT",  () => shutdown("SIGINT"));    // Ctrl-C
  process.on("SIGTERM", () => shutdown("SIGTERM"));   // orchestrator (docker/k8s)

  process.on("unhandledRejection", (reason) => {
    logger.error("unhandled promise rejection", { reason: String(reason) });
  });
  process.on("uncaughtException", (err) => {
    logger.error("uncaught exception — shutting down", { message: err.message, stack: err.stack });
    shutdown("uncaughtException");
  });
}

main().catch((err) => {
  logger.error("bootstrap failed — process exiting", { message: err.message, stack: err.stack });
  process.exit(1);
});
```

### Deep explanation

1. **Boot order is deliberate:** validate configuration → prepare data → start housekeeping →
   listen. Traffic is only accepted once the service can actually satisfy it; a bad config or a
   failed seed exits *before* a load balancer considers the instance healthy.
2. **`server.headersTimeout` / `requestTimeout`** bound slowloris attacks, where a client opens
   many connections and drips headers forever. Node's defaults are permissive; a JSON API has no
   legitimate reason to hold a socket for 30 seconds.
3. **`keepAliveTimeout = 65s` > the load balancer's typical 60 s idle timeout.** This is the
   classic race where the client reuses a connection that the LB has just closed, producing
   sporadic 502s under load. Keeping the server's window slightly longer removes it.
4. **`shuttingDown` guard** makes repeated signals idempotent — otherwise a second `Ctrl-C` closes
   an already-closing server and can crash on an in-flight request.
5. **`forceExit` timer** guarantees the process cannot hang forever if a connection never drains;
   ten seconds is generous for a stateless JSON API.
6. **`server.close()` stops accepting new connections and waits for in-flight requests**, then
   exits. This is what prevents a deploy from severing a login mid-response and leaving a client
   without its refresh cookie.
7. **`unhandledRejection` logs and keeps running**, while `uncaughtException` logs and shuts down —
   an argument can be made both ways, but silently dying on a rejected promise is strictly worse
   than a loud log line.
8. **The banner is generated from `describeConfiguration()`**, so the operator sees the *actual*
   environment, bcrypt cost, token TTLs, cookie flags and CORS allow-list — the fastest way to
   catch a container that deployed with the wrong `.env`.

---

## 7. Verification

### 7.1 Start the server and read the boot banner

```bash
npm start
```

```text
╔══════════════════════════════════════════════════════════════════════════════╗
║  Day 04 — Authentication & Authorization API  ·  Express + JWT + bcrypt       ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  📡  Server          http://localhost:4000
║  🌍  Environment     development   ·   pid 43770
║  🔐  Access tokens   900s HS256 JWT (stateless)
║  🔄  Refresh tokens  604800s opaque + rotation + breach circuit breaker
║  🍪  Cookie          refreshToken  secure=false  sameSite=strict  path=/api/v1/auth
║  🔒  Passwords       bcrypt cost 12 (~250ms/hash) + timing equaliser
║  🌐  CORS            http://localhost:3000, http://localhost:5173  (credentials: true)
║  🗝️   API keys        sk_live_… SHA-256 hashed, scope + RPM limited
║  🧱  12-factor       secrets from .env · fail-fast production guards
╠══════════════════════════════════════════════════════════════════════════════╣
║  SEEDED DEMO DATA   (4 users · 4 notes)
```

Before the banner you will also see the data-layer log lines, which prove bcrypt ran:

```text
[DB] Seeded 4 demo users (bcrypt cost 12)
[DB] Seeded 4 demo notes
```

### 7.2 The pipeline answers as designed

```bash
BASE=http://localhost:4000

curl -s -o /dev/null -w 'health              → %{http_code}\n'  $BASE/health
curl -s -o /dev/null -w 'login (valid)       → %{http_code}\n'  -X POST $BASE/api/v1/auth/login \
  -H 'content-type: application/json' -d '{"email":"bob@example.com","password":"User$Passw0rd"}'
curl -s -o /dev/null -w 'notes (no token)    → %{http_code}\n'  $BASE/api/v1/notes
curl -s -o /dev/null -w 'unknown route       → %{http_code}\n'  $BASE/api/v1/does-not-exist
curl -s -o /dev/null -w 'M2M (no key)        → %{http_code}\n'  $BASE/api/v1/integration/notes
```

```text
health              → 200
login (valid)       → 200
notes (no token)    → 401
unknown route       → 404
M2M (no key)        → 401
```

### 7.3 Graceful shutdown drains instead of dropping

```bash
npm start > /tmp/day04-shutdown.log 2>&1 &
SRV=$!
sleep 3

# Start a slow request, then send SIGTERM while it is in flight
curl -s $BASE/health -o /dev/null &
kill -TERM $SRV

sleep 1
cat /tmp/day04-shutdown.log | tail -3
```

```json
{"ts":"…","level":"warn","message":"shutdown initiated","signal":"SIGTERM"}
{"ts":"…","level":"info","message":"shutdown complete"}
```

The in-flight request completes; the socket stops accepting new connections; the process exits 0.

### 7.4 `--watch` restart does not duplicate seed data

```bash
npm run dev &          # watcher
sleep 3
touch src/config/env.js    # force a reload
sleep 3
grep -c 'Seeded 4 demo users' /tmp/<logfile>   # still 1 per boot, and the store is not duplicated
```

Idempotent seeding is what makes this safe: `seedUsers()` skips existing emails and `seedNotes()`
returns early when notes already exist.

### 7.5 The suite (which uses `bootstrap.js`, not the port-binding server)

```bash
npm test
# ℹ tests 38
# ℹ pass 38
# ℹ fail 0
```

Because `bootstrapData()` is importable independently, the tests build the same world on an
ephemeral port and never collide with a locally running `npm start`.

---

## 8. Why This Matters

* **Middleware order is the security model.** The stage comments are not documentation cosmetics —
  they are the only reliable way to keep the order correct through refactors and merges.
* **Boot order determines failure modes.** Validating config and seeding *before* `listen()` means
  a broken deployment never becomes "healthy" and never receives a single request.
* **Graceful shutdown protects users, not just metrics.** A killed process mid-login leaves a
  client authenticated on the server but holding no cookie — a state that produces "the app is
  broken" reports for days.
* **Timeouts are part of the attack surface.** Slowloris and connection-reuse races are solved by
  three integers that cost nothing and are invisible until they are missing.
* **One process, one identity.** The banner, the health endpoint and the logs all read from the
  same frozen config, so "what is actually running?" always has exactly one answer.



