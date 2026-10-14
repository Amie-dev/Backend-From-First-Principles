# Implementation Guide 12: CORS, Security Headers & Sliding-Window Rate Limiting

## 1. Goal & First-Principles Context

Three middlewares that sit *before* authentication and decide whether a request is even allowed
to reach it:

| Middleware | Question it answers | Fails with |
| :--- | :--- | :--- |
| **CORS** | May a browser on origin *X* read our response? | 403 on a denied preflight |
| **Security headers** | What may a browser *do* with what we return? | (headers only) |
| **Rate limiter** | Is this caller allowed to spend resources right now? | 429 + `Retry-After` |

They are grouped because they share a property: **they must be correct even when the caller is
hostile**, and they must be cheap, because they run on every single request.

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `src/middlewares/cors.middleware.js` | allow-list + preflight negotiation |
| `src/middlewares/security-headers.middleware.js` | HSTS/CSP/nosniff/no-store and friends |
| `src/services/rate-limiter.service.js` | `SlidingWindowRateLimiter` + configured instances |
| `src/config/env.js` | every origin, header, limit and window comes from `.env` (Guide 02) |

---

## 3. Source: CORS

```javascript
import { config, logger } from "../config/env.js";

export function createCorsMiddleware(options = {}) {
  const allowedOrigins = Object.freeze(options.origins ?? config.cors.origins);
  const allowCredentials = options.credentials ?? config.cors.credentials;
  const allowedMethods = options.methods ?? config.cors.methods;
  const allowedHeaders = options.allowedHeaders ?? config.cors.allowedHeaders;
  const exposedHeaders = options.exposedHeaders ?? config.cors.exposedHeaders;
  const maxAgeSeconds = options.maxAgeSeconds ?? config.cors.maxAgeSeconds;

  const allowAnyOrigin = allowedOrigins.includes("*");

  // Pre-compile wildcard patterns ONCE at boot (the hot path stays allocation-free).
  // `https://*.example.com` must never be matched with endsWith() — `https://evil-example.com`
  // would sail through. Escape every regex metacharacter, then turn the escaped \* into "one label".
  const compiledPatterns = allowedOrigins
    .filter((o) => o !== "*" && o.includes("*"))
    .map((pattern) => {
      const escaped = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")   // escape ALL regex metacharacters
        .replace(/\\\*/g, "[^.]+");                // '\*' → one or more non-dot characters
      return new RegExp(`^${escaped}$`, "i");
    });

  const literalOrigins = new Set(
    allowedOrigins.filter((o) => o !== "*" && !o.includes("*")).map((o) => o.toLowerCase())
  );

  function resolveAllowOrigin(origin) {
    if (!origin) return null;
    if (literalOrigins.has(origin.toLowerCase())) return origin;
    if (compiledPatterns.some((rx) => rx.test(origin))) return origin;
    if (allowAnyOrigin) {
      // Never combine '*' with credentials — echo the concrete origin instead.
      return allowCredentials ? origin : "*";
    }
    return null;
  }

  return function corsMiddleware(req, res, next) {
    const origin = req.headers["origin"];
    const allowOrigin = resolveAllowOrigin(origin);
    const isPreflight =
      req.method === "OPTIONS" && Boolean(req.headers["access-control-request-method"]);

    // Caches must key on Origin whenever a response varies by origin.
    res.append("Vary", "Origin");
    if (isPreflight) res.append("Vary", "Access-Control-Request-Method");

    if (allowOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowOrigin);
      if (allowCredentials) res.setHeader("Access-Control-Allow-Credentials", "true");
      if (exposedHeaders.length > 0) {
        res.setHeader("Access-Control-Expose-Headers", exposedHeaders.join(", "));
      }
    }

    if (req.method !== "OPTIONS") return next();

    if (isPreflight) {
      if (!allowOrigin) {
        logger.warn("CORS preflight denied", {
          origin, requestedMethod: req.headers["access-control-request-method"], path: req.path,
        });
        return res.status(403).json({
          error: { code: "CORS_ORIGIN_DENIED",
                   message: `Origin '${origin}' is not allowed by the CORS policy`, status: 403 },
        });
      }
      res.setHeader("Access-Control-Allow-Methods", allowedMethods.join(", "));
      res.setHeader("Access-Control-Allow-Headers", allowedHeaders.join(", "));
      res.setHeader("Access-Control-Max-Age", String(maxAgeSeconds));
      return res.status(204).end();
    }

    // Plain OPTIONS (not a preflight) — no CORS negotiation needed.
    res.setHeader("Allow", allowedMethods.join(", "));
    return res.status(204).end();
  };
}
```

---

## 4. Deep Explanation: CORS

1. **Why hand-rolled instead of the `cors` package?** The repository is built from first
   principles, and the mechanics below (origin echo, `Vary` correctness, preflight short-circuit,
   the credentials rule) are exactly the details that stay invisible when a library handles them —
   until one is missing.
2. **`endsWith()` is the classic wildcard bug.** With `equals`/`endsWith` matching,
   `https://evil-example.com` matches the pattern `https://*.example.com`. The implementation
   escapes every regex metacharacter first and then translates the escaped `\*` into `[^.]+`, so
   the wildcard can only ever cover one DNS label. (This bug was found by a test in Guide 15 and
   fixed — see the test *"preflight from a look-alike origin is denied"*.)
3. **`res.append("Vary", "Origin")` is mandatory, not optional.** Responses differ by origin, so a
   shared cache or CDN that ignores `Vary` will serve origin A's `Access-Control-Allow-Origin`
   header to origin B — which is either a broken client or an open door, depending on direction.
4. **Credentials + `*` is impossible.** The Fetch spec forbids `Access-Control-Allow-Origin: *`
   on a credentialed request, so when `CORS_CREDENTIALS=true` and `*` is configured the concrete
   origin is echoed instead. (The production guard in Guide 02 refuses that combination outright.)
5. **Preflight is answered before any auth work.** A browser sends `OPTIONS` with no
   `Authorization` header and no cookies; requiring credentials for it would make every
   cross-origin request fail. Answering it with 204 leaks only the policy, which the browser needs
   anyway.
6. **A denied origin is not blocked on real requests.** Browsers enforce CORS themselves; the
   server returning 403 for a non-preflight request would break same-origin and server-to-server
   callers that happen to send an `Origin` header. Only preflight — where the browser is asking a
   question — gets a hard "no".
7. **Plain `OPTIONS` (no `Access-Control-Request-Method`) returns 204 + `Allow`** rather than
   falling through to a 404, because "what methods does this URL support?" is a legitimate
   question.

---

## 5. Source: Security Headers

```javascript
// src/middlewares/security-headers.middleware.js
import { config } from "../config/env.js";

export function securityHeadersMiddleware(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");       // blocks MIME-confusion XSS
  res.setHeader("X-Frame-Options", "DENY");                 // blocks clickjacking
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Referrer-Policy", "no-referrer");          // no token leakage via Referer
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()");

  if (config.isProduction) {
    // HSTS is emitted ONLY in production: browsers ignore it over plain HTTP, and sending it
    // locally would pin `localhost` to HTTPS and break tooling for the developer.
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  // A JSON API should never be framed, scripted, or embedded — and never cached.
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

  // Do not advertise the framework — fingerprinting the stack only helps attackers.
  res.removeHeader("X-Powered-By");

  next();
}
```

### Deep explanation

1. **Each header closes a named attack class**, which is why they are commented individually
   rather than pasted as a helmet-style blob: `nosniff` → MIME confusion, `DENY` → clickjacking,
   `Referrer-Policy` → credential-in-URL leakage, `Permissions-Policy` → unused powerful APIs.
2. **`default-src 'none'` is correct for an API.** This service returns JSON, never HTML; any
   script, frame or connection the browser attempts is a bug or an attack. A SPA front-end hosted
   separately sets its own CSP.
3. **`Cache-Control: no-store` is a security header here, not a performance one.** Tokens, cookies
   and PII must never land in a shared proxy cache or the browser's disk cache — an authenticated
   response that survives a logout is a data leak waiting for a shared laptop.
4. **HSTS is production-only** for a practical reason: a browser that learns HSTS for
   `localhost:4000` will refuse plain HTTP for a year, which breaks every subsequent local
   experiment.
5. **`res.removeHeader("X-Powered-By")`** removes the Express fingerprint; `app.disable("x-powered-by")`
   in `app.js` is the primary defence, this is the belt-and-braces.

---

## 6. Source: The Sliding-Window Rate Limiter

```javascript
// src/services/rate-limiter.service.js
import { config } from "../config/env.js";

export class SlidingWindowRateLimiter {
  /**
   * @param {number} limit    - max allowed calls in the window
   * @param {number} windowMs - window duration in milliseconds
   */
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    /** @type {Map<string, number[]>} key → sorted array of call timestamps */
    this._buckets = new Map();
  }

  /**
   * Record one call attempt for a key.
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
   */
  attempt(key) {
    const now    = Date.now();
    const cutoff = now - this.windowMs;

    let timestamps = this._buckets.get(key);
    if (!timestamps) {
      timestamps = [];
      this._buckets.set(key, timestamps);
    }

    // Evict timestamps that have fallen outside the sliding window
    while (timestamps.length > 0 && timestamps[0] < cutoff) timestamps.shift();

    if (timestamps.length >= this.limit) {
      // The oldest timestamp tells us exactly when a slot frees up
      const retryAfterMs = this.windowMs - (now - timestamps[0]);
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    timestamps.push(now);
    return { allowed: true, remaining: this.limit - timestamps.length, retryAfterMs: 0 };
  }

  /** Clear the state for a key (after a successful login, or an admin unlock). */
  reset(key) {
    this._buckets.delete(key);
  }

  /** Purge idle buckets so the Map cannot grow without bound. */
  prune() {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, ts] of this._buckets.entries()) {
      const live = ts.filter((t) => t >= cutoff);
      if (live.length === 0) this._buckets.delete(key);
      else this._buckets.set(key, live);
    }
  }
}

// ── Instances are configured from .env (Guide 02), never hard-coded ───────────
export const ipLoginLimiter = new SlidingWindowRateLimiter(
  config.rateLimit.loginIpLimit,          // 20
  config.rateLimit.loginIpWindowMs        // 1m
);

export const accountLoginLimiter = new SlidingWindowRateLimiter(
  config.rateLimit.loginAccountLimit,     // 5
  config.rateLimit.loginAccountWindowMs   // 15m
);

export const registerIpLimiter = new SlidingWindowRateLimiter(
  config.rateLimit.registerIpLimit,       // 10
  config.rateLimit.registerIpWindowMs     // 1h
);

export const allLimiters = Object.freeze([ipLoginLimiter, accountLoginLimiter, registerIpLimiter]);
```

### Deep explanation

1. **Sliding window vs. fixed window.** A fixed window resets at a boundary, so a bot can send
   `limit` requests at 11:59:59 and another `limit` at 12:00:00 — double the intended rate in one
   second. A sliding window measures the last *N* ms continuously, so the boundary burst is
   impossible.
2. **`retryAfterMs` is computed, not guessed.** The oldest surviving timestamp tells you precisely
   when a slot frees, which becomes an honest `Retry-After` header instead of an arbitrary "60".
3. **Key namespacing (`ip:…`, `account:…`) lets one class serve several purposes.** The limiter
   knows nothing about IPs, emails or API keys; callers decide the namespace.
4. **`reset()` supports legitimate recovery** — a successful login clears the failure counter
   (Guide 05), and an admin "unlock account" action has an obvious implementation.
5. **`prune()` is the memory-safety valve.** An attacker who cycles through random identifiers
   would otherwise grow the Map forever; the maintenance timer calls every limiter's `prune()`
   every ten minutes (Guide 14).
6. **Config-driven thresholds** mean an active campaign can be answered by tightening `.env` and
   redeploying — no code change, no hotfix review.

---

## 7. Verification

### 7.1 An allowed preflight is fully negotiated

```bash
curl -si -X OPTIONS http://localhost:4000/api/v1/auth/login \
  -H 'Origin: http://localhost:5173' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' | head -14
```

```text
HTTP/1.1 204 No Content
Vary: Origin
Vary: Access-Control-Request-Method
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
Access-Control-Expose-Headers: X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After
Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-API-Key, X-Requested-With, Accept
Access-Control-Max-Age: 86400
```

### 7.2 A look-alike origin is denied (the `endsWith` trap)

```bash
curl -s -X OPTIONS http://localhost:4000/api/v1/auth/login \
  -H 'Origin: https://evil-example.com' -H 'Access-Control-Request-Method: POST'
# → 403 {"error":{"code":"CORS_ORIGIN_DENIED","message":"Origin 'https://evil-example.com' is not allowed by the CORS policy","status":403}}
```

```bash
# …while the legitimate wildcard subdomain passes
CORS_ORIGINS='https://*.example.com' npm start &
curl -si -X OPTIONS http://localhost:4000/api/v1/auth/login \
  -H 'Origin: https://app.example.com' -H 'Access-Control-Request-Method: POST' | head -4
# → 204 with Access-Control-Allow-Origin: https://app.example.com
```

### 7.3 Real requests carry the policy and the exposed rate-limit headers

```bash
curl -si -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Origin: http://localhost:5173' -H 'content-type: application/json' \
  -d '{"email":"bob@example.com","password":"User$Passw0rd"}' | grep -iE 'access-control|vary' 
# Access-Control-Allow-Origin: http://localhost:5173
# Access-Control-Allow-Credentials: true
# Access-Control-Expose-Headers: X-Request-Id, X-RateLimit-Limit, …
# Vary: Origin
```

### 7.4 Security headers on every response

```bash
curl -sI http://localhost:4000/health | grep -iE 'x-content-type|x-frame|referrer|permissions-policy|content-security|cache-control|x-powered-by|cross-origin'
```

```text
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
Cache-Control: no-store
Cross-Origin-Resource-Policy: same-site
Cross-Origin-Opener-Policy: same-origin
```

(`X-Powered-By` is absent — `grep` prints nothing for it, which is the success criterion.
`Strict-Transport-Security` appears only when `NODE_ENV=production`.)

### 7.5 Rate limiting, end to end

```bash
# Login failures on one account (default 5/15min) — the second half should be 429
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "attempt $i → %{http_code}\n" -X POST http://localhost:4000/api/v1/auth/login \
    -H 'content-type: application/json' -d '{"email":"sarah@example.com","password":"nope"}'
done
# attempt 1..5 → 401 ; attempt 6..7 → 429
```

```bash
curl -si -X POST http://localhost:4000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"sarah@example.com","password":"nope"}' | grep -iE 'HTTP/|retry-after|x-ratelimit'
# HTTP/1.1 429 Too Many Requests
# X-RateLimit-Remaining: 0
# Retry-After: 900
```

### 7.6 The limiter's own semantics (fast, no server needed)

```bash
node --input-type=module -e "
import('./src/services/rate-limiter.service.js').then(({ SlidingWindowRateLimiter }) => {
  const l = new SlidingWindowRateLimiter(3, 1000);
  console.log([1,2,3,4].map(() => l.attempt('k').allowed));  // [true, true, true, false]
  l.reset('k');
  console.log('after reset →', l.attempt('k').allowed);       // true
})"
```

### 7.7 The suite

```bash
npm test
# ✔ preflight from an allowed origin returns the negotiated policy (Ch08)
# ✔ preflight from a look-alike origin is denied — no naive suffix matching (Ch08)
# ✔ actual requests from an allowed origin expose CORS + rate-limit metadata
# ✔ GET /health returns a redacted config snapshot and security headers (Ch09)
# ✔ sliding-window limiter blocks, reports retry-after, resets and prunes (Ch08)
```

---

## 8. Why This Matters

* **CORS is a browser-enforced policy you must describe accurately.** Getting it wrong either
  breaks every front-end or (far worse) tells browsers that any origin may read authenticated
  responses.
* **`Vary: Origin` is the invisible half of CORS.** Without it, a CDN will happily serve one
  origin's allowance to another — the kind of bug that only appears in production, behind a cache.
* **Headers are defence in depth, not decoration.** `no-store` on an authenticated JSON response
  and `nosniff` on a JSON content type cost nothing and close entire attack classes.
* **Rate limits are the first line of every credential attack's failure.** They are also the
  earliest signal: a spike in `login throttled` warnings is what an incident response looks like
  ten minutes before a breach.



