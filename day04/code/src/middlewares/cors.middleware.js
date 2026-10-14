import { config, logger } from "../config/env.js";

/**
 * CORS Middleware — Same-Origin Policy relaxation, implemented from first principles
 *
 * Chapter Ref: Day01 Ch06 (CORS & SOP) · Day04 Ch08 (least-privilege egress)
 *
 * Why hand-rolled instead of the `cors` package?
 *   The whole repository is built "from first principles" — this module shows the
 *   exact protocol mechanics (Origin echo, Vary correctness, preflight short
 *   circuit, credentialed-request rules) rather than hiding them behind a library.
 *
 * Security decisions (all env-driven via src/config/env.js):
 *  1. Allow-list only. Deep wildcards (`https://*.example.com`) are matched with
 *     an anchored regex — never a naive `endsWith`, which `evil-example.com`
 *     would defeat.
 *  2. `Access-Control-Allow-Origin` is NEVER `*` when credentials are enabled
 *     (the Fetch spec forbids it); the concrete Origin is echoed instead.
 *  3. `Vary: Origin` is always emitted so shared caches/CDNs cannot serve one
 *     origin's CORS headers to another origin.
 *  4. Preflight (`OPTIONS` + `Access-Control-Request-Method`) is answered with
 *     204 and never reaches the auth pipeline — no token is required to discover
 *     the policy, which is exactly what the browser needs.
 *  5. A request from a disallowed origin is NOT rejected server-side: browsers
 *     already block the response. Rejecting would break same-origin and
 *     server-to-server callers that happen to send an `Origin` header.
 *
 * @param {object}   [options]
 * @param {string[]} [options.origins]      Allowed origins (or ["*"])
 * @param {boolean}  [options.credentials]  Allow cookies/Authorization cross-origin
 * @returns {import("express").RequestHandler}
 */
export function createCorsMiddleware(options = {}) {
  const allowedOrigins = Object.freeze(options.origins ?? config.cors.origins);
  const allowCredentials = options.credentials ?? config.cors.credentials;
  const allowedMethods = options.methods ?? config.cors.methods;
  const allowedHeaders = options.allowedHeaders ?? config.cors.allowedHeaders;
  const exposedHeaders = options.exposedHeaders ?? config.cors.exposedHeaders;
  const maxAgeSeconds = options.maxAgeSeconds ?? config.cors.maxAgeSeconds;

  const allowAnyOrigin = allowedOrigins.includes("*");

  // Pre-compile wildcard patterns once at boot (hot path stays allocation-free).
  // A pattern like `https://*.example.com` must NOT be matched with endsWith() —
  // `https://evil-example.com` would sail through. Escape every regex
  // metacharacter first, then translate the escaped `\*` into "one label".
  const compiledPatterns = allowedOrigins
    .filter((o) => o !== "*" && o.includes("*"))
    .map((pattern) => {
      const escaped = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // escape ALL regex metacharacters
        .replace(/\\\*/g, "[^.]+");             // '\*' → one or more non-dot chars
      return new RegExp(`^${escaped}$`, "i");
    });

  const literalOrigins = new Set(
    allowedOrigins.filter((o) => o !== "*" && !o.includes("*")).map((o) => o.toLowerCase())
  );

  /**
   * Resolve the value to echo in `Access-Control-Allow-Origin`.
   * @param {string|undefined} origin
   * @returns {string|null} null → origin not permitted
   */
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

    // Caches must key on Origin whenever the response varies by origin.
    res.append("Vary", "Origin");
    if (isPreflight) res.append("Vary", "Access-Control-Request-Method");

    if (allowOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowOrigin);
      if (allowCredentials) {
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
      if (exposedHeaders.length > 0) {
        res.setHeader("Access-Control-Expose-Headers", exposedHeaders.join(", "));
      }
    }

    if (req.method !== "OPTIONS") return next();

    // ── Preflight ─────────────────────────────────────────────────────────────
    if (isPreflight) {
      if (!allowOrigin) {
        logger.warn("CORS preflight denied", {
          origin,
          requestedMethod: req.headers["access-control-request-method"],
          path: req.path,
        });
        return res.status(403).json({
          error: {
            code: "CORS_ORIGIN_DENIED",
            message: `Origin '${origin}' is not allowed by the CORS policy`,
            status: 403,
          },
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
