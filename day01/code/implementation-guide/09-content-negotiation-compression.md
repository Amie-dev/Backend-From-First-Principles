# Implementation Guide - Chapter 09: Gzip & Brotli Compression Middleware

## 1. Overview & Goal

Text-based payloads (JSON, HTML, CSS) can be compressed by 60%–85% using compression algorithms like **Gzip** and **Brotli (`br`)**.

In this chapter, we build a **Content Negotiation Compression Middleware**. It inspects the client's `Accept-Encoding` header, selects the highest quality compression supported by the client, compresses the response buffer using Node.js's built-in `zlib` module, and appends `Vary: Accept-Encoding`.

---

## 2. Terminal Test Commands

```bash
# Request gzip compressed JSON payload
curl -v http://localhost:3000/api/v1/public \
     -H "Accept-Encoding: gzip"

# Request Brotli (br) compressed payload
curl -v http://localhost:3000/api/v1/public \
     -H "Accept-Encoding: br, gzip"
```

---

## 3. Complete Source Code: `src/middlewares/compression.middleware.js`

Create `day01/code/src/middlewares/compression.middleware.js`:

```javascript
import zlib from "zlib";

/**
 * Content Negotiation & Compression Middleware
 * Evaluates `Accept-Encoding` request headers and compresses payload using Gzip or Brotli.
 */
export function compressionMiddleware(req, res, next) {
  const acceptEncoding = req.headers["accept-encoding"] || "";

  // Mandatory Vary header to avoid CDN cache poisoning
  res.setHeader("Vary", "Accept-Encoding");

  const originalSend = res.send;

  res.send = function (body) {
    if (res.statusCode !== 200 || !body) {
      return originalSend.call(this, body);
    }

    const payloadBuffer = Buffer.isBuffer(body)
      ? body
      : Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf-8");

    // Skip compression for tiny payloads (< 512 bytes)
    if (payloadBuffer.length < 512) {
      return originalSend.call(this, body);
    }

    // 1. Brotli Compression Preference
    if (acceptEncoding.includes("br")) {
      zlib.brotliCompress(payloadBuffer, (err, compressed) => {
        if (err) return originalSend.call(this, body);

        res.setHeader("Content-Encoding", "br");
        res.setHeader("Content-Length", compressed.length);
        console.log(`[Compression] Brotli: ${payloadBuffer.length} B -> ${compressed.length} B`);
        return originalSend.call(this, compressed);
      });
      return;
    }

    // 2. Gzip Compression Fallback
    if (acceptEncoding.includes("gzip")) {
      zlib.gzip(payloadBuffer, (err, compressed) => {
        if (err) return originalSend.call(this, body);

        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Content-Length", compressed.length);
        console.log(`[Compression] Gzip: ${payloadBuffer.length} B -> ${compressed.length} B`);
        return originalSend.call(this, compressed);
      });
      return;
    }

    return originalSend.call(this, body);
  };

  next();
}
```

---

## 4. Deep Code Explanation

1. **`Vary: Accept-Encoding`**: Critical HTTP requirement. Informs shared reverse proxies and CDNs that the response payload varies based on the client's `Accept-Encoding` header, preventing CDNs from serving compressed Gzip bytes to clients that don't support Gzip.
2. **`payloadBuffer.length < 512`**: Small payloads take more CPU cycles to compress than the network bytes saved. We skip compression for tiny payloads.
3. **`zlib.brotliCompress`**: Google's Brotli algorithm achieves 15-25% better compression density than Gzip for text/JSON payloads.
4. **`res.setHeader("Content-Encoding", "gzip" | "br")`**: Tells the client browser which decompression algorithm to apply when decoding the incoming network stream.
