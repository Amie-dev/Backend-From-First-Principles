import http from "http";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

// Create HTTP server instance
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`
===================================================================
🚀 Express Backend Server Running (ES Modules - Day 01)
===================================================================
📡 Server Address: http://localhost:${PORT}
🔐 Security Headers: Active (HSTS, CSP, X-Frame-Options)
🌐 CORS Preflight: Enabled for cross-origin requests
⚡ Caching & ETag: Active (Conditional 304 revalidation)
📦 Compression: Active (Gzip / Brotli negotiated)
🔑 Auth Mode: Stateless JWT (Bearer Authorization)
===================================================================
  `);
});
