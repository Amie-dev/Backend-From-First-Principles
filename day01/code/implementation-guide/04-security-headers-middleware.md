# Implementation Guide - Chapter 04: Security Headers Middleware

## 1. Overview & Goal

HTTP headers dictate browser behavior. In this chapter, we create a defensive security middleware that automatically injects industry-standard HTTP security headers (`HSTS`, `CSP`, `X-Frame-Options`, `X-Content-Type-Options`) into every outgoing server response.

These headers instruct web browsers to enforce HTTPS, block Clickjacking iframe attacks, prevent Cross-Site Scripting (XSS), and disable MIME-type sniffing.

---

## 2. Terminal Test Command

```bash
# Send GET request and view response headers using cURL -I (headers only)
curl -I http://localhost:3000/api/v1/public
```

---

## 3. Complete Source Code: `src/middlewares/security-headers.middleware.js`

Create `day01/code/src/middlewares/security-headers.middleware.js`:

```javascript
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
```

---

## 4. Deep Code Explanation

1. **`Strict-Transport-Security` (HSTS)**:
   - `max-age=31536000`: Forces the browser to strictly use HTTPS for 1 year (31,536,000 seconds).
   - `includeSubDomains`: Applies HTTPS enforcement to all subdomains (e.g. `api.example.com`).
2. **`X-Frame-Options: DENY`**: Blocks browsers from rendering the web app inside `<iframe/>` tags, preventing Clickjacking attacks where malicious sites overlay transparent frames to steal user input.
3. **`X-Content-Type-Options: nosniff`**: Forces browsers to strictly honor the `Content-Type` declared by the server rather than attempting to guess or execute uploaded text files as JavaScript (MIME-sniffing attack vector).
4. **`Content-Security-Policy` (CSP)**:
   - `default-src 'self'`: Restricts script loading to the exact same origin domain.
   - `object-src 'none'`: Completely disables legacy Flash or Java applet plugins.
5. **`res.removeHeader("X-Powered-By")`**: Removes the `X-Powered-By: Express` header to prevent attackers from footprinting backend framework versions.
