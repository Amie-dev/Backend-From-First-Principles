import { Router } from "express";
import { SerializationController } from "../controllers/serialization.controller.js";

const router = Router();

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// User registration endpoint (tests body parsing)
router.post("/users/register", SerializationController.registerUser);

// Telemetry ingest endpoint (tests text vs binary wire comparison)
router.post("/telemetry/ingest", SerializationController.ingestTelemetry);

// Complex state export (tests custom Safe JSON serialization)
router.get("/data/complex-export", SerializationController.exportComplexState);

export default router;
