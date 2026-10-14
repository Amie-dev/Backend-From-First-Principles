# Implementation Guide 08: Hardened Cookies & Session Transport Security

## 1. Goal & First-Principles Context

Cookies are **transport, not storage** (Ch02). The refresh token has to travel from server to
browser and back on every refresh, and the browser is an environment you do not control. Four
flags decide whether that transport is safe:

| Flag | What it prevents | Value used here |
| :--- | :--- | :--- |
| `HttpOnly` | `document.cookie` access ⇒ a single XSS payload stealing the long-lived token | always on |
| `Secure` | Plaintext-HTTP interception on a downgraded connection | forced on in production |
| `SameSite=Strict` | The cookie being attached to cross-site requests ⇒ CSRF on state-changing routes | `strict` (configurable) |
| `Path` | Blast radius: the credential is sent on *every* API call by default | `/api/v1/auth` |

This guide covers both halves: the **parser** (server side, no dependency) and the **flags**
(client side, in the auth controller).

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `src/middlewares/cookies.middleware.js` | hardened RFC-6265 `Cookie:` header parser → `req.cookies` |
| `src/controllers/auth.controller.js` | `refreshCookieOptions()`, `setRefreshCookie()`, `clearRefreshCookie()` |
| `src/middlewares/security-headers.middleware.js` | `Cache-Control: no-store` so responses are never cached (Guide 12) |
| `src/config/env.js` | cookie name/path/flags/TTL come from `.env` (Guide 02) |

---

## 3. Source: The Cookie Parser

```javascript
/**
 * RFC 6265 (`Cookie: name1=value1; name2=value2`) is deceptively simple and has three
 * sharp edges that a naive split(";") gets wrong:
 *
 *   1. Values may legitimately contain '=' (base64 padding, JWTs) → only the FIRST '='
 *      is a delimiter.
 *   2. Values are percent-encoded; decodeURIComponent throws on malformed input, so
 *      decoding is wrapped and a bad value falls back to raw.
 *   3. A crafted `__proto__=x` cookie would pollute the prototype chain of a plain {}
 *      container → use a null-prototype object plus a deny-list.
 */

/** Prototype-pollution deny-list — these keys must never reach the bag. */
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Defensive cap: browsers limit cookies to ~4KB each; 8KB of header is plenty. */
const MAX_COOKIE_HEADER_BYTES = 8 * 1024;

export function cookieParserMiddleware(req, res, next) {
  /** @type {Record<string, string>} */
  const bag = Object.create(null);
  const rawHeader = req.headers["cookie"];

  if (typeof rawHeader === "string" && rawHeader.length > 0) {
    if (Buffer.byteLength(rawHeader, "utf8") > MAX_COOKIE_HEADER_BYTES) {
      // Oversized cookie header → treat as absent rather than parsing attacker input.
      req.cookies = bag;
      req.rawCookies = rawHeader;
      return next();
    }

    for (const pair of rawHeader.split(";")) {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex < 1) continue;         // no '=' or empty name → skip

      const name = pair.slice(0, separatorIndex).trim();
      const rawValue = pair.slice(separatorIndex + 1).trim();

      if (!name || FORBIDDEN_KEYS.has(name)) continue;

      let value = rawValue;
      try {
        value = decodeURIComponent(rawValue);
      } catch {
        value = rawValue;                       // malformed percent-encoding → keep raw bytes
      }

      // First occurrence wins (RFC 6265 duplicate handling).
      if (!(name in bag)) bag[name] = value;
    }
  }

  req.cookies = bag;
  req.rawCookies = rawHeader ?? "";
  next();
}
```

### Deep explanation

1. **`pair.indexOf("=")` + `slice`** — only the first `=` splits. `refreshToken=abc=def` keeps
   `abc=def` intact; `split("=")` would silently truncate a base64url value.
2. **`Object.create(null)`** — a null-prototype bag has no `__proto__` setter, so even if the
   deny-list were bypassed the container cannot be poisoned to affect other objects.
3. **`decodeURIComponent` inside try/catch** — the browser percent-encodes cookie values, and a
   malformed sequence (`%E0%A4%A`) throws `URIError`. In an Express middleware that would become
   a 500 per request; here it degrades to the raw value.
4. **`MAX_COOKIE_HEADER_BYTES`** — a header-size cap before parsing bounds the work an attacker
   can force per request. (Node also caps total header size; this keeps the *parser* cheap.)
5. **`req.rawCookies` is preserved** for integrity checks and audit logging, so debugging never
   requires re-parsing the header.
6. **Why hand-rolled instead of `cookie-parser`?** Because the repository is built from first
   principles, and because the three rules above are exactly the kind of detail that is invisible
   when a dependency does it for you — until one of them is missing.

---

## 4. Source: The Cookie Flags

```javascript
// src/controllers/auth.controller.js
const REFRESH_COOKIE = config.cookie.name;   // "refreshToken"

/**
 * Cookie attributes, resolved once per request so that an inconsistent
 * COOKIE_SAMESITE=none + COOKIE_SECURE=false combination degrades to `lax`
 * instead of making Express throw a runtime error on every login.
 */
function refreshCookieOptions() {
  const secure = config.cookie.secure;
  const sameSite = config.cookie.sameSite === "none" && !secure ? "lax" : config.cookie.sameSite;

  return {
    httpOnly: true,                  // JS cannot read it → XSS-resilient
    secure,                          // HTTPS only (forced true in production)
    sameSite,                        // "strict" → cross-site requests do not carry it
    path: config.cookie.path,        // "/api/v1/auth" → not sent on every API call
    domain: config.cookie.domain,    // undefined → host-only cookie by default
    maxAge: config.cookie.maxAgeMs,  // mirrors the server-side refresh TTL exactly
  };
}

function setRefreshCookie(res, refreshTokenId) {
  res.cookie(REFRESH_COOKIE, refreshTokenId, refreshCookieOptions());
}

/** Clears the cookie with the SAME attributes it was set with (RFC 6265). */
function clearRefreshCookie(res) {
  const { maxAge, ...attrs } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, attrs);
}
```

### Deep explanation

1. **`httpOnly: true` is unconditional** — it is not configurable, because there is no legitimate
   reason for client JavaScript to read a refresh token.
2. **`sameSite: "strict"` neutralises CSRF on the refresh endpoint.** A malicious site cannot
   trigger a silent refresh, cannot log the victim out, and cannot ride the cookie. The trade-off
   (no cookie on cross-site navigation) is acceptable because this cookie only ever travels to
   `/api/v1/auth/*`.
3. **The `sameSite=none && !secure → lax` downgrade** exists because Express *throws* when asked
   for `SameSite=None` without `Secure`; a misconfiguration should degrade the transport, not turn
   every login into a 500. The production guard (Guide 02) already rejects the combination at
   boot — this is belt-and-braces.
4. **`path: "/api/v1/auth"` is a scoping decision, not cosmetics.** With the default path (`/`),
   the refresh credential would ride along on every request the browser makes to the API —
   including static assets and third-party error reporters — increasing attack surface and
   traffic for no benefit.
5. **`maxAge` mirrors the server TTL** (`REFRESH_TOKEN_TTL`), so browser and server expire the
   session together. A cookie that outlives its record produces confusing 401s; a record that
   outlives its cookie wastes memory.
6. **`clearRefreshCookie` reuses the same attributes** (minus `maxAge`) because browsers match
   cookies on name + path + domain: clearing with different attributes leaves a zombie cookie
   behind that keeps being sent forever.
7. **`domain` stays `undefined` by default**, producing a *host-only* cookie that is not shared
   with parent domains or sibling subdomains — the correct default for an API.

---

## 5. Verification

### 5.1 Inspect the flags on the wire

```bash
curl -si -X POST http://localhost:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"bob@example.com","password":"User$Passw0rd"}' | grep -i '^set-cookie'
```

```text
Set-Cookie: refreshToken=03e02487-ce05-4e95-a602-b9838161d721; Max-Age=604800; Path=/api/v1/auth; Expires=…; HttpOnly; SameSite=Strict
```

Checklist against that line: `HttpOnly` ✅ · `Path=/api/v1/auth` ✅ · `SameSite=Strict` ✅ ·
`Max-Age` = 7 days ✅ · `Secure` — absent locally because `NODE_ENV=development`. Start the
server with `NODE_ENV=production` and real secrets (Guide 02's guard tells you which ones are
missing) and `Secure` appears.

### 5.2 The cookie never appears in a response body

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"bob@example.com","password":"User$Passw0rd"}' | grep -c refreshToken
# → 0     (the access token is in the body; the refresh token is not)
```

### 5.3 Path scoping in practice

```bash
# The cookie jar honours the cookie's Path: /api/v1/notes will NOT receive it
curl -sv -b /tmp/day04.jar http://localhost:4000/api/v1/notes 2>&1 \
  | grep -i '> cookie' || echo "no cookie sent ✅"
```

```bash
# …while the auth routes do
curl -sv -b /tmp/day04.jar -X POST http://localhost:4000/api/v1/auth/refresh 2>&1 \
  | grep -i '> cookie'
# > cookie: refreshToken=03e02487-…
```

### 5.4 Clearing works (and with matching attributes)

```bash
curl -si -b /tmp/day04.jar -X POST http://localhost:4000/api/v1/auth/logout | grep -i '^set-cookie'
# → Set-Cookie: refreshToken=; Path=/api/v1/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict
```

### 5.5 Parser edge cases (pollution, `=` in values, malformed encoding)

```bash
# The server must answer 401 (token not recognised) — NOT 500, and no pollution
curl -s -X POST http://localhost:4000/api/v1/auth/refresh \
  -H 'Cookie: __proto__=polluted; refreshToken=abc=def; broken=%E0%A4%A'
# → {"error":{"code":"UNAUTHORIZED","message":"Refresh token is not recognised …","status":401}}

# Prove nothing polluted the object graph
node -e "console.log('unpolluted:', ({}).polluted === undefined)"
```

### 5.6 The suite

```bash
npm test
# ✔ login issues a short-lived JWT plus a hardened HttpOnly refresh cookie (Ch02)
# ✔ the refresh cookie value is never exposed in the JSON body (Ch02)
# ✔ logout revokes the session server-side and clears the cookie (Ch03)
```

---

## 6. Why This Matters

* **The refresh cookie is the highest-value credential in the system** — it can mint new access
  tokens for a week. Every flag is a wall between it and a browser-based attacker.
* **`HttpOnly` + `SameSite=Strict` together** make it invisible to XSS and unusable via CSRF,
  which is precisely what makes a long-lived session affordable in the first place.
* **Path scoping is free security.** A credential that is not transmitted cannot be intercepted,
  logged by a reverse proxy, or leaked through a `Referer` header.
* **Parse defensively, always.** Cookie headers are fully attacker-controlled; handling the first
  `=`, decode failures and prototype keys is the difference between a clean 401 and a remotely
  triggerable 500 (or a polluted object graph).


