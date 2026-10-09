# Chapter 03: Text-Based Formats vs Binary Formats

## 1. Categorization of Serialization Standards

Serialization standards used in modern computing fall into two primary categories based on how data is encoded onto the wire:

```
                          +-----------------------------------+
                          |     Serialization Standards       |
                          +-----------------------------------+
                                    /               \
                                   /                 \
                                  v                   v
                     +------------------+   +-------------------+
                     | Text-Based       |   | Binary-Based      |
                     | Formats          |   | Formats           |
                     +------------------+   +-------------------+
                     | • JSON           |   | • Protobuf        |
                     | • YAML           |   | • Apache Avro     |
                     | • XML            |   | • MessagePack     |
                     +------------------+   +-------------------+
```

---

## 2. Text-Based Formats

Text-based formats encode data as human-readable ASCII or UTF-8 character sequences.

### 1. JSON (JavaScript Object Notation)
* **Prevalence**: Accounts for approximately **80% of traditional public HTTP REST APIs**.
* **Advantages**:
  * Highly human-readable and easy to inspect using standard browser dev tools or cURL.
  * Native parsing support in JavaScript runtimes (`JSON.parse` / `JSON.stringify`).
  * Widely supported across virtually every programming language ecosystem.
* **Disadvantages**:
  * Verbose field key names repeated on every single transmitted object.
  * Numerical data encoded as ASCII strings, requiring higher bandwidth than raw binary integers.

### 2. XML (eXtensible Markup Language)
* **Prevalence**: Legacy enterprise web services (SOAP APIs), banking, and RSS feeds.
* **Characteristics**: Uses custom closing tags (`<user><id>1</id></user>`). Highly verbose, heavy parsing CPU overhead.

### 3. YAML (YAML Ain't Markup Language)
* **Prevalence**: Application configuration files (`docker-compose.yml`, Kubernetes manifests, CI/CD pipelines).
* **Characteristics**: Indentation-sensitive, human-friendly for manual configuration editing, but rarely used for high-throughput network wire transmission due to parsing complexity.

---

## 3. Binary Formats

Binary formats compile data structures into compact, raw byte streams optimized for machine parsing speed and minimal wire size.

```
Text Format (JSON):   '{"id":1001,"status":"ACTIVE"}'   --> 29 Bytes (ASCII Characters)
Binary Format (Buffer): [0x08, 0xe9, 0x07, 0x12, 0x06, ...] -->  7 Bytes (Raw Binary Payload)
```

### 1. Protocol Buffers (Protobuf)
* **Developed by**: Google. Standard format for **gRPC** microservice architectures.
* **Mechanics**: Relies on a predefined schema (`.proto` file). Field names are stripped out and replaced by small numeric field tags (e.g., field `1`, field `2`).
* **Advantages**: Payload sizes up to 60-80% smaller than equivalent JSON; parsing is 5x-10x faster because field matching uses numeric offsets rather than string comparisons.

### 2. Apache Avro
* **Prevalence**: Big data processing and event streaming pipelines (Apache Kafka).
* **Mechanics**: Enforces schema isolation where schema is transmitted separately or stored in a registry, allowing raw data payloads to omit field identifiers entirely.

### 3. MessagePack
* **Mechanics**: "It's like JSON, but fast and small." Encodes JSON-like data directly into compact binary buffers without requiring pre-compiled `.proto` schemas.

---

## 4. Architectural Comparison Matrix

| Dimension | JSON (Text) | XML (Text) | Protobuf (Binary) | MessagePack (Binary) |
| :--- | :--- | :--- | :--- | :--- |
| **Human Readability** | High | Medium | None (Raw Bytes) | None (Raw Bytes) |
| **Schema Requirement** | Optional (Schemaless) | Optional (XSD) | **Mandatory** (`.proto`) | Optional |
| **Payload Size** | Medium / Large | Large | **Extremely Compact** | Compact |
| **CPU Parsing Speed** | Moderate | Slow | **Blazing Fast** | Fast |
| **Field Identification**| String Keys (`"name"`) | XML Tags (`<name>`) | Numeric Tags (`1`) | Binary Type Headers |
| **Primary Use Case** | Public REST APIs, Configs | Legacy SOAP Services | Internal Microservices (gRPC) | High-Performance Caching |

---

## 5. Express/Node.js Pseudocode: JSON vs Binary Payload Benchmark

This pseudocode demonstrates the efficiency difference between JSON text serialization and Binary Buffer encoding in Node.js.

```javascript
// ==============================================================================
// Node.js Benchmark: Text (JSON) vs Binary Buffer Serialization
// Demonstrates payload byte size and parsing mechanics
// ==============================================================================

// Sample Domain Dataset: List of telemetry readings
const telemetryData = {
  sensorId: "TEMP-SENS-88102",
  timestamp: 1718000000,
  readings: [23.4, 23.6, 23.5, 24.1, 23.9],
  statusOk: true
};

// ------------------------------------------------------------------------------
// 1. Text Serialization (JSON)
// ------------------------------------------------------------------------------
const jsonString = JSON.stringify(telemetryData);
const jsonBuffer = Buffer.from(jsonString, "utf-8");

console.log("=== 1. Text-Based Serialization (JSON) ===");
console.log(`Wire String Payload : ${jsonString}`);
console.log(`Payload Byte Size   : ${jsonBuffer.length} Bytes`);

// ------------------------------------------------------------------------------
// 2. Custom Binary Serialization (Fixed-Offset Buffer Encoding)
// Demonstrates how binary formats like Protobuf reduce byte overhead
// ------------------------------------------------------------------------------
function serializeToCustomBinary(data) {
  // Allocate buffer space:
  // - SensorId length (1 byte) + SensorID string (15 bytes)
  // - Timestamp (8 bytes uint64)
  // - 5 Float readings (5 * 4 bytes = 20 bytes)
  // - Status boolean (1 byte)
  const sensorIdBytes = Buffer.from(data.sensorId, "utf-8");
  const totalLength = 1 + sensorIdBytes.length + 8 + (data.readings.length * 4) + 1;
  const buf = Buffer.alloc(totalLength);

  let offset = 0;

  // Write Sensor ID Length & String
  buf.writeUInt8(sensorIdBytes.length, offset); offset += 1;
  sensorIdBytes.copy(buf, offset); offset += sensorIdBytes.length;

  // Write Timestamp (BigInt 64-bit int)
  buf.writeBigInt64BE(BigInt(data.timestamp), offset); offset += 8;

  // Write Float Readings (4-byte floats)
  for (const val of data.readings) {
    buf.writeFloatBE(val, offset); offset += 4;
  }

  // Write Status Boolean (0x01 or 0x00)
  buf.writeUInt8(data.statusOk ? 1 : 0, offset);

  return buf;
}

const binaryBuffer = serializeToCustomBinary(telemetryData);

console.log("\n=== 2. Binary-Based Serialization (Buffer / Protobuf Pattern) ===");
console.log("Raw Binary Payload  :", binaryBuffer);
console.log(`Payload Byte Size   : ${binaryBuffer.length} Bytes`);

// Calculate reduction percentage
const reduction = (((jsonBuffer.length - binaryBuffer.length) / jsonBuffer.length) * 100).toFixed(1);
console.log(`\n--> Payload Size Reduction: ${reduction}% smaller than JSON!`);

// ------------------------------------------------------------------------------
// 3. Binary Deserialization
// ------------------------------------------------------------------------------
function deserializeFromCustomBinary(buf) {
  let offset = 0;

  // Read Sensor ID
  const sensorIdLen = buf.readUInt8(offset); offset += 1;
  const sensorId = buf.toString("utf-8", offset, offset + sensorIdLen); offset += sensorIdLen;

  // Read Timestamp
  const timestamp = Number(buf.readBigInt64BE(offset)); offset += 8;

  // Read Readings
  const readings = [];
  for (let i = 0; i < 5; i++) {
    readings.push(Number(buf.readFloatBE(offset).toFixed(1)));
    offset += 4;
  }

  // Read Status
  const statusOk = buf.readUInt8(offset) === 1;

  return { sensorId, timestamp, readings, statusOk };
}

const reconstructedData = deserializeFromCustomBinary(binaryBuffer);
console.log("\nDeserialized Data from Binary Payload:", reconstructedData);
```

---

## 6. Key Takeaways

1. **Text Formats (JSON/XML)** prioritize human-readability and ease of debugging, making them the standard choice for public-facing REST APIs (~80% market share).
2. **Binary Formats (Protobuf/Avro)** prioritize minimal wire payload sizes and ultra-fast CPU parsing speed, making them ideal for high-throughput internal microservices (gRPC) and streaming pipelines.
3. **Field Tag Efficiency**: Binary formats reduce payload size by substituting repeated text keys (`"sensorId"`) with compact numeric field tags or offset-based byte positions.
