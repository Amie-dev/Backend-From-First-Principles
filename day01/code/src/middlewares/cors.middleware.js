/**
 * Custom CORS Middleware with OPTIONS Preflight Handling
 * Controls cross-origin resource sharing according to Same-Origin Policy rules.
 */
export function createCorsMiddleware(options = {}) {
  const allowedOrigins = options.allowedOrigins || ["*"];
  const allowedMethods = options.allowedMethods || ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
  const allowedHeaders = options.allowedHeaders || ["Authorization", "Content-Type", "X-Requested-With", "Accept"];
  const maxAge = options.maxAge || 86400; // 24 hours preflight cache

  return function corsMiddleware(req, res, next) {
    const origin = req.headers["origin"];

    const isOriginAllowed = allowedOrigins.includes("*") || (origin && allowedOrigins.includes(origin));

    if (origin && isOriginAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    // Handle OPTIONS Preflight Requests
    if (req.method === "OPTIONS") {
      if (!isOriginAllowed) {
        return res.status(403).json({ error: "CORS Origin Denied" });
      }

      res.setHeader("Access-Control-Allow-Methods", allowedMethods.join(", "));
      res.setHeader("Access-Control-Allow-Headers", allowedHeaders.join(", "));
      res.setHeader("Access-Control-Max-Age", maxAge.toString());

      // Preflight responses return 204 No Content
      return res.status(204).end();
    }

    next();
  };
}
