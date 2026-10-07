# Chapter 08: HTTP Caching & Conditional Requests

## 1. Why HTTP Caching Matters

HTTP Caching saves responses in local storage (browser cache, reverse proxy, CDN) so subsequent requests can be served faster without re-fetching data across the network.

**Primary Benefits**:
1. **Reduced Latency**: Instant response delivery from local browser cache (0ms network cost).
2. **Bandwidth Conservation**: Eliminates redundant transmission of unchanged static files or API payloads.
3. **Database & Server Load Relief**: Prevents unnecessary backend CPU cycles and database queries.

---

## 2. Cache Control Directives (`Cache-Control`)

The `Cache-Control` header is the primary mechanism for establishing caching rules.

```http
Cache-Control: public, max-age=3600, must-revalidate
```

| Directive | Description | Use Case |
| :--- | :--- | :--- |
| `max-age=<seconds>` | Time duration in seconds that the response is considered fresh. | Static assets (CSS, JS, images). |
| `no-cache` | Response can be cached, but **must revalidate** with server before every reuse. | Dynamic API endpoints. |
| `no-store` | **Never cache** any portion of request/response. | Banking data, personal health information. |
| `private` | Response can only be cached by the end user's browser, NOT by intermediate CDNs/proxies. | User profile data. |
| `public` | Response can be cached by any intermediate proxy, CDN, or shared cache. | Public blog posts. |
| `must-revalidate` | Once `max-age` expires, cache must revalidate with server before serving stale data. | Financial data. |
| `immutable` | Indicates file will never change (e.g. `main.a8b7c6.js`). Browser skips validation entirely. | Bundled static assets. |

---

## 3. Validation & Conditional Requests (`ETag` & `Last-Modified`)

When a cached response expires (`max-age` reached) or uses `no-cache`, the client performs a **Conditional Request** to ask the server if the payload has changed.

### 3.1 Validation Headers Pair

| Server Response Header | Client Conditional Request Header | Validation Type |
| :--- | :--- | :--- |
| `ETag: "hash-abc123"` | `If-None-Match: "hash-abc123"` | Content hash match |
| `Last-Modified: <timestamp>` | `If-Modified-Since: <timestamp>` | File modification time match |

---

### 3.2 Revalidation Flow Diagram

```
Client (Browser)                                         Server
   |                                                        |
   | --- GET /api/products -------------------------------> | (First Request)
   | <-- 200 OK [ETag: "v1", Cache-Control: no-cache] ----- | (Stores payload & ETag "v1")
   |                                                        |
   |                                                        |
   | --- GET /api/products [If-None-Match: "v1"] ---------> | (Subsequent Request)
   |                                                        | Checks ETag "v1" against DB
   |                                                        | Hash matches! Data unchanged.
   | <-- 304 Not Modified --------------------------------- | (EMPTY Body! Saved bandwidth)
```

---

## 4. JavaScript Pseudocode: Node.js / Express ETag Caching Middleware

```javascript
// ==============================================================================
// JavaScript / Node.js Server-Side ETag Generation & Conditional Request Middleware
// Computes cryptographic MD5/SHA256 hashes to return 304 Not Modified
// ==============================================================================

const crypto = require("crypto");

function etagCacheMiddleware(req, res, next) {
  if (req.method !== "GET") return next();

  const originalSend = res.send;

  res.send = function (body) {
    // 1. Compute strong ETag hash from response body buffer
    const hash = crypto
      .createHash("md5")
      .update(typeof body === "string" ? body : JSON.stringify(body))
      .digest("hex");
    const etag = `"${hash}"`;

    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "no-cache, private");

    // 2. Check for conditional header If-None-Match from client
    const clientIfNoneMatch = req.headers["if-none-match"];

    if (clientIfNoneMatch === etag) {
      console.log(`[CACHE HIT] ETag ${etag} matches! Sending 304 Not Modified.`);
      // Return 304 Not Modified with EMPTY payload
      return res.status(304).end();
    }

    console.log(`[CACHE MISS] Returning 200 OK with fresh body.`);
    return originalSend.call(this, body);
  };

  next();
}

// Integration Test Simulation
const mockReq1 = { method: "GET", headers: {} };
const mockReq2 = { method: "GET", headers: { "if-none-match": '"157297e68fa7075c3db0bf16089d7145"' } };

const createMockRes = () => ({
  headers: {},
  statusCode: 200,
  setHeader(k, v) { this.headers[k] = v; },
  status(code) { this.statusCode = code; return this; },
  end() { console.log(`[Response End] Status: ${this.statusCode}`); },
  send(body) { console.log(`[Response Sent] Status: ${this.statusCode}, Body: ${JSON.stringify(body)}`); }
});

const res1 = createMockRes();
etagCacheMiddleware(mockReq1, res1, () => {
  res1.send({ items: ["Laptop", "Phone"] });
});

const res2 = createMockRes();
etagCacheMiddleware(mockReq2, res2, () => {
  res2.send({ items: ["Laptop", "Phone"] });
});
```

---

## 5. Key Takeaways

1. `Cache-Control: no-store` **disables caching completely** for sensitive data.
2. `Cache-Control: no-cache` allows caching but forces **revalidation before every read**.
3. **ETags** enable conditional requests via `If-None-Match`.
4. If data is unchanged, the server returns **`304 Not Modified` with no body**, saving network bandwidth and reducing load times.
