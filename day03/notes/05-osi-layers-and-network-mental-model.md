# Chapter 05: OSI Layers & Network Mental Model

## 1. The Layer 7 Application Layer Abstraction

When data travels across the internet, it navigates the 7 layers of the Open Systems Interconnection (**OSI**) reference model.

As a backend engineer building HTTP REST APIs, your code operates exclusively at **Layer 7: The Application Layer**.

```
OSI MODEL LAYER                              BACKEND ENGINEER'S MENTAL MODEL
+------------------------------------+       +------------------------------------+
| 7. Application Layer (HTTP / JSON) | <===> | You write code HERE:               |
+------------------------------------+       |  - JSON Serialization / Parsing    |
| 6. Presentation Layer              |       |  - HTTP Request & Response logic   |
| 5. Session Layer                   |       +------------------------------------+
+------------------------------------+       | ASSUMPTION:                        |
| 4. Transport Layer (TCP / UDP)     |       | The network is a reliable,         |
| 3. Network Layer (IP Packets)      | <===> | transparent stream of UTF-8 text   |
| 2. Data Link Layer (Ethernet)      |       | or binary bytes.                   |
| 1. Physical Layer (Bits 0s & 1s)   |       +------------------------------------+
+------------------------------------+
```

### The Power of Abstraction:
You do not need to manually construct Ethernet frames, compute IP packet headers, or manage physical voltage variations. You can safely assume that your client serializes an object into a JSON string, and the network infrastructure reliably delivers that exact JSON text payload to your server's application stream.

---

## 2. Down the OSI Stack: JSON String to Physical Transmission

When a client sends a JSON payload, the operating system kernel and network hardware systematically lower the abstraction level at each layer:

```
[ Application Layer ]     JSON Payload Text: '{"user":"Alice","score":95}'
                                      |
                                      v
[ Transport Layer ]       TCP Segment Header + Encapsulated JSON Chunk
                                      |
                                      v
[ Network Layer ]         IP Packet Header + TCP Segment (Source/Dest IP)
                                      |
                                      v
[ Data Link Layer ]       Ethernet Frame Header + IP Packet + Frame Check Sequence
                                      |
                                      v
[ Physical Layer ]        Physical Bits: 01001010 01010011 01001111 01001110 ...
                          (Transmitted via Fiber Light Pulses or Copper Signals)
```

### Protocol Data Units (PDUs) Across Layers:

| OSI Layer | Protocol / Data Unit | Transformation of Data |
| :--- | :--- | :--- |
| **7. Application** | HTTP Body (Data) | Native JS object serialized into JSON string payload. |
| **4. Transport** | TCP Segment | JSON string divided into sequence-numbered byte chunks; TCP header attached (Source/Destination Ports). |
| **3. Network** | IP Packet | TCP segment encapsulated inside IP packet; IP header attached (Source/Destination IP addresses). |
| **2. Data Link** | Frame | IP packet wrapped inside MAC address frame with error-checking checksums. |
| **1. Physical** | Bits (`0`s and `1`s) | Binary frame converted into electrical voltages, radio waves (Wi-Fi), or light pulses (Fiber). |

---

## 3. Network Reassembly at the Server Side

When physical signals arrive at the server's Network Interface Card (**NIC**):

1. **Hardware Reassembly**: The NIC converts incoming physical signals into Ethernet frames and verifies checksum integrity.
2. **IP Routing & TCP Assembly**: The OS kernel strips MAC/IP headers, inspects TCP sequence numbers, and reorders out-of-order packets into a contiguous byte stream buffer.
3. **Socket Buffer Delivery**: The kernel delivers the contiguous raw UTF-8 byte stream into the application socket buffer (`req`).
4. **Application Layer Consumption**: Node.js reads the socket buffer stream and triggers `JSON.parse()`, restoring the native server object.

---

## 4. Express/Node.js Pseudocode: Simulating TCP Packetization & Socket Reassembly

This low-level Node.js pseudocode simulates how raw TCP sockets chunk a large JSON string into fragmented network buffers, and how an Application Layer stream reassembles those fragments into a valid deserializable payload.

```javascript
// ==============================================================================
// Low-Level Simulation: TCP Packet Fragmentation & Stream Reassembly in Node.js
// Demonstrates OSI Layer 4 to Layer 7 transformation of JSON payloads
// ==============================================================================

const EventEmitter = require("events");

// ------------------------------------------------------------------------------
// 1. Simulated Layer 4 TCP Network Socket Stream
// ------------------------------------------------------------------------------
class SimulatedTcpSocket extends EventEmitter {
  /**
   * Transmits a large JSON string by breaking it into small TCP buffer packets
   */
  transmitJsonPayload(jsonString, packetSizeBytes = 16) {
    const fullBuffer = Buffer.from(jsonString, "utf-8");
    console.log(`[Network Layer 4] Transmitting Total Size: ${fullBuffer.length} Bytes over Socket...`);

    let offset = 0;
    let packetIndex = 1;

    // Simulate chunked packet delivery over time
    const interval = setInterval(() => {
      if (offset >= fullBuffer.length) {
        clearInterval(interval);
        // Signal TCP socket EOF (End of File / Stream End)
        this.emit("end");
        return;
      }

      // Slice out a small chunk (simulating a TCP segment)
      const chunkEnd = Math.min(offset + packetSizeBytes, fullBuffer.length);
      const tcpSegmentChunk = fullBuffer.slice(offset, chunkEnd);
      
      console.log(`  -> TCP Packet #${packetIndex} (${tcpSegmentChunk.length}b): "${tcpSegmentChunk.toString("utf-8")}"`);
      
      // Emit 'data' event to Application Layer listener
      this.emit("data", tcpSegmentChunk);

      offset = chunkEnd;
      packetIndex++;
    }, 50); // 50ms delay between packets
  }
}

// ------------------------------------------------------------------------------
// 2. Layer 7 Application Stream Buffer Reassembler (Express / Node.js logic)
// ------------------------------------------------------------------------------
class ApplicationLayerStreamParser {
  constructor(socket) {
    this.socket = socket;
    this.bufferChunks = [];

    // Listen to Layer 4 Socket Events
    this.socket.on("data", (chunk) => this.handleIncomingChunk(chunk));
    this.socket.on("end", () => this.handleStreamComplete());
  }

  handleIncomingChunk(chunk) {
    // Store raw binary buffer chunks as they arrive
    this.bufferChunks.push(chunk);
  }

  handleStreamComplete() {
    console.log("\n[Application Layer 7] TCP Socket Stream Closed.");
    
    // STEP 1: Reassemble all fragmented byte buffers into one contiguous buffer
    const completeBuffer = Buffer.concat(this.bufferChunks);
    
    // STEP 2: Decode raw binary bytes into UTF-8 text string
    const rawJsonText = completeBuffer.toString("utf-8");
    console.log(`[Application Layer 7] Reassembled Wire String: "${rawJsonText}"`);

    // STEP 3: Deserialize reassembled JSON string into Native JavaScript Object
    try {
      const nativeDataObject = JSON.parse(rawJsonText);
      console.log("[Application Layer 7] Successfully Deserialized Payload:", nativeDataObject);
      console.log(`[Business Logic] User ${nativeDataObject.username} authenticated successfully.`);
    } catch (err) {
      console.error("[Application Layer 7 Error] Failed to parse reassembled JSON:", err.message);
    }
  }
}

// ------------------------------------------------------------------------------
// 3. EXECUTION
// ------------------------------------------------------------------------------
const clientJsonPayload = JSON.stringify({
  userId: 9812,
  username: "network_engineer",
  roles: ["ADMIN", "SYSTEM"],
  timestamp: Date.now()
});

const socket = new SimulatedTcpSocket();
const parser = new ApplicationLayerStreamParser(socket);

// Start packet transmission
socket.transmitJsonPayload(clientJsonPayload, 20); // 20-byte TCP packet chunks
```

---

## 5. Key Takeaways

1. **Layer 7 Perspective**: Backend engineers focus on Layer 7 (Application Layer), trusting lower network layers to handle packet routing, error recovery, and bit transmission.
2. **PDU Hierarchy**: Data transitions down the stack from JSON String $\rightarrow$ TCP Segments $\rightarrow$ IP Packets $\rightarrow$ Data Frames $\rightarrow$ Physical Bits, and reverses up the stack upon receipt.
3. **Stream Buffer Reassembly**: The server OS kernel and Node.js event loop collect fragmented TCP byte buffers, concatenate them, and decode them into a complete UTF-8 JSON string before deserialization.
