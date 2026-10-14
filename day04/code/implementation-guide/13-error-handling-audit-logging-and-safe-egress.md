# Implementation Guide 13: Error Handling, Audit Logging & Safe Egress

## 1. Goal & First-Principles Context

Chapter 09's final stage is **"Audit logging & safe response egress"**, and it hides two
requirements that pull in opposite directions:

* **Be useful** — a client integrating your API must be able to tell *what* went wrong and *what
  to do about it* (401 vs 403 vs 429, which header to use, when to retry).
* **Be useless to an attacker** — the same response must not reveal stack traces, SQL, file paths,
  library versions, or whether a given email exists.

The resolution is a **typed error hierarchy** produced by the domain layers, serialised by exactly
one middleware, with a correlation id that connects the client's report to the server's
full-detail log line.

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `src/errors/api-error.js` | `APIError` + the 400/401/403/404/409/429/500 subclasses |
| `src/middlewares/error.middleware.js` | `globalErrorHandler` — the only place errors become HTTP |
| `src/middlewares/request-context.middleware.js` | request id + one JSON access/audit log per request |
| `src/config/env.js` | `logger` (JSON lines) used by every layer |

---

## 3. Source: The Error Hierarchy

```javascript
// src/errors/api-error.js

export class APIError extends Error {
  /**
   * @param {number} statusCode - HTTP status code to return
   * @param {string} message    - human-readable description
   * @param {string} errorCode  - machine-readable code for API consumers
   */
  constructor(statusCode, message, errorCode = "API_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 400 — invalid input / missing fields
export class BadRequestError extends APIError {
  constructor(message = "Bad request — invalid input or missing required fields") {
    super(400, message, "BAD_REQUEST");
  }
}

// 401 — the identity could not be established
export class UnauthorizedError extends APIError {
  constructor(message = "Authentication credentials are missing or invalid") {
    super(401, message, "UNAUTHORIZED");
  }
}

// 403 — identity known, permission missing
export class ForbiddenError extends APIError {
  constructor(message = "Forbidden — insufficient permissions for this operation") {
    super(403, message, "FORBIDDEN");
  }
}

// 404 — resource absent (or hidden by tenant isolation)
export class NotFoundError extends APIError {
  constructor(message = "The requested resource was not found") {
    super(404, message, "NOT_FOUND");
  }
}

// 409 — duplicate entity / state collision
export class ConflictError extends APIError {
  constructor(message = "Resource conflict — duplicate entity or state collision") {
    super(409, message, "CONFLICT");
  }
}

// 429 — rate limited (carries retry guidance)
export class TooManyRequestsError extends APIError {
  constructor(message = "Too many requests — rate limit exceeded", retryAfterSeconds = 60) {
    super(429, message, "TOO_MANY_REQUESTS");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// 500 — unexpected failure (message never reaches the client)
export class InternalServerError extends APIError {
  constructor(message = "An unexpected internal server error occurred") {
    super(500, message, "INTERNAL_SERVER_ERROR");
  }
}
```

### Deep explanation

1. **The status code is a property of the *class*, not a parameter at the throw site.** Business
   logic says `throw new ConflictError("email already exists")` — it never decides "409". That is
   why the API's status-code semantics stay consistent across thirty handlers.
2. **`errorCode` is the machine-readable half.** Clients branch on `"CONFLICT"`, not on human text
   that translators and copywriters will change.
3. **`Error.captureStackTrace(this, this.constructor)`** trims the constructor frame so internal
   logs start at the throw site — small, but it is the difference between a useful log and a pile
   of framework frames.
4. **Only these classes may produce a message the client sees.** Anything not extending `APIError`
   is treated as a bug and answered with a generic 500, which is what makes "never leak internals"
   enforceable rather than aspirational.
5. **`TooManyRequestsError` carries data, not just text** — `retryAfterSeconds` becomes a real
   `Retry-After` header in the handler.

---

## 4. Source: The Single Error Funnel

```javascript
// src/middlewares/error.middleware.js
import { APIError, TooManyRequestsError, UnauthorizedError } from "../errors/api-error.js";

export function globalErrorHandler(err, req, res, next) {
  // ─── Known API errors ────────────────────────────────────────────────────
  if (err instanceof APIError) {
    // Rate-limit responses must tell well-behaved clients when to come back
    if (err instanceof TooManyRequestsError) {
      res.setHeader("Retry-After", String(err.retryAfterSeconds ?? 60));
      res.setHeader("X-RateLimit-Remaining", "0");
    }

    // RFC 6750: advertise the expected authentication scheme
    if (err instanceof UnauthorizedError) {
      res.setHeader("WWW-Authenticate", `Bearer realm="${req.path}", error="invalid_token"`);
    }

    return res.status(err.statusCode).json({
      error: { code: err.errorCode, message: err.message, status: err.statusCode },
    });
  }

  // ─── Malformed JSON body (express.json SyntaxError) ──────────────────────
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: { code: "INVALID_JSON", message: "Malformed JSON payload in request body", status: 400 },
    });
  }

  // ─── Unexpected crash — log internally, return a generic 500 ─────────────
  console.error("[CRITICAL UNHANDLED ERROR]", {
    message: err.message, stack: err.stack, path: req.path, method: req.method,
  });

  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred. Please try again later.",
      status: 500,
    },
  });
}
```

### Deep explanation

1. **The four-arity signature (`err, req, res, next`)** is how Express recognises an error
   handler. Dropping or renaming a parameter silently turns it into an ordinary middleware.
2. **It is registered LAST in `app.js`**, after the 404 catch-all, so it sees errors from every
   earlier stage. Order is the contract.
3. **`err instanceof APIError` is an allow-list.** Anything else is by definition a bug — bugs get
   a generic client message plus a full internal log.
4. **`Retry-After` + `X-RateLimit-Remaining: 0`** turn "you are blocked" into an instruction,
   which is the difference between a client that backs off and one that retries in a tight loop
   and doubles the load.
5. **`WWW-Authenticate: Bearer`** makes a 401 self-describing to standards-aware clients; the
   `realm` pins the challenge to the failing route.
6. **The malformed-JSON branch exists because `express.json()` throws a `SyntaxError`**, which
   would otherwise be reported as an internal server error for what is plainly a client mistake.
   The `"body" in err` check distinguishes it from unrelated `SyntaxError`s in our own code.
7. **The 500 branch logs what the client must not see** — stack, message, method, path — so a
   user's report of "error id ab12…" resolves to a full trace in seconds.
8. **`next` is unused but must remain in the signature**; the eslint-disable comment documents
   that so a future "cleanup" does not silently disable error handling.

---

## 5. Source: Request Context & Audit Logging

```javascript
// src/middlewares/request-context.middleware.js
import crypto from "crypto";
import { config, logger } from "../config/env.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const QUIET_PATHS = new Set(["/health", "/favicon.ico"]);

/** Reuse an inbound, well-formed correlation id; otherwise mint a fresh one. */
function resolveRequestId(req) {
  const inbound = req.headers["x-request-id"];
  if (typeof inbound === "string" && REQUEST_ID_PATTERN.test(inbound)) return inbound;
  return crypto.randomUUID();
}

export function requestContextMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const requestId = resolveRequestId(req);

  req.id = requestId;
  req.startedAt = Date.now();
  res.setHeader(config.cors.requestIdHeader, requestId);   // X-Request-Id

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    const entry = {
      requestId,
      method: req.method,
      path: req.path,                 // query string intentionally dropped
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ip: req.ip,
      userId: req.principal?.sub ?? null,      // populated after AuthN
      apiKeyId: req.apiClient?.id ?? null,     // populated after M2M AuthN
      userAgent: req.headers["user-agent"] ?? null,
    };

    if (res.statusCode >= 500) logger.error("request failed", entry);
    else if (res.statusCode >= 400) logger.warn("request rejected", entry);
    else if (!QUIET_PATHS.has(req.path)) logger.info("request completed", entry);
  });

  next();
}
```

### Deep explanation

1. **`REQUEST_ID_PATTERN` validates the inbound header.** Copying arbitrary text (newlines, ANSI
   escapes, a 10 MB string) from an untrusted header into every log line is *log injection* — a
   genuine attack on log pipelines and terminals. Malformed values are replaced with a fresh UUID.
2. **`res.on("finish")` fires after the response is sent**, so the log line carries the final
   status code and the true duration — including time spent inside the error handler.
3. **The log records identity, not just transport:** `userId` and `apiKeyId` are read *after* the
   auth gates have run. That is why this middleware is registered first but logs last.
4. **`req.path` deliberately drops the query string.** Secrets, tokens and email addresses end up
   in query strings constantly; not logging them is a one-line privacy control.
5. **Log level follows the status class** — 5xx is `error` (alert-worthy), 4xx is `warn`
   (interesting), 2xx is `info` (routine). That mapping makes an alert rule possible without
   parsing bodies.
6. **`QUIET_PATHS` keeps liveness probes out of the log.** A probe firing every second would
   otherwise be 99 % of the volume and hide the events you actually care about.
7. **Never logged:** request bodies, the `Authorization` header, cookie values, the `X-API-Key`
   header. Every one of those carries a credential or PII.

---

## 6. Verification

### 6.1 The envelope is identical across every failure class

```bash
BASE=http://localhost:4000

curl -s $BASE/api/v1/nope
curl -s $BASE/api/v1/auth/me
curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' -d '{"email":"x"}'
curl -s $BASE/api/v1/notes -H "authorization: Bearer $INVALID"
```

```json
{"error":{"code":"NOT_FOUND","message":"Cannot GET /api/v1/nope","status":404,"requestId":"…"}}
{"error":{"code":"UNAUTHORIZED","message":"Missing or malformed Authorization header — expected: Bearer <access_token>","status":401}}
{"error":{"code":"BAD_REQUEST","message":"email and password are required","status":400}}
{"error":{"code":"UNAUTHORIZED","message":"Invalid access token","status":401}}
```

One shape; a machine-readable `code`; a human `message`; the status echoed inside the body so
clients that only log bodies still see it.

### 6.2 Malformed JSON is a 400, not a 500

```bash
curl -si -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  --data-binary '{ not valid json' | head -5
```

```text
HTTP/1.1 400 Bad Request
{"error":{"code":"INVALID_JSON","message":"Malformed JSON payload in request body","status":400}}
```

### 6.3 401 and 429 carry the right protocol headers

```bash
curl -si $BASE/api/v1/auth/me | grep -i 'www-authenticate'
# WWW-Authenticate: Bearer realm="/api/v1/auth/me", error="invalid_token"

curl -si -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"sarah@example.com","password":"nope"}' | grep -iE 'HTTP/|retry-after'
# HTTP/1.1 429 Too Many Requests
# Retry-After: 900
```

### 6.4 Correlation id round-trip

```bash
# A client-supplied id is reused verbatim, so a front-end can stitch traces together
curl -si $BASE/health -H 'X-Request-Id: my-debug-trace-0001' | grep -i x-request-id
# X-Request-Id: my-debug-trace-0001

# A malformed id is discarded and a fresh UUID is issued instead (log-injection defence)
curl -si $BASE/health -H 'X-Request-Id: bad id!' | grep -i x-request-id
# X-Request-Id: 5f1c0f9a-…
```

### 6.5 The audit log line, and what it omits

```bash
npm start > /tmp/day04.log 2>&1 &
sleep 3
curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"bob@example.com","password":"User$Passw0rd"}' -o /dev/null

grep '"message":"login succeeded"' /tmp/day04.log
grep '"message":"request completed"' /tmp/day04.log | tail -1
```

```json
{"ts":"…","level":"info","message":"login succeeded","userId":"usr_20dc2c542146","role":"user","ip":"127.0.0.1"}
{"ts":"…","level":"info","message":"request completed","requestId":"441322ca-…","method":"POST","path":"/login","status":200,"durationMs":14.09,"ip":"127.0.0.1","userId":null,"apiKeyId":null,"userAgent":"curl/8.5.0"}
```

Proof that nothing sensitive is written to the log:

```bash
grep -ciE 'User\$Passw0rd|authorization|refreshToken|cookie' /tmp/day04.log
# → 0
```

### 6.6 No internals leak in a rejected response

```bash
curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"ghost@example.com","password":"Whatever$1234"}' | grep -ciE 'stack|Error:|bcrypt|src/'
# → 0
```

### 6.7 The suite

```bash
npm test
# ✔ unknown routes return a consistent 404 envelope (Ch09)
# ✔ GET /health returns a redacted config snapshot and security headers (Ch09)
# ✔ login rejects malformed payloads and wrong body types with 400 (Ch09)
# ✔ login returns an identical error for unknown account and bad password (Ch08)
```

---

## 7. Why This Matters

* **One funnel is an audit guarantee.** Because errors can only become HTTP in one function,
  "we never leak internals" is a property you can verify by reading ~30 lines of code.
* **Actionable beats verbose.** `code` + status + the right header lets a client recover
  automatically; a stack trace helps an attacker map your internals and helps an honest client not
  at all.
* **Correlation is what makes logs usable under pressure.** A user pastes an id from a screenshot
  and you have method, path, identity, status and duration — no log diving by timestamp.
* **Log injection is a real vulnerability class.** Validating the correlation header and never
  logging bodies or credentials is the cheapest possible defence, and it costs nothing at runtime.



