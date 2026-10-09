/**
 * Low-Level Binary Protocol Encoder/Decoder
 * Demonstrates binary serialization mechanics (similar to Protobuf/MessagePack) vs JSON text strings.
 */

export class BinaryProtocolEncoder {
  /**
   * Encodes a telemetry object into a compact, contiguous Node.js Buffer
   * Scheme:
   * [1 byte: sensorId len][N bytes: sensorId UTF-8][8 bytes: timestamp BigInt64]
   * [1 byte: count N][N*4 bytes: readings Float32][1 byte: status boolean]
   * @param {Object} data Telemetry object
   * @returns {Buffer} Compact binary buffer
   */
  static encodeTelemetry(data) {
    const sensorIdBytes = Buffer.from(data.sensorId, "utf-8");
    const readingsCount = data.readings.length;
    
    // Allocate exact buffer size
    const totalBytes = 1 + sensorIdBytes.length + 8 + 1 + (readingsCount * 4) + 1;
    const buf = Buffer.alloc(totalBytes);

    let offset = 0;

    // 1. Write Sensor ID length and UTF-8 string
    buf.writeUInt8(sensorIdBytes.length, offset); offset += 1;
    sensorIdBytes.copy(buf, offset); offset += sensorIdBytes.length;

    // 2. Write Timestamp (64-bit integer)
    buf.writeBigInt64BE(BigInt(data.timestamp), offset); offset += 8;

    // 3. Write Readings count & Float values (32-bit floats)
    buf.writeUInt8(readingsCount, offset); offset += 1;
    for (const reading of data.readings) {
      buf.writeFloatBE(reading, offset); offset += 4;
    }

    // 4. Write Status Boolean
    buf.writeUInt8(data.statusOk ? 1 : 0, offset);

    return buf;
  }

  /**
   * Decodes a compact binary buffer back into a native JS object
   * @param {Buffer} buf Binary buffer
   * @returns {Object} Deserialized telemetry object
   */
  static decodeTelemetry(buf) {
    let offset = 0;

    // 1. Read Sensor ID
    const sensorIdLen = buf.readUInt8(offset); offset += 1;
    const sensorId = buf.toString("utf-8", offset, offset + sensorIdLen); offset += sensorIdLen;

    // 2. Read Timestamp
    const timestamp = Number(buf.readBigInt64BE(offset)); offset += 8;

    // 3. Read Readings
    const readingsCount = buf.readUInt8(offset); offset += 1;
    const readings = [];
    for (let i = 0; i < readingsCount; i++) {
      readings.push(Number(buf.readFloatBE(offset).toFixed(2)));
      offset += 4;
    }

    // 4. Read Status Boolean
    const statusOk = buf.readUInt8(offset) === 1;

    return { sensorId, timestamp, readings, statusOk };
  }

  /**
   * Benchmarks JSON serialization vs Binary Buffer encoding
   * @param {Object} data Test domain object
   * @returns {Object} Benchmark metrics
   */
  static benchmark(data) {
    const jsonString = JSON.stringify(data);
    const jsonBuffer = Buffer.from(jsonString, "utf-8");
    const binaryBuffer = BinaryProtocolEncoder.encodeTelemetry(data);

    const jsonSize = jsonBuffer.length;
    const binarySize = binaryBuffer.length;
    const reductionPercent = (((jsonSize - binarySize) / jsonSize) * 100).toFixed(1);

    return {
      jsonSizeBytes: jsonSize,
      binarySizeBytes: binarySize,
      savedBytes: jsonSize - binarySize,
      reductionPercent: `${reductionPercent}% smaller`
    };
  }
}
