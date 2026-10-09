# Implementation Guide 03: Text vs Binary Serialization Benchmarks

## 1. Architectural Concept

While text-based serialization (JSON) dominates public HTTP REST APIs due to human readability, binary formats (Protobuf, MessagePack, custom buffers) dominate high-throughput microservices (gRPC) due to payload size efficiency and CPU parsing speed.

This guide demonstrates a custom binary protocol encoder in Node.js that replaces text field names with fixed offset binary schemas.

---

## 2. Code Implementation (`src/utils/binary-protocol-encoder.js`)

```javascript
export class BinaryProtocolEncoder {
  static encodeTelemetry(data) {
    const sensorIdBytes = Buffer.from(data.sensorId, "utf-8");
    const readingsCount = data.readings.length;
    
    // Allocate exact buffer size needed
    const totalBytes = 1 + sensorIdBytes.length + 8 + 1 + (readingsCount * 4) + 1;
    const buf = Buffer.alloc(totalBytes);

    let offset = 0;

    // 1. Write Sensor ID length and UTF-8 bytes
    buf.writeUInt8(sensorIdBytes.length, offset); offset += 1;
    sensorIdBytes.copy(buf, offset); offset += sensorIdBytes.length;

    // 2. Write Timestamp (64-bit int)
    buf.writeBigInt64BE(BigInt(data.timestamp), offset); offset += 8;

    // 3. Write Readings count & Floats (32-bit floats)
    buf.writeUInt8(readingsCount, offset); offset += 1;
    for (const reading of data.readings) {
      buf.writeFloatBE(reading, offset); offset += 4;
    }

    // 4. Write Status Boolean
    buf.writeUInt8(data.statusOk ? 1 : 0, offset);

    return buf;
  }
}
```

---

## 3. Running Benchmark Demonstration

Run the benchmark script to compare JSON wire byte size against Binary buffer wire byte size:

```bash
npm run wire-benchmark
```

### Expected Output:
```text
=== Benchmark Results ===
JSON Byte Size   : 148 Bytes
Binary Byte Size : 48 Bytes
Saved Bytes      : 100 Bytes
Size Reduction   : 67.6% smaller
```
