import http from "http";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`
===================================================================
🚀 Express Routing Architecture Server Running (Day 02)
===================================================================
📡 Server Address: http://localhost:${PORT}
📍 Static Routes:  GET /api/v1/users/info
🎯 Dynamic Params: GET /api/v1/users/:userId
🔍 Query Params:   GET /api/v1/search?query=express&page=1&limit=5
🪆 Nested Routes:  GET /api/v1/users/:userId/posts/:postId
🏷️ API Versioning: GET /api/v1/... (Deprecated) vs GET /api/v2/products
🚫 Catch-All 404:  Active (Wildcard fallback envelope)
===================================================================
  `);
});
