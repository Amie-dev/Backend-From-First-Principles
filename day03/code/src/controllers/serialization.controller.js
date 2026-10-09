import { SafeJsonTransformer } from "../utils/safe-json-transformer.js";
import { BinaryProtocolEncoder } from "../utils/binary-protocol-encoder.js";

/**
 * Controller demonstrating serialization and body parsing mechanics across API endpoints
 */
export class SerializationController {
  /**
   * Processes user registration received via custom JSON body parser
   */
  static registerUser(req, res) {
    const { username, email, role } = req.body;

    if (!username || !email) {
      return res.status(422).json({
        error: "Unprocessable Entity",
        message: "Fields 'username' and 'email' are required."
      });
    }

    const newUser = {
      id: Math.floor(Math.random() * 9000) + 1000,
      username,
      email,
      role: role || "USER",
      createdAt: new Date().toISOString()
    };

    return res.status(201).json({
      status: "SUCCESS",
      message: "User successfully registered via custom body parser.",
      user: newUser
    });
  }

  /**
   * Receives telemetry payload and computes wire format benchmark stats
   */
  static ingestTelemetry(req, res) {
    const { sensorId, timestamp, readings, statusOk } = req.body;

    if (!sensorId || !readings || !Array.isArray(readings)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Invalid telemetry payload structure."
      });
    }

    const telemetry = {
      sensorId,
      timestamp: timestamp || Date.now(),
      readings,
      statusOk: statusOk !== undefined ? statusOk : true
    };

    const benchmark = BinaryProtocolEncoder.benchmark(telemetry);

    return res.status(200).json({
      status: "INGESTED",
      telemetryReceived: telemetry,
      wireFormatComparison: benchmark
    });
  }

  /**
   * Returns complex domain data with BigInt, Date, and Set revived safely
   */
  static exportComplexState(req, res) {
    const complexData = {
      accountId: 9007199254740995n, // BigInt beyond JS Number.MAX_SAFE_INTEGER
      serverTime: new Date(),
      activeRoles: new Set(["ADMIN", "AUDITOR"]),
      metadata: new Map([["region", "us-east-1"], ["environment", "production"]])
    };

    // Use SafeJsonTransformer to stringify safely
    const jsonString = SafeJsonTransformer.safeStringify(complexData);

    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(jsonString);
  }
}
