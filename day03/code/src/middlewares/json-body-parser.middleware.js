/**
 * Custom First-Principles JSON Body Parser Middleware
 * Replaces express.json() / body-parser by directly consuming Node.js HTTP request readable streams.
 */

/**
 * Factory creating custom JSON body parser middleware with options
 * @param {Object} options Configuration options
 * @param {number} [options.limitBytes=1048576] Maximum allowed body size in bytes (default 1MB)
 * @returns {Function} Express middleware function
 */
export function customJsonParser(options = {}) {
  const limitBytes = options.limitBytes || 1024 * 1024; // 1MB default

  return function middleware(req, res, next) {
    // 1. Skip methods that do not carry HTTP request bodies
    if (["GET", "HEAD", "DELETE"].includes(req.method)) {
      req.body = {};
      return next();
    }

    // 2. Validate Content-Type header
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("application/json")) {
      req.body = {};
      return next();
    }

    let accumulatedChunks = [];
    let receivedBytes = 0;

    // 3. Listen to incoming binary buffer chunks from readable socket stream
    req.on("data", (chunk) => {
      receivedBytes += chunk.length;

      // SECURITY GUARD: Payload Size Limit (DoS Protection)
      if (receivedBytes > limitBytes) {
        req.destroy(); // Terminate readable socket stream immediately
        return res.status(413).json({
          error: "Payload Too Large",
          message: `Request body exceeded maximum allowable size of ${limitBytes} bytes.`,
          statusCode: 413
        });
      }

      accumulatedChunks.push(chunk);
    });

    // 4. Listen to stream end event
    req.on("end", () => {
      // If stream was aborted due to size limit, stop processing
      if (req.destroyed) return;

      // Handle empty request body
      if (accumulatedChunks.length === 0) {
        req.body = {};
        return next();
      }

      // Reassemble raw buffers into UTF-8 text string
      const rawTextBody = Buffer.concat(accumulatedChunks).toString("utf-8");

      // SECURITY GUARD: Malformed JSON syntax handling
      try {
        // DESERIALIZATION: Wire String -> Native JavaScript Object
        req.body = JSON.parse(rawTextBody);
        next();
      } catch (syntaxError) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Invalid or malformed JSON payload structure.",
          details: syntaxError.message,
          statusCode: 400
        });
      }
    });

    // Handle stream errors
    req.on("error", (err) => {
      return res.status(500).json({
        error: "Stream Error",
        message: err.message,
        statusCode: 500
      });
    });
  };
}
