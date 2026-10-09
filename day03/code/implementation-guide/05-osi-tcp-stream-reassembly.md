# Implementation Guide 05: OSI Layer 4 to Layer 7 Stream Reassembly

## 1. Architectural Concept

Networking hardware and operating systems do not send HTTP JSON bodies as a single atomic unit. At Layer 4 (Transport Layer), TCP splits large strings into multiple small sequence-numbered segment packets.

Node.js application streams receive these byte fragments via `data` events and reassemble them back into a contiguous UTF-8 string payload at Layer 7 (Application Layer).

---

## 2. Code Implementation (`src/simulators/osi-stream-packetizer.js`)

```javascript
import { EventEmitter } from "events";

export class SimulatedTcpSocket extends EventEmitter {
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

export class Layer7StreamReassembler {
  constructor(socket) {
    this.socket = socket;
    this.chunks = [];
  }

  reassembleAndParse() {
    return new Promise((resolve, reject) => {
      this.socket.on("data", (chunk) => this.chunks.push(chunk));

      this.socket.on("end", () => {
        const fullBuffer = Buffer.concat(this.chunks);
        const textPayload = fullBuffer.toString("utf-8");

        try {
          resolve({
            rawBufferLength: fullBuffer.length,
            wireText: textPayload,
            data: JSON.parse(textPayload)
          });
        } catch (err) {
          reject(err);
        }
      });
    });
  }
}
```

---

## 3. Running Simulation Demonstration

Run the TCP packetization & stream reassembly simulator:

```bash
npm run osi-simulator
```
