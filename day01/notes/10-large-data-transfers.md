# Chapter 10: Handling Large Data Transfers

## 1. The Challenge of Large Payload Transfers

Standard JSON HTTP request/response payloads load the entire body into server RAM before processing. This approach fails when handling large file uploads (e.g., 2GB video uploads) or continuous data downloads:

1. **Memory Exhaustion (OOM)**: Reading a 5GB file into an in-memory buffer crashes the application server.
2. **Base64 Overhead**: Encoding binary files into JSON strings inflates payload size by ~33%.
3. **HTTP Timeouts**: Slow clients uploading large payloads in a single block trigger request timeout errors.

---

## 2. Large Client Uploads: `multipart/form-data`

To stream large binary files without memory bloat, HTTP uses `multipart/form-data`.

### 2.1 Multipart Layout Anatomy
The request header specifies a unique, random **boundary delimiter string**:

```http
POST /api/v1/upload HTTP/1.1\r\n
Host: storage.example.com\r\n
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW\r\n
Content-Length: 354\r\n
\r\n
------WebKitFormBoundary7MA4YWxkTrZu0gW\r\n
Content-Disposition: form-data; name="username"\r\n
\r\n
johndoe\r\n
------WebKitFormBoundary7MA4YWxkTrZu0gW\r\n
Content-Disposition: form-data; name="avatar"; filename="photo.png"\r\n
Content-Type: image/png\r\n
\r\n
[RAW BINARY BYTES OF IMAGE HERE]\r\n
------WebKitFormBoundary7MA4YWxkTrZu0gW--\r\n
```

```
+-------------------------------------------------------------------------+
| `--boundary_string`                                                     |
| Content-Disposition: form-data; name="title"                            |
|                                                                         |
| Video Title                                                             |
+-------------------------------------------------------------------------+
| `--boundary_string`                                                     |
| Content-Disposition: form-data; name="file"; filename="video.mp4"       |
| Content-Type: video/mp4                                                 |
|                                                                         |
| <Streamed Chunk 1> <Streamed Chunk 2> <Streamed Chunk 3> ...            |
+-------------------------------------------------------------------------+
| `--boundary_string--`  (Closing boundary)                               |
+-------------------------------------------------------------------------+
```

---

## 3. Large Server Downloads: Streaming & Server-Sent Events (SSE)

### 3.1 Chunked Transfer Encoding (`Transfer-Encoding: chunked`)
When the total size of a generated response body is unknown in advance, the server omits `Content-Length` and streams data chunks using hex-formatted length prefixes.

```http
HTTP/1.1 200 OK\r\n
Content-Type: text/plain\r\n
Transfer-Encoding: chunked\r\n
\r\n
7\r\n        <-- 7 bytes in hex
Chunk 1\r\n
6\r\n        <-- 6 bytes in hex
Chunk2\r\n
0\r\n        <-- 0 bytes (signals end of stream)
\r\n
```

---

### 3.2 Server-Sent Events (SSE / `text/event-stream`)
Used for real-time streaming updates over standard HTTP persistent connections.

```http
HTTP/1.1 200 OK\r\n
Content-Type: text/event-stream\r\n
Cache-Control: no-cache\r\n
Connection: keep-alive\r\n
\r\n
event: progress\r\n
data: {"bytes_processed": 1024, "percent": 10}\r\n
\r\n
event: progress\r\n
data: {"bytes_processed": 2048, "percent": 20}\r\n
\r\n
```

---

## 4. JavaScript Pseudocode: Node.js Streaming Multipart & SSE Handlers

```javascript
// ==============================================================================
// JavaScript / Node.js Streaming Multipart Upload & Server-Sent Events (SSE)
// ==============================================================================

const fs = require("fs");
const http = require("http");

// ------------------------------------------------------------------------------
// 1. STREAMING FILE UPLOAD PARSER ALGORITHM
// Streams incoming HTTP request bytes directly to disk via Streams
// ------------------------------------------------------------------------------
function handleStreamingFileUpload(req, res) {
  const writeStream = fs.createWriteStream("/tmp/uploaded_file.bin");

  // Pipe incoming network socket stream directly to disk stream (Low RAM usage)
  req.pipe(writeStream);

  req.on("data", (chunk) => {
    console.log(`[STREAMING UPLOAD] Received chunk of ${chunk.length} bytes`);
  });

  writeStream.on("finish", () => {
    console.log("[STREAMING UPLOAD] File successfully written to disk.");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "success", message: "File uploaded" }));
  });

  req.on("error", (err) => {
    console.error("[UPLOAD ERROR]", err);
    res.writeHead(500);
    res.end("Upload failed");
  });
}

// ------------------------------------------------------------------------------
// 2. SERVER-SENT EVENTS (SSE) EVENT STREAMER HANDLER
// Streams real-time progress events over persistent connection
// ------------------------------------------------------------------------------
function handleServerSentEventsStream(req, res) {
  // Set SSE Headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

  let percent = 0;
  
  // Periodically send event chunks
  const timer = setInterval(() => {
    percent += 25;

    // Format: event: <type>\ndata: <json>\n\n
    res.write(`event: progress\n`);
    res.write(`data: ${JSON.stringify({ percent })}\n\n`);

    console.log(`[SSE STREAMED] Progress event ${percent}% delivered`);

    if (percent >= 100) {
      clearInterval(timer);
      res.write(`event: complete\ndata: {"status": "finished"}\n\n`);
      res.end();
    }
  }, 200);

  req.on("close", () => {
    clearInterval(timer);
    console.log("[SSE CLIENT DISCONNECTED]");
  });
}
```

---

## 5. Key Takeaways

1. Standard JSON payloads cause **Out-Of-Memory (OOM)** failures for large file operations.
2. `multipart/form-data` uses custom **boundary strings** to separate binary file chunks.
3. `Transfer-Encoding: chunked` streams data without declaring a fixed `Content-Length`.
4. `text/event-stream` (SSE) provides a persistent channel for **real-time backend-to-frontend streaming**.
