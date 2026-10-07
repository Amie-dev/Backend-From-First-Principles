import express from "express";
import v1Router from "./routes/v1/index.js";
import v2Router from "./routes/v2/index.js";

const app = express();

// Parse incoming request payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[HTTP Request] ${req.method} ${req.originalUrl}`);
  next();
});

// 1. Root Endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Day 02 Express Routing Architecture API Server",
    documentation: "/api/v1/users/info",
    activeVersions: ["v1", "v2"]
  });
});

// 2. Mount Version Routers
app.use("/api/v1", v1Router); // V1 Endpoints (Includes Sunset & Deprecation headers)
app.use("/api/v2", v2Router); // V2 Active Endpoints

// 3. Catch-All Wildcard Route (MUST BE REGISTERED LAST)
// Intercepts any unmatched HTTP request method and path
app.use("*", (req, res) => {
  console.warn(`[Catch-All 404 Handler] Unmatched Route: ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `The requested endpoint '${req.method} ${req.originalUrl}' does not exist on this server.`,
      status: 404,
      suggestedRoutes: [
        "GET /api/v1/users",
        "GET /api/v1/users/:userId",
        "GET /api/v1/users/:userId/posts/:postId",
        "GET /api/v1/search?query=val&category=backend",
        "GET /api/v2/products"
      ]
    }
  });
});

export default app;
