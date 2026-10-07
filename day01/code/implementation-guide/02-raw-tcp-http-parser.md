# Implementation Guide - Chapter 02: Raw TCP Socket HTTP Server

## 1. Overview & Goal

Before using higher-level frameworks like Express, backend engineers must understand how HTTP operates at the transport layer. In this chapter, we build a **raw TCP HTTP server** from first principles using Node.js's native `net` module (without Express).

We manually inspect incoming TCP byte buffers, locate the double CRLF (`\r\n\r\n`) header boundary, parse the request start-line, construct a header dictionary, and format raw HTTP response bytes.

---

## 2. Terminal Run & Test Commands

```bash
# Start raw TCP server
npm run raw-server

# Test in a separate terminal using cURL
curl -v http://localhost:8080/test-raw-parser
```

---

## 3. Complete Source Code: `src/raw-http-server.js`

Create `day01/code/src/raw-http-server.js`:

```javascript
/**
 * First-Principles Raw TCP HTTP Server (No Frameworks)
 * Demonstrates low-level parsing of raw HTTP/1.1 bytes over TCP sockets.
 * Highlights: Start-line parsing, Header dictionary extraction, CRLF CRLF delimiter detection.
 */

import net from "net";

const PORT = 8080;

const server = net.createServer((socket) => {
  console.log(`[Raw TCP Server] New client connection from ${socket.remoteAddress}:${socket.remotePort}`);

  let buffer = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    // Search for double CRLF (\r\n\r\n) marking end of HTTP headers
    const delimiterIndex = buffer.indexOf("\r\n\r\n");

    if (delimiterIndex !== -1) {
      const headerText = buffer.slice(0, delimiterIndex).toString("ascii");
      const bodyBuffer = buffer.slice(delimiterIndex + 4);

      console.log("\n================ RAW HTTP REQUEST RECEIVED ================");
      console.log(headerText);
      console.log("===========================================================\n");

      // Parse headers
      const lines = headerText.split("\r\n");
      const [method, path, version] = lines[0].split(" ");

      const headers = {};
      for (let i = 1; i < lines.length; i++) {
        const colonIndex = lines[i].indexOf(":");
        if (colonIndex !== -1) {
          const key = lines[i].slice(0, colonIndex).trim().toLowerCase();
          const val = lines[i].slice(colonIndex + 1).trim();
          headers[key] = val;
        }
      }

      // Construct HTTP/1.1 Response
      const responseBody = JSON.stringify({
        server: "First-Principles Raw TCP Node Server",
        parsedMethod: method,
        parsedPath: path,
        parsedVersion: version,
        clientHeadersCount: Object.keys(headers).length,
        receivedBody: bodyBuffer.toString("utf-8")
      });

      const responseBodyBuffer = Buffer.from(responseBody, "utf-8");

      const responseHeader =
        `HTTP/1.1 200 OK\r\n` +
        `Date: ${new Date().toUTCString()}\r\n` +
        `Content-Type: application/json; charset=utf-8\r\n` +
        `Content-Length: ${responseBodyBuffer.length}\r\n` +
        `Connection: close\r\n` +
        `Server: RawTcpSocketServer/1.0\r\n` +
        `\r\n`;

      socket.write(Buffer.concat([Buffer.from(responseHeader, "ascii"), responseBodyBuffer]));
      socket.end();
    }
  });

  socket.on("error", (err) => {
    console.error("[Raw Socket Error]", err.message);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Raw TCP HTTP Server running on http://localhost:${PORT}`);
  console.log(`Test with: curl -v http://localhost:${PORT}/raw-test`);
});
```

---

## 4. Deep Code Explanation

1. **`net.createServer((socket) => { ... })`**: Opens a raw Layer 4 TCP listener socket. Unlike Express which provides high-level `req` and `res` objects, `net` provides raw incoming binary streams.
2. **`Buffer.concat([buffer, chunk])`**: TCP streams deliver data in unpredictable chunk sizes. We append incoming chunks into a unified byte buffer.
3. **`buffer.indexOf("\r\n\r\n")`**: Locates the double Carriage Return Line Feed (`0x0D 0x0A 0x0D 0x0A`). In HTTP specification (RFC 7230), `\r\n\r\n` is the mandatory delimiter separating header metadata from payload bytes.
4. **`lines[0].split(" ")`**: Extracts the three components of the Request Line: Method (`GET`), URI (`/raw-test`), and Protocol Version (`HTTP/1.1`).
5. **`lines[i].slice(...)`**: Iterates line-by-line, splitting on the first colon `:` to construct a normalized key-value header dictionary.
6. **Response Serialization**:
   - `Content-Length`: We compute the exact byte length of `responseBodyBuffer` so the client browser knows how many bytes to read.
   - Double `\r\n` at the end of responseHeader signals the end of response headers before sending the body payload bytes.
   - `socket.end()` gracefully closes the TCP connection after transmitting the byte buffer.
