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
