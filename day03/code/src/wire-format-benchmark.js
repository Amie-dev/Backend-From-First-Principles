/**
 * Standalone Demonstration: Text (JSON) vs Binary Protocol Encoding Benchmark
 * Run with: npm run wire-benchmark
 */

import { BinaryProtocolEncoder } from "./utils/binary-protocol-encoder.js";

console.log("==================================================================");
console.log("       TEXT (JSON) VS BINARY BUFFER SERIALIZATION BENCHMARK      ");
console.log("==================================================================");

const telemetrySample = {
  sensorId: "SENSOR-NODE-9901",
  timestamp: 1718000000000,
  readings: [23.45, 23.60, 23.55, 24.10, 23.95, 24.00, 23.85],
  statusOk: true
};

console.log("\n1. Domain Object to Serialize:", telemetrySample);

// Text JSON Serialization
const jsonString = JSON.stringify(telemetrySample);
const jsonBuffer = Buffer.from(jsonString, "utf-8");

// Binary Buffer Serialization
const binaryBuffer = BinaryProtocolEncoder.encodeTelemetry(telemetrySample);

console.log("\n2. Serialized Payload Outputs:");
console.log(`   - JSON String Payload  : "${jsonString}"`);
console.log(`   - Raw Binary Buffer    :`, binaryBuffer);

// Benchmark Analysis
const benchmark = BinaryProtocolEncoder.benchmark(telemetrySample);
console.log("\n3. Payload Size Benchmark Results:");
console.log(`   - JSON Byte Size       : ${benchmark.jsonSizeBytes} Bytes`);
console.log(`   - Binary Byte Size     : ${benchmark.binarySizeBytes} Bytes`);
console.log(`   - Saved Bytes          : ${benchmark.savedBytes} Bytes`);
console.log(`   - Size Reduction       : ${benchmark.reductionPercent}`);

// Verify Binary Deserialization
const decoded = BinaryProtocolEncoder.decodeTelemetry(binaryBuffer);
console.log("\n4. Deserialization Parity Check:");
console.log("   - Decoded Object       :", decoded);
console.log("   - Sensor ID Match?     :", decoded.sensorId === telemetrySample.sensorId ? "✅ PASS" : "❌ FAIL");
console.log("   - Status Match?        :", decoded.statusOk === telemetrySample.statusOk ? "✅ PASS" : "❌ FAIL");
console.log("==================================================================");
