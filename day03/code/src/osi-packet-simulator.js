/**
 * Standalone Demonstration: TCP Buffer Packetization & Stream Reassembly
 * Run with: npm run osi-simulator
 */

import { SimulatedTcpSocket, Layer7StreamReassembler } from "./simulators/osi-stream-packetizer.js";

console.log("==================================================================");
console.log("   OSI LAYER 4 TO LAYER 7 TCP STREAM REASSEMBLY SIMULATOR         ");
console.log("==================================================================");

const clientPayload = JSON.stringify({
  transactionId: "TX-99881023",
  amount: 499.95,
  currency: "USD",
  sender: "alice@company.org",
  receiver: "bob@company.org",
  timestamp: Date.now()
});

console.log(`Original Application Layer Payload String (${Buffer.byteLength(clientPayload)} bytes):`);
console.log(`"${clientPayload}"\n`);

const socket = new SimulatedTcpSocket();
const reassembler = new Layer7StreamReassembler(socket);

console.log("[Layer 4 Transport] Transmitting payload in small 16-byte TCP buffer packets...");
socket.transmit(clientPayload, 16);

reassembler.reassembleAndParse().then((result) => {
  console.log("\n==================================================================");
  console.log("[Layer 7 Application] Stream complete! Packet reassembly summary:");
  console.log(`   - Total Reassembled Buffer Bytes : ${result.rawBufferLength} Bytes`);
  console.log(`   - Reassembled Wire String        : "${result.wireText}"`);
  console.log(`   - Deserialized Native JS Object  :`, result.data);
  console.log("==================================================================");
}).catch((err) => console.error("Error:", err));
