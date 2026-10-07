# Chapter 09: Content Negotiation & Compression

## 1. What is Content Negotiation?

**Content Negotiation** is the mechanism by which a client and server agree on the optimal format, language, and compression encoding for transmitting HTTP payload data.

```
Client (Browser)                                         Server
   | --- GET /api/reports -----------------------------> |
   |     Accept: application/json                        | Evaluates client preferences:
   |     Accept-Language: en-US                          | - Chooses JSON format
   |     Accept-Encoding: gzip, br                       | - Selects English language
   |                                                     | - Compresses using Brotli (br)
   | <-- 200 OK ---------------------------------------- |
   |     Content-Type: application/json                  |
   |     Content-Encoding: br                            |
   |     Vary: Accept-Encoding                           |
```

---

## 2. Server-Driven Negotiation Headers

In server-driven content negotiation, the client transmits preference headers equipped with **quality weighting values ($q$-factors)** ranging from `0.0` (disallowed) to `1.0` (highest preference).

### 2.1 Request Headers

| Header | Description | Example |
| :--- | :--- | :--- |
| `Accept` | Preferred MIME media types | `Accept: application/json, text/html;q=0.9, */*;q=0.8` |
| `Accept-Encoding` | Supported compression algorithms | `Accept-Encoding: br, gzip;q=0.8, deflate;q=0.5` |
| `Accept-Language` | Preferred human language | `Accept-Language: en-US, en;q=0.9, es;q=0.7` |
| `Accept-Charset` | Preferred character set encoding | `Accept-Charset: utf-8, iso-8859-1;q=0.5` |

---

### 2.2 Understanding Quality Values ($q$-Values)

```text
Accept: text/html, application/xhtml+xml, application/xml;q=0.9, image/webp, */*;q=0.8
```
* `text/html` and `image/webp` have implicit weight `q=1.0` (highest priority).
* `application/xml` has weight `q=0.9`.
* `*/*` (fallback for any type) has weight `q=0.8`.

---

## 3. Payload Compression (`gzip` & Brotli `br`)

Compressing HTTP response payloads dramatically reduces network transfer size, decreasing page load latency and network costs.

### Compression Algorithms Comparison

| Algorithm | Developer | Strengths | Typical Compression Ratio |
| :--- | :--- | :--- | :--- |
| **`gzip`** | Jean-loup Gailly / Mark Adler | Fast, universal browser support | 60% - 75% size reduction |
| **`br` (Brotli)** | Google | Superior compression density for text | 75% - 88% size reduction |

### Real-World Bandwidth Impact
* **Uncompressed JSON API Payload**: `26.4 MB`
* **Gzip Compressed Payload**: `4.1 MB` (*84.4% network bandwidth saved*)
* **Brotli Compressed Payload**: `3.6 MB` (*86.3% network bandwidth saved*)

---

## 4. The `Vary` Header

When a server returns a response negotiated based on request headers, it **must** include a `Vary` response header.

```http
Vary: Accept-Encoding, Accept-Language
```

**Why is `Vary` Critical?**
`Vary` informs intermediate CDNs and browser caches that they **must not serve** a cached `gzip` response to a client that does not support `gzip` in its `Accept-Encoding` header.

---

## 5. JavaScript Pseudocode: Node.js Content Negotiation & Gzip Compression

```javascript
// ==============================================================================
// JavaScript / Node.js Content Negotiation & Response Compression Middleware
// Uses built-in 'zlib' module for Gzip/Brotli payload compression
// ==============================================================================

const zlib = require("zlib");

function compressionAndNegotiationMiddleware(req, res, next) {
  const acceptEncoding = req.headers["accept-encoding"] || "";

  // Set Vary header to protect intermediate CDN caches
  res.setHeader("Vary", "Accept-Encoding");

  const originalJson = res.json;

  res.json = function (data) {
    const jsonString = JSON.stringify(data);
    const rawBuffer = Buffer.from(jsonString, "utf-8");

    // 1. Negotiate Compression Format (Brotli > Gzip > Plain text)
    if (acceptEncoding.includes("br")) {
      zlib.brotliCompress(rawBuffer, (err, compressedBuffer) => {
        if (err) return originalJson.call(this, data);

        res.setHeader("Content-Encoding", "br");
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Length", compressedBuffer.length);
        console.log(`[COMPRESSION] Brotli size: ${rawBuffer.length}B -> ${compressedBuffer.length}B`);
        res.send(compressedBuffer);
      });
      return;
    }

    if (acceptEncoding.includes("gzip")) {
      zlib.gzip(rawBuffer, (err, compressedBuffer) => {
        if (err) return originalJson.call(this, data);

        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Length", compressedBuffer.length);
        console.log(`[COMPRESSION] Gzip size: ${rawBuffer.length}B -> ${compressedBuffer.length}B`);
        res.send(compressedBuffer);
      });
      return;
    }

    // Uncompressed fallback
    return originalJson.call(this, data);
  };

  next();
}

// Integration Test Simulation
const mockReq = {
  headers: {
    accept: "application/json",
    "accept-encoding": "gzip, deflate, br"
  }
};

const mockRes = {
  headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  send(buf) { console.log(`[Sent Compressed Buffer] Length: ${buf.length} bytes`); },
  json(data) { console.log("Sent uncompressed json"); }
};

compressionAndNegotiationMiddleware(mockReq, mockRes, () => {
  const largeDataset = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `Record_${i}` }));
  mockRes.json(largeDataset);
});
```

---

## 6. Key Takeaways

1. **Content Negotiation** allows clients to request specific formats, languages, and encodings via quality-weighted ($q$-factor) headers.
2. **Brotli (`br`) and `gzip`** compression reduce text payload sizes by up to 85%, significantly improving performance.
3. Servers using negotiated responses **must return the `Vary` header** to prevent cache poisoning in shared CDNs.
