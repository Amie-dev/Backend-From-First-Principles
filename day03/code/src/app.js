import express from "express";
import { customJsonParser } from "./middlewares/json-body-parser.middleware.js";
import apiRoutes from "./routes/api.routes.js";

const app = express();

// Disable Express powered-by header for security hygiene
app.disable("x-powered-by");

// Apply First-Principles Custom JSON Body Parser Middleware (Limit 512KB)
app.use(customJsonParser({ limitBytes: 512 * 1024 }));

// Mount API routes under /api/v1
app.use("/api/v1", apiRoutes);

// Catch-all 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
    statusCode: 404
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error("[Global Error Handler]:", err);
  res.status(err.status || 500).json({
    error: err.name || "Internal Server Error",
    message: err.message || "An unexpected error occurred."
  });
});

export default app;
