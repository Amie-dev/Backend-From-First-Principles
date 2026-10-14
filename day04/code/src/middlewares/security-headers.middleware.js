import { config } from "../config/env.js";

/**
 * Security Headers Middleware (Stage 1 of the Ch09 pipeline — safe egress)
 *
 * Chapter Ref: Day01 Ch04 (security headers) · Day04 Ch08 (browser attack surface)
 *
 * Every header below closes a specific browser-side attack class:
 *   X-Content-Type-Options : nosniff      → blocks MIME-confusion XSS
 *   X-Frame-Options        : DENY         → blocks clickjacking (framing)
 *   Strict-Transport-Security             → forces HTTPS for a year (HSTS preload)
 *   Referrer-Policy        : no-referrer  → prevents token-in-URL leakage
 *   Permissions-Policy                    → disables unused powerful APIs
 *   Content-Security-Policy: default-src 'none' → an API returns JSON only;
 *                            anything the browser tries to execute is a bug/attack
 *   Cache-Control          : no-store     → authenticated JSON must never be
 *                            cached by proxies or the browser disk cache
 *
 * HSTS is emitted only in production: browsers ignore it over plain HTTP, and
 * sending it in local dev would pin `localhost` to HTTPS and break tooling.
 */
export function securityHeadersMiddleware(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()");

  if (config.isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  // A JSON API should never be framed, scripted, or embedded — and never cached.
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

  // Do not advertise the framework — fingerprinting the stack only helps attackers.
  res.removeHeader("X-Powered-By");

  next();
}

export default securityHeadersMiddleware;
