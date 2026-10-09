# Day 03: Code Implementation Guide

This directory contains detailed, step-by-step code implementation guides for **Day 03: Serialization & Deserialization**. Each guide walks through the exact mechanics, architecture, and source code files built in `day03/code/src/`.

---

## 📚 Implementation Guides Index

| Guide | Title | Covered Source Files |
| :--- | :--- | :--- |
| **[Guide 01](./01-language-barrier-and-wire-formats.md)** | Universal Wire Formats & Data Boundary | `src/controllers/serialization.controller.js` |
| **[Guide 02](./02-custom-body-parser-middleware.md)** | First-Principles Custom JSON Body Parser | `src/middlewares/json-body-parser.middleware.js`, `src/raw-json-parser.js` |
| **[Guide 03](./03-text-vs-binary-serialization.md)** | Text vs Binary Buffer Encoding & Benchmarks | `src/utils/binary-protocol-encoder.js`, `src/wire-format-benchmark.js` |
| **[Guide 04](./04-safe-json-handling-and-edge-cases.md)** | Resolving JSON Traps (`BigInt`, `Date`, Circular) | `src/utils/safe-json-transformer.js`, `src/safe-json-serializer.js` |
| **[Guide 05](./05-osi-tcp-stream-reassembly.md)** | OSI Layer 4 to Layer 7 Stream Reassembly | `src/simulators/osi-stream-packetizer.js`, `src/osi-packet-simulator.js` |

---

## 🚀 Running Implementation Demos

All standalone guides can be run directly using NPM scripts defined in `package.json`:

```bash
# 1. Start the main Express server with custom body parsing middleware
npm start

# 2. Run standalone custom stream parser test
npm run raw-parser

# 3. Run JSON vs Binary wire size benchmark
npm run wire-benchmark

# 4. Run safe JSON transformer demonstration
npm run safe-json

# 5. Run TCP stream packetization & reassembly simulation
npm run osi-simulator
```
