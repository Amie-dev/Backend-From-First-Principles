/**
 * Security Headers Enforcement Middleware
 * Injects defensive HTTP security headers into every outgoing response
 * to mitigate XSS, Clickjacking, and MIME-sniffing vulnerabilities.
 */
export function securityHeadersMiddleware(req, res, next) {
  // 1. Force HTTPS connections for 1 year including subdomains (HSTS)
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );

  // 2. Prevent page from being embedded inside iframe (Clickjacking defense)
  res.setHeader("X-Frame-Options", "DENY");

  // 3. Prevent browser from sniffing content types away from declared Content-Type
  res.setHeader("X-Content-Type-Options", "nosniff");

  // 4. Enforce strict Content-Security-Policy (CSP)
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none';"
  );

  // 5. Hide Express server header to reduce fingerprinting
  res.removeHeader("X-Powered-By");

  next();
}
