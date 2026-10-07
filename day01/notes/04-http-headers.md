# Chapter 04: HTTP Headers & Metadata Control

## 1. Understanding HTTP Headers

HTTP Headers are key-value pairs separated by colons (`Key: Value`) transmitted in HTTP requests and responses. They act as **metadata** describing the payload, context, client environment, and server instructions. Headers make HTTP flexible, extensible, and configurable.

```http
Header-Name: Header-Value\r\n
```

---

## 2. Categories of HTTP Headers

Headers are grouped into four primary functional categories based on their role:

```
                          +-------------------------+
                          |   HTTP Header Categories|
                          +-------------------------+
                                       |
    +------------------+---------------+---------------+-------------------+
    |                  |                               |                   |
    v                  v                               v                   v
[Request Headers]   [General Headers]     [Representation Headers]   [Security Headers]
(Client Context)    (Both Req & Res)      (Payload Description)      (Browser Security)
```

---

### 2.1 Request Headers
Sent exclusively by the client to provide request context, credentials, and client capabilities.

| Header | Description & Example |
| :--- | :--- |
| `Host` | Domain name of the target server. Mandatory in HTTP/1.1 for virtual hosting (`Host: api.example.com`). |
| `User-Agent` | Identifies the client application, operating system, and browser version (`User-Agent: Mozilla/5.0...`). |
| `Authorization` | Authentication credentials for the target resource (`Authorization: Bearer <jwt_token>`). |
| `Cookie` | Previously stored HTTP cookies sent back to the server (`Cookie: session_id=xyz123; theme=dark`). |
| `Referer` | Absolute URL of the webpage that initiated the request (`Referer: https://example.com/checkout`). |

---

### 2.2 General Headers
Apply to both request and response messages but are independent of the payload body data.

| Header | Description & Example |
| :--- | :--- |
| `Date` | Timestamp when the message was originated (`Date: Wed, 07 Oct 2026 14:30:00 GMT`). |
| `Connection` | Controls whether the network connection stays open (`Connection: keep-alive` vs `close`). |
| `Cache-Control` | Directives for caching mechanisms in browsers and CDNs (`Cache-Control: no-cache, no-store`). |

---

### 2.3 Representation (Entity) Headers
Describe the specific format, encoding, size, and representation of the HTTP message body payload.

| Header | Description & Example |
| :--- | :--- |
| `Content-Type` | Indicates the media type (MIME type) of the payload body (`Content-Type: application/json; charset=utf-8`). |
| `Content-Length` | Exact size of the message body in bytes (`Content-Length: 1024`). |
| `Content-Encoding` | Compression algorithm applied to the body payload (`Content-Encoding: gzip` or `br`). |
| `Content-Language` | Natural language of the intended audience (`Content-Language: en-US`). |

---

### 2.4 Security Headers
Instruct web browsers to enforce strict security constraints to mitigate common web application vulnerabilities.

| Security Header | Purpose & Protection |
| :--- | :--- |
| `Strict-Transport-Security` (HSTS) | Forces browsers to strictly communicate over encrypted HTTPS connections (`max-age=31536000; includeSubDomains`). |
| `Content-Security-Policy` (CSP) | Restricts the sources from which scripts, images, and stylesheets can be loaded, preventing **Cross-Site Scripting (XSS)**. |
| `X-Frame-Options` | Prevents the page from being embedded inside `<iframe/>` tags, stopping **Clickjacking** attacks (`X-Frame-Options: DENY`). |
| `X-Content-Type-Options` | Prevents browsers from guessing (sniffing) content types (`X-Content-Type-Options: nosniff`). |
| `Set-Cookie` Flags | Secures cookies: `HttpOnly` (blocks JavaScript access), `Secure` (HTTPS only), `SameSite=Strict` (prevents CSRF). |

---

## 3. JavaScript Pseudocode: Express Security Headers Middleware

```javascript
// ==============================================================================
// JavaScript / Node.js Express Security Headers Middleware
// Automatically injects defensive HTTP security headers into every outgoing response
// ==============================================================================

function securityHeadersMiddleware(req, res, next) {
  // 1. Force HTTPS for 1 year including subdomains (HSTS)
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );

  // 2. Prevent clickjacking by disallowing framing
  res.setHeader("X-Frame-Options", "DENY");

  // 3. Prevent MIME-type sniffing vulnerabilities
  res.setHeader("X-Content-Type-Options", "nosniff");

  // 4. Enforce strict Content Security Policy (CSP)
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://trusted-cdn.com; object-src 'none';"
  );

  // 5. Intercept Set-Cookie headers to append security flags
  const originalSetHeader = res.setHeader;
  res.setHeader = function (name, value) {
    if (name.toLowerCase() === "set-cookie") {
      const secureValue = Array.isArray(value)
        ? value.map((v) => `${v}; Secure; HttpOnly; SameSite=Strict`)
        : `${value}; Secure; HttpOnly; SameSite=Strict`;
      return originalSetHeader.call(this, name, secureValue);
    }
    return originalSetHeader.call(this, name, value);
  };

  next();
}

// Simulated Connect/Express application invocation test
const mockReq = { headers: {} };
const mockRes = {
  headers: {},
  setHeader(key, val) {
    this.headers[key] = val;
  }
};

securityHeadersMiddleware(mockReq, mockRes, () => {
  mockRes.setHeader("Set-Cookie", "session_token=xyz987");
});

console.log("Injected Security Headers:");
console.log(mockRes.headers);
```

---

## 4. Key Takeaways

1. Headers are essential **metadata descriptors** for requests, responses, and network execution context.
2. Representation headers (`Content-Type`, `Content-Length`, `Content-Encoding`) tell the receiving endpoint **how to parse byte payloads**.
3. **Security Headers** (`HSTS`, `CSP`, `X-Frame-Options`, `Set-Cookie` flags) are mandatory defenses for modern web API backends.
