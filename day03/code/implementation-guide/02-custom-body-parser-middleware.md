# Implementation Guide 02: First-Principles Custom JSON Body Parser

## 1. Architectural Concept

Instead of relying on black-box external packages (`express.json()`), this implementation builds a custom JSON body parser middleware from first principles by consuming raw Node.js HTTP readable streams.

Key security requirements addressed:
1. **Payload Byte Limit Enforcement**: Prevents Denial of Service (DoS) memory exhaustion by tracking incoming bytes and calling `req.destroy()` if limits are exceeded.
2. **Malformed JSON Handling**: Prevents server event loop crashes by catching `SyntaxError` during `JSON.parse()` and returning `400 Bad Request`.
3. **Content-Type Validation**: Validates `application/json` headers before attempting to parse.

---

## 2. Code Implementation (`src/middlewares/json-body-parser.middleware.js`)

```javascript
export function customJsonParser(options = {}) {
  const limitBytes = options.limitBytes || 1024 * 1024; // 1MB default

  return function middleware(req, res, next) {
    if (["GET", "HEAD", "DELETE"].includes(req.method)) {
      req.body = {};
      return next();
    }

    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("application/json")) {
      req.body = {};
      return next();
    }

    let accumulatedChunks = [];
    let receivedBytes = 0;

    // Stream event: Receive binary buffer chunks
    req.on("data", (chunk) => {
      receivedBytes += chunk.length;

      // DoS Protection: Terminate socket if payload size exceeds limit
      if (receivedBytes > limitBytes) {
        req.destroy();
        return res.status(413).json({
          error: "Payload Too Large",
          message: `Request body exceeded maximum allowable size of ${limitBytes} bytes.`
        });
      }

      accumulatedChunks.push(chunk);
    });

    // Stream event: Complete reassembly & deserialization
    req.on("end", () => {
      if (req.destroyed) return;
      if (accumulatedChunks.length === 0) {
        req.body = {};
        return next();
      }

      const rawTextBody = Buffer.concat(accumulatedChunks).toString("utf-8");

      try {
        req.body = JSON.parse(rawTextBody);
        next();
      } catch (syntaxError) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Invalid or malformed JSON payload structure.",
          details: syntaxError.message
        });
      }
    });
  };
}
```

---

## 3. Running Standalone Demonstration

Run the standalone demonstration script to test valid, malformed, and payload-limit scenario behaviors:

```bash
npm run raw-parser
```

### Expected Test Output:
```text
--- Sending Test: [Valid JSON] ---
HTTP Status : 200
Response    : {"message":"Successfully parsed JSON body!","receivedData":{"name":"Alice","role":"Developer"}}

--- Sending Test: [Malformed JSON] ---
HTTP Status : 400
Response    : {"error":"Bad Request","message":"Invalid or malformed JSON payload structure."}

--- Sending Test: [Payload Too Large (>100b)] ---
HTTP Status : 413
Response    : {"error":"Payload Too Large","message":"Request body exceeded maximum allowable size of 100 bytes."}
```
