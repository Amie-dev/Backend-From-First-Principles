# Implementation Guide - Chapter 05: CORS & Preflight `OPTIONS` Middleware

## 1. Overview & Goal

Browsers enforce the **Same-Origin Policy (SOP)**, blocking client scripts on `http://frontend.com` from accessing resources on `http://api.com`. **CORS (Cross-Origin Resource Sharing)** is a mechanism using HTTP headers that lets backend servers safely bypass SOP.

Non-simple requests (like `POST`/`PUT` with JSON or custom headers) trigger an automatic browser **`OPTIONS` Preflight Request**. In this chapter, we build a custom CORS middleware to handle origin validation and preflight responses (`204 No Content`).

---

## 2. Terminal Test Command

```bash
# Simulate a browser OPTIONS preflight request using cURL
curl -v -X OPTIONS http://localhost:3000/api/v1/users \
     -H "Origin: https://frontend-app.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Authorization, Content-Type"
```

---

## 3. Complete Source Code: `src/middlewares/cors.middleware.js`

Create `day01/code/src/middlewares/cors.middleware.js`:

```javascript
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
```

---

## 4. Deep Code Explanation

1. **`req.headers["origin"]`**: Browser automatically attaches the `Origin` header to cross-origin requests.
2. **`Access-Control-Allow-Origin`**: Server echoes back the allowed origin. Browser checks this header before permitting JavaScript to read response data.
3. **`req.method === "OPTIONS"`**: Identifies preflight checks issued by browsers before executing non-simple operations.
4. **Preflight Header Configuration**:
   - `Access-Control-Allow-Methods`: Informs browser which HTTP verbs are permitted (`GET`, `POST`, `PUT`, `DELETE`).
   - `Access-Control-Allow-Headers`: Informs browser which request headers can be transmitted (e.g., `Authorization`, `Content-Type`).
   - `Access-Control-Max-Age: 86400`: Instructs the browser to cache the preflight result for 24 hours, avoiding repeated `OPTIONS` overhead for subsequent calls.
5. **`res.status(204).end()`**: Preflight responses contain no payload body, returning `204 No Content`.
