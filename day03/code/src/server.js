import app from "./app.js";

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`========================================================`);
  console.log(`🚀 Day 03 Express Server Running on http://localhost:${PORT}`);
  console.log(`   Middleware : Custom First-Principles JSON Body Parser`);
  console.log(`   Environment: ${process.env.NODE_NODE_ENV || "development"}`);
  console.log(`========================================================`);
});

// Graceful shutdown handling
process.on("SIGINT", () => {
  console.log("\nReceived SIGINT. Closing HTTP server cleanly...");
  server.close(() => {
    console.log("HTTP server closed. Exiting process.");
    process.exit(0);
  });
});
