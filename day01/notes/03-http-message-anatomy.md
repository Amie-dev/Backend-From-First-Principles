# Chapter 03: Anatomy of HTTP Messages

## 1. Structure of HTTP Protocol Messages

HTTP communication consists of plain-text or binary-framed messages passed between clients and servers. Understanding the raw structure of these messages is essential for low-level network programming, building custom web servers in Node.js, and debugging API behavior.

Every HTTP message follows a strict 4-part layout:
1. **Start Line**: Defines the message intent (Request line or Response status line).
2. **HTTP Headers**: Key-value metadata pairs.
3. **Empty Line (`\r\n`)**: A mandatory Carriage Return Line Feed sequence (`CRLF`) marking the exact boundary between headers and body.
4. **Message Body** *(Optional)*: Payload containing raw data (JSON, HTML, binary files).

---

## 2. HTTP Request Message Structure

An HTTP Request is sent by a client to invoke an operation or fetch a resource.

### 2.1 Request Line Syntax
```text
[METHOD] [REQUEST-URI] [HTTP-VERSION]\r\n
```
* **Method**: Semantic verb (e.g., `GET`, `POST`, `PUT`, `DELETE`).
* **Request URI**: The target path and optional query parameters (e.g., `/api/v1/users?page=2`).
* **HTTP Version**: Protocol identifier (e.g., `HTTP/1.1`).

### 2.2 Complete Raw Request Example
```http
POST /api/v1/users HTTP/1.1\r\n
Host: api.example.com\r\n
User-Agent: Mozilla/5.0 (X11; Linux x86_64)\r\n
Content-Type: application/json\r\n
Content-Length: 42\r\n
Authorization: Bearer eyJhbGciOiJIUzI1Ni...
Accept: application/json\r\n
\r\n
{"username": "johndoe", "email": "john@example.com"}
```

---

## 3. HTTP Response Message Structure

An HTTP Response is sent by the server acknowledging the request and delivering results.

### 3.1 Status Line Syntax
```text
[HTTP-VERSION] [STATUS-CODE] [REASON-PHRASE]\r\n
```
* **HTTP Version**: Protocol identifier (e.g., `HTTP/1.1`).
* **Status Code**: 3-digit numeric code indicating outcome (e.g., `200`, `404`, `500`).
* **Reason Phrase**: Textual description of status code (e.g., `OK`, `Not Found`, `Internal Server Error`).

### 3.2 Complete Raw Response Example
```http
HTTP/1.1 200 OK\r\n
Date: Wed, 07 Oct 2026 14:30:00 GMT\r\n
Server: nginx/1.24.0\r\n
Content-Type: application/json; charset=utf-8\r\n
Content-Length: 53\r\n
Connection: keep-alive\r\n
\r\n
{"status": "success", "message": "User created successfully"}
```

---

## 4. The Critical Role of `\r\n\r\n` (CRLF)

In raw HTTP text protocols (HTTP/1.0 and HTTP/1.1), line breaks are strictly defined as Carriage Return (`\r` / `0x0D`) followed by Line Feed (`\n` / `0x0A`).

* **Single `\r\n`**: Delimits individual headers.
* **Double `\r\n\r\n`**: Serves as the **unambiguous boundary marker** signaling the end of the HTTP header block. Backend TCP stream parsers buffer incoming bytes until `\r\n\r\n` is encountered before parsing body bytes.

---

## 5. JavaScript Pseudocode: Low-Level Raw HTTP Message Parser

```javascript
// ==============================================================================
// JavaScript / Node.js Low-Level HTTP Request Stream Parser & Response Serializer
// Converts raw Buffer instances from 'net' TCP sockets into structured HTTP objects
// ==============================================================================

class HTTPRequest {
  constructor(method, path, version, headers, body) {
    this.method = method;
    this.path = path;
    this.version = version;
    this.headers = headers;
    this.body = body;
  }
}

/**
 * Parses a raw Node.js Buffer from a TCP socket stream into an HTTPRequest instance.
 * Enforces CRLF delimiter parsing rules.
 */
function parseRawTcpBuffer(buffer) {
  // 1. Locate double CRLF header boundary (\r\n\r\n) in byte buffer
  const boundaryIndex = buffer.indexOf("\r\n\r\n");
  if (boundaryIndex === -1) {
    throw new Error("Malformed HTTP Request: Missing double CRLF header boundary");
  }

  // 2. Separate headers text from raw body bytes
  const headerText = buffer.slice(0, boundaryIndex).toString("ascii");
  const bodyBytes = buffer.slice(boundaryIndex + 4);

  // 3. Split header lines by single CRLF
  const lines = headerText.split("\r\n");
  if (lines.length === 0) throw new Error("Empty HTTP Request");

  // 4. Parse Request Line (Line 1)
  const [method, path, version] = lines[0].split(" ");
  if (!method || !path || !version) {
    throw new Error("Invalid Request Line format");
  }

  // 5. Parse Header Key-Value Pairs into lowercase dictionary
  const headers = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const colonPos = line.indexOf(":");
    if (colonPos !== -1) {
      const key = line.slice(0, colonPos).trim().toLowerCase();
      const val = line.slice(colonPos + 1).trim();
      headers[key] = val;
    }
  }

  // 6. Verify Body size matching Content-Length header
  if (headers["content-length"]) {
    const expectedLen = parseInt(headers["content-length"], 10);
    if (bodyBytes.length < expectedLen) {
      console.warn(`[Warning] Partial payload: got ${bodyBytes.length} of ${expectedLen} bytes`);
    }
  }

  return new HTTPRequest(method, path, version, headers, bodyBytes.toString("utf-8"));
}

/**
 * Serializes structured HTTP response fields into a raw Node.js Buffer for socket transmission.
 */
function serializeRawHttpResponse(statusCode, reasonPhrase, headers, bodyStr) {
  const bodyBuffer = Buffer.from(bodyStr, "utf-8");

  headers["Content-Length"] = bodyBuffer.length.toString();
  headers["Connection"] = "keep-alive";

  const statusLine = `HTTP/1.1 ${statusCode} ${reasonPhrase}\r\n`;
  let headersBlock = "";
  for (const [key, value] of Object.entries(headers)) {
    headersBlock += `${key}: ${value}\r\n`;
  }

  const headerString = `${statusLine}${headersBlock}\r\n`;
  return Buffer.concat([Buffer.from(headerString, "ascii"), bodyBuffer]);
}

// Demonstration Test
const rawHttpRequestString =
  "POST /api/v1/login HTTP/1.1\r\n" +
  "Host: example.com\r\n" +
  "Content-Type: application/json\r\n" +
  "Content-Length: 18\r\n" +
  "\r\n" +
  '{"user": "admin"}';

const rawBuffer = Buffer.from(rawHttpRequestString, "utf-8");
const parsedReq = parseRawTcpBuffer(rawBuffer);

console.log(`Parsed Method: ${parsedReq.method}, Path: ${parsedReq.path}`);
console.log(`Parsed Content-Type: ${parsedReq.headers["content-type"]}`);
console.log(`Parsed Body: ${parsedReq.body}`);

const responseBuffer = serializeRawHttpResponse(
  200,
  "OK",
  { "Content-Type": "application/json" },
  '{"status":"authenticated"}'
);
```

---

## 6. Key Takeaways

1. HTTP requests and responses use **strict formatting** consisting of a Start Line, Headers, `\r\n\r\n`, and an optional Body.
2. The double CRLF sequence (`\r\n\r\n`) acts as the critical boundary between metadata and data payload.
3. Network parsers rely on headers like `Content-Length` or `Transfer-Encoding` to know exactly how many payload bytes to read from a TCP socket.
