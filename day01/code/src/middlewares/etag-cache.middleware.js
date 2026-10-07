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
