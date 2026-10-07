# Implementation Guide - Chapter 08: ETag Computation & `304 Not Modified` Caching

## 1. Overview & Goal

HTTP caching minimizes latency, saves network bandwidth, and relieves database load.

In this chapter, we build an **ETag & Conditional Caching Middleware**. It intercepts `GET` responses, computes an MD5 cryptographic hash of the payload body, and sends an `ETag: "<hash>"` header. When clients send a subsequent request with `If-None-Match: "<hash>"`, the server checks if the hash matches. If unchanged, it sends an empty **`304 Not Modified`** response, saving network transfer bytes.

---

## 2. Terminal Test Commands

```bash
# Step 1: Initial Request (Note the ETag header returned in output)
curl -v http://localhost:3000/api/v1/public

# Response Header: ETag: "157297e68fa7075c3db0bf16089d7145"

# Step 2: Conditional Revalidation Request using returned ETag
curl -v http://localhost:3000/api/v1/public \
     -H 'If-None-Match: "157297e68fa7075c3db0bf16089d7145"'

# Expect Status: HTTP/1.1 304 Not Modified (0 bytes transferred!)
```

---

## 3. Complete Source Code: `src/middlewares/etag-cache.middleware.js`

Create `day01/code/src/middlewares/etag-cache.middleware.js`:

```javascript
import crypto from "crypto";

/**
 * Server-Side ETag & Conditional Request Caching Middleware
 * Computes MD5 cryptographic hash of GET response payloads to return 304 Not Modified.
 */
export function etagCacheMiddleware(req, res, next) {
  // Only execute caching logic on GET operations
  if (req.method !== "GET") {
    return next();
  }

  const originalSend = res.send;

  res.send = function (body) {
    // Only compute ETag if response is successful 200 OK
    if (res.statusCode === 200 && body) {
      const payloadString = typeof body === "string" ? body : JSON.stringify(body);
      const hash = crypto.createHash("md5").update(payloadString).digest("hex");
      const etag = `"${hash}"`;

      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "no-cache, private");

      // Check conditional header If-None-Match sent by browser/client
      const clientIfNoneMatch = req.headers["if-none-match"];

      if (clientIfNoneMatch === etag) {
        console.log(`[ETag Middleware] Revalidation match for ETag ${etag}! Returning 304 Not Modified.`);
        res.status(304);
        return res.end(); // 304 Not Modified returns 0 body payload bytes
      }
    }

    return originalSend.call(this, body);
  };

  next();
}
```

---

## 4. Deep Code Explanation

1. **Monkey Patching `res.send`**: In Express, `res.send` is called when a controller finishes generating a response. We wrap `res.send` to inspect the response body *before* data is sent down the TCP wire.
2. **`crypto.createHash("md5").update(payloadString).digest("hex")`**: Computes an MD5 digest hash representing the exact state of the response payload.
3. **`res.setHeader("ETag", etag)`**: Sends the strong validator `ETag: "<hash>"` to the client.
4. **`Cache-Control: no-cache, private`**: Instructs browsers to store the cached copy locally, but forces them to **revalidate with the origin server** using `If-None-Match` before reusing it.
5. **`clientIfNoneMatch === etag`**:
   - If true: The server data hasn't changed. We set `res.status(304)` and call `res.end()`. No response body is transmitted.
   - If false: Server data changed. We proceed to call `originalSend(body)` with status `200 OK` and the new payload data.
