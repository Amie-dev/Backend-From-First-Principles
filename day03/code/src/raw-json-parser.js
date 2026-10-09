/**
 * Standalone Demonstration: First-Principles Stream Body Parser
 * Run with: npm run raw-parser
 */

import http from "http";
import { customJsonParser } from "./middlewares/json-body-parser.middleware.js";
import express from "express";

const app = express();
app.use(customJsonParser({ limitBytes: 100 })); // Strict 100-byte limit for demonstration

app.post("/test-parse", (req, res) => {
  console.log("\n[Server Handler] Successfully deserialized req.body:", req.body);
  res.json({ message: "Successfully parsed JSON body!", receivedData: req.body });
});

const server = app.listen(3002, () => {
  console.log("=== Raw JSON Stream Parser Demo Server Started on http://localhost:3002 ===");

  // Test Case 1: Send valid JSON
  sendRequest('{"name":"Alice","role":"Developer"}', "Valid JSON", () => {
    // Test Case 2: Send malformed JSON
    sendRequest('{"name": Alice}', "Malformed JSON", () => {
      // Test Case 3: Send payload exceeding 100-byte limit
      const hugeString = JSON.stringify({ longData: "A".repeat(150) });
      sendRequest(hugeString, "Payload Too Large (>100b)", () => {
        server.close();
      });
    });
  });
});

function sendRequest(bodyText, label, callback) {
  console.log(`\n--- Sending Test: [${label}] ---`);
  console.log(`Sending Raw String: "${bodyText}"`);

  const req = http.request(
    {
      hostname: "localhost",
      port: 3002,
      path: "/test-parse",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyText)
      }
    },
    (res) => {
      let chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const responseText = Buffer.concat(chunks).toString("utf-8");
        console.log(`HTTP Status : ${res.statusCode}`);
        console.log(`Response    : ${responseText}`);
        callback();
      });
    }
  );

  req.write(bodyText);
  req.end();
}
