import { describeConfiguration } from "../config/env.js";

/**
 * Health & Readiness probe
 *
 * Chapter Ref: Ch09 — observability and safe egress.
 *
 * Returns a REDACTED configuration snapshot (fingerprints only, never secrets)
 * so an operator can confirm at a glance which environment, bcrypt cost, token
 * TTLs and CORS allow-list the running container actually has — the most common
 * cause of "it works locally" incidents.
 *
 * Liveness vs readiness: this endpoint answers liveness. A real readiness probe
 * would additionally ping the database and the token store; both are in-memory
 * here, so they are trivially up.
 */
export function health(req, res) {
  res.status(200).json({
    status: "healthy",
    service: "day04-auth-api",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    requestId: req.id,
    config: describeConfiguration(),
    chapters: [
      "Ch01 — AuthN vs AuthZ & Identity Evolution",
      "Ch02 — Sessions, JWTs & Cookies",
      "Ch03 — Stateful vs Stateless vs Hybrid Auth",
      "Ch04 — API Keys & M2M Authentication",
      "Ch05 — OAuth 2.0 & OpenID Connect (concepts)",
      "Ch06 — RBAC, ABAC & Resource Ownership",
      "Ch07 — bcrypt Password Hashing & Cryptographic Storage",
      "Ch08 — Threat Modelling & Attack Defences",
      "Ch09 — End-to-End Secure Request Pipeline",
    ],
  });
}

export default health;
