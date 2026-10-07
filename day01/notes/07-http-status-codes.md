# Chapter 07: Standardized HTTP Status Codes

## 1. Status Code Architecture

HTTP Status Codes are **3-digit integers** returned by servers to inform clients about the outcome of their request. The first digit dictates the status category.

```
+--------------------------------------------------------------------+
|                      HTTP Status Code Ranges                       |
+--------------------------------------------------------------------+
| 1xx | Informational | Request received, continuing process           |
| 2xx | Success       | Action successfully received & accepted       |
| 3xx | Redirection   | Further action needed to complete request     |
| 4xx | Client Error  | Request contains bad syntax or illegal access |
| 5xx | Server Error  | Server failed to fulfill valid request        |
+--------------------------------------------------------------------+
```

---

## 2. In-Depth Reference Guide

### 2.1 1xx Informational
* **`100 Continue`**: Server received request headers. Client can proceed to upload a large payload body (used with `Expect: 100-continue`).
* **`101 Switching Protocols`**: Server agrees to upgrade connection protocol (e.g., upgrading HTTP/1.1 to WebSockets).

---

### 2.2 2xx Success
* **`200 OK`**: Standard successful response for `GET`, `PUT`, or `PATCH` requests.
* **`201 Created`**: Request succeeded and a new resource was created. Should include a `Location` header pointing to the new resource URI.
* **`202 Accepted`**: Request accepted for async background processing (e.g., job queued, not yet completed).
* **`204 No Content`**: Request succeeded, but response intentionally contains no body payload (used in `DELETE` or `OPTIONS`).

---

### 2.3 3xx Redirection
* **`301 Moved Permanently`**: Resource moved to a new permanent URI. Search engine crawlers update indexing automatically.
* **`302 Found`**: Temporary redirect.
* **`304 Not Modified`**: Tells client that cached local copy is still fresh and valid (sent during conditional `If-None-Match` requests).
* **`307 Temporary Redirect` / `308 Permanent Redirect`**: Guarantees that the client does **not** change the HTTP method on redirect (unlike `301`/`302` which sometimes switch `POST` to `GET`).

---

### 2.4 4xx Client Errors
* **`400 Bad Request`**: Malformed request syntax, invalid JSON payload, or schema validation failure.
* **`401 Unauthorized`**: Authentication missing or token invalid. Should include `WWW-Authenticate` header.
* **`403 Forbidden`**: Client is authenticated, but lacks sufficient permissions/scopes to access the resource.
* **`404 Not Found`**: Target URI does not exist on the server.
* **`405 Method Not Allowed`**: Request method is not supported for target URI (e.g., sending `POST` to a read-only endpoint).
* **`409 Conflict`**: Request violates state constraints (e.g., registering an email that already exists in DB).
* **`422 Unprocessable Entity`**: Request format is correct, but payload contains logical business rule errors.
* **`429 Too Many Requests`**: Client exceeded rate limits. Accompanied by a `Retry-After` header.

---

### 2.5 5xx Server Errors
* **`500 Internal Server Error`**: Generic unhandled exception or crash in backend application logic.
* **`501 Not Implemented`**: Server does not support functionality required to fulfill request.
* **`502 Bad Gateway`**: Reverse proxy (e.g., Nginx, Envoy) received an invalid/corrupt response from upstream application server.
* **`503 Service Unavailable`**: Server is down due to maintenance or extreme traffic overload.
* **`504 Gateway Timeout`**: Reverse proxy timed out waiting for upstream application server to finish processing.

---

## 3. Status Code Selection Flowchart

```
                          [Request Received]
                                  |
                      Did Server Encounter Exception?
                             /          \
                           YES           NO
                           /              \
                  Is it Proxy/Server?    Is Resource Modifying?
                    /            \          /           \
                 [502/504]      [500]     YES            NO
                                          /               \
                                   Was New Entity      Is Data Returned?
                                     Created?             /         \
                                      /    \            YES          NO
                                    YES     NO           |           |
                                     |       |         [200]       [204]
                                   [201]   [200]
```

---

## 4. JavaScript Pseudocode: Centralized Express Error Handling Middleware

```javascript
// ==============================================================================
// JavaScript / Node.js Centralized Error Middleware mapping custom exceptions to HTTP status codes
// ==============================================================================

class APIError extends Error {
  constructor(statusCode, message, errorCode = "API_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

class UnauthorizedError extends APIError {
  constructor(message = "Authentication required") {
    super(401, message, "UNAUTHORIZED");
  }
}

class ForbiddenError extends APIError {
  constructor(message = "Insufficient permissions") {
    super(403, message, "FORBIDDEN");
  }
}

class ConflictError extends APIError {
  constructor(message = "Resource state conflict") {
    super(409, message, "DUPLICATE_ENTITY");
  }
}

// Global Express Error Middleware (4 parameters)
function globalErrorHandler(err, req, res, next) {
  if (err instanceof APIError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.errorCode,
        message: err.message,
        status: err.statusCode
      }
    });
  }

  // Catch unhandled system exceptions (500 Internal Server Error)
  console.error("[CRITICAL UNHANDLED CRASH]", err);
  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred on the server.",
      status: 500
    }
  });
}

// Integration Test Simulation
const mockRes = {
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { console.log(`[HTTP ${this.statusCode} Response]`, body); }
};

// 1. Handling 403 Forbidden
globalErrorHandler(new ForbiddenError("Access restricted to Admins"), {}, mockRes, null);

// 2. Handling 500 Unhandled Exception
globalErrorHandler(new TypeError("Cannot read property 'id' of undefined"), {}, mockRes, null);
```

---

## 5. Key Takeaways

1. **2xx status codes** signal successful execution; `201` denotes entity creation, `204` denotes no returned payload.
2. **4xx status codes** represent client-side errors (`401` = unauthenticated, `403` = unauthorized, `409` = duplicate conflict).
3. **5xx status codes** represent server failures; `502` and `504` indicate gateway/proxy failure communicating with upstream servers.
4. Using explicit HTTP status codes makes APIs **predictable and self-documenting**.
