import { EventEmitter } from "events";

/**
 * Simulated Layer 4 TCP Network Socket Stream
 * Emits raw binary buffer chunks simulating TCP segment fragmentation
 */
export class SimulatedTcpSocket extends EventEmitter {
  /**
   * Transmits a payload by breaking it into chunked TCP buffer packets
   * @param {string} payload Raw text string
   * @param {number} chunkSize Maximum byte size of each TCP segment
   */
  transmit(payload, chunkSize = 16) {
    const fullBuffer = Buffer.from(payload, "utf-8");
    let offset = 0;

    const timer = setInterval(() => {
      if (offset >= fullBuffer.length) {
        clearInterval(timer);
        this.emit("end");
        return;
      }

      const end = Math.min(offset + chunkSize, fullBuffer.length);
      const packetChunk = fullBuffer.subarray(offset, end);
      
      this.emit("data", packetChunk);
      offset = end;
    }, 20);
  }
}

/**
 * Layer 7 Application Stream Buffer Reassembler
 * Concatenates incoming TCP packet chunks into a complete string payload
 */
export class Layer7StreamReassembler {
  constructor(socket) {
    this.socket = socket;
    this.chunks = [];
  }

  /**
   * Starts listening to socket events and returns a Promise resolving to the parsed payload
   * @returns {Promise<Object>} Reassembled and deserialized JSON payload
   */
  reassembleAndParse() {
    return new Promise((resolve, reject) => {
      this.socket.on("data", (chunk) => {
        this.chunks.push(chunk);
      });

      this.socket.on("end", () => {
        const fullBuffer = Buffer.concat(this.chunks);
        const textPayload = fullBuffer.toString("utf-8");

        try {
          const parsedObject = JSON.parse(textPayload);
          resolve({
            rawBufferLength: fullBuffer.length,
            wireText: textPayload,
            data: parsedObject
          });
        } catch (err) {
          reject(new Error(`Layer 7 Parsing Error: ${err.message}`));
        }
      });

      this.socket.on("error", (err) => reject(err));
    });
  }
}
