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
