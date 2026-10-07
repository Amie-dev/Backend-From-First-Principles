# Chapter 06: Cross-Origin Resource Sharing (CORS)

## 1. What is Same-Origin Policy (SOP)?

The **Same-Origin Policy (SOP)** is a fundamental security model enforced by web browsers. It restricts client-side scripts (JavaScript) running on one origin from making network calls to or reading responses from a different origin.

An **Origin** is defined strictly by the tuple:
$$\text{Origin} = \{\text{Protocol (Scheme)}, \text{Domain (Host)}, \text{Port}\}$$

### Same-Origin Evaluation Matrix (Target: `http://example.com:80/app`)

| Request Target URL | Same Origin? | Reason |
| :--- | :---: | :--- |
| `http://example.com:80/api/data` | **Yes** | Protocol, Domain, and Port match. |
| `https://example.com:80/api/data` | **No** | Protocol mismatch (`https` vs `http`). |
| `http://api.example.com:80/data` | **No** | Domain mismatch (`api.example.com` vs `example.com`). |
| `http://example.com:8080/data` | **No** | Port mismatch (`8080` vs `80`). |

---

## 2. What is CORS?

**Cross-Origin Resource Sharing (CORS)** is an HTTP-header-based mechanism that allows backend servers to selectively bypass the browser's Same-Origin Policy. It permits web applications running at one origin to access authorized API resources hosted at a different origin.

---

## 3. Simple vs. Preflighted Requests

Browsers handle CORS requests in two distinct ways depending on the request method, headers, and body format.

```
                                  Is it a Simple Request?
                                /                         \
                             YES                           NO
                             /                               \
               Direct Request Sent                   Send Preflight OPTIONS Request
               (Includes Origin Header)              (Ask server for permission)
                        |                                     |
           Server returns response with             Server grants permission (204)
            Access-Control-Allow-Origin                       |
                        |                            Send Actual HTTP Request
              Browser checks header                           |
              and yields JS payload                 Browser yields JS payload
```

---

### 3.1 Simple Requests
A request is classified as **Simple** if it meets **all** of the following criteria:
1. Uses method `GET`, `HEAD`, or `POST`.
2. Contains only CORS-safelisted headers (`Accept`, `Accept-Language`, `Content-Language`, `Content-Type`).
3. `Content-Type` is strictly restricted to:
   * `application/x-www-form-urlencoded`
   * `multipart/form-data`
   * `text/plain`

*Execution Flow*: The browser sends the request immediately with an `Origin` header. If the server response contains `Access-Control-Allow-Origin` matching the request origin (or `*`), the browser passes the data to client JavaScript. Otherwise, the browser blocks the response read.

---

### 3.2 Preflighted Requests (Non-Simple)
If a request uses non-simple methods (`PUT`, `DELETE`, `PATCH`), custom headers (`Authorization`, `X-API-Key`), or `application/json` content types, the browser automatically executes an **OPTIONS Preflight Request** before the actual request.

#### Preflight Request Sent by Browser:
```http
OPTIONS /api/v1/users/42 HTTP/1.1\r\n
Host: api.example.com\r\n
Origin: https://frontend.example.com\r\n
Access-Control-Request-Method: PUT\r\n
Access-Control-Request-Headers: authorization, content-type\r\n
\r\n
```

#### Preflight Response Returned by Server:
```http
HTTP/1.1 204 No Content\r\n
Access-Control-Allow-Origin: https://frontend.example.com\r\n
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n
Access-Control-Allow-Headers: Authorization, Content-Type\r\n
Access-Control-Allow-Credentials: true\r\n
Access-Control-Max-Age: 86400\r\n
\r\n
```

---

## 4. JavaScript Pseudocode: Express/Connect CORS Middleware

```javascript
// ==============================================================================
// JavaScript / Node.js Production-Grade CORS Preflight & Origin Middleware
// ==============================================================================

function createCorsMiddleware(options = {}) {
  const allowedOrigins = options.allowedOrigins || [];
  const allowedMethods = options.allowedMethods || ["GET", "POST", "PUT", "DELETE", "OPTIONS"];
  const allowedHeaders = options.allowedHeaders || ["Authorization", "Content-Type"];
  const maxAge = options.maxAge || 86400;

  return function corsMiddleware(req, res, next) {
    const origin = req.headers["origin"];

    const isAllowed = allowedOrigins.includes(origin) || allowedOrigins.includes("*");

    if (origin && isAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    // 1. Intercept Preflight OPTIONS Request
    if (req.method === "OPTIONS") {
      if (!isAllowed) {
        return res.status(403).json({ error: "CORS Origin Denied" });
      }

      res.setHeader("Access-Control-Allow-Methods", allowedMethods.join(", "));
      res.setHeader("Access-Control-Allow-Headers", allowedHeaders.join(", "));
      res.setHeader("Access-Control-Max-Age", maxAge.toString());

      // 204 No Content response for successful preflight check
      return res.status(204).end();
    }

    next();
  };
}

// Integration Test Simulation
const corsMiddleware = createCorsMiddleware({
  allowedOrigins: ["https://dashboard.example.com"],
  allowedMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"]
});

const mockPreflightReq = {
  method: "OPTIONS",
  headers: {
    origin: "https://dashboard.example.com",
    "access-control-request-method": "PUT"
  }
};

const mockRes = {
  statusCode: 200,
  headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(code) { this.statusCode = code; return this; },
  end() { console.log(`[CORS Preflight Handled] Status: ${this.statusCode}`, this.headers); },
  json(body) { console.log(`[CORS Denied] Status: ${this.statusCode}`, body); }
};

corsMiddleware(mockPreflightReq, mockRes, () => {
  console.log("Passed to main route handler");
});
```

---

## 5. Key Takeaways

1. **Same-Origin Policy** is enforced by *browsers*, not by backend servers.
2. **CORS** allows servers to grant cross-origin access using `Access-Control-*` HTTP headers.
3. Requests using custom headers or JSON content types trigger an **automatic `OPTIONS` preflight request** before the main request.
4. Preflight responses can be cached via `Access-Control-Max-Age` to reduce preflight round-trip overhead.
