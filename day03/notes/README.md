# Day 03: Serialization & Deserialization - Complete Notes

Welcome to the comprehensive notes for **Day 03: Serialization & Deserialization for Backend Engineers**. These notes expand upon the raw class material to deliver first-principles explanations, architectural diagrams, comparative benchmarks, and complete Express/Node.js pseudocode implementations.

---

## 📚 Table of Contents

| Chapter | Title | Key Topics Covered |
| :--- | :--- | :--- |
| **[Chapter 01](./01-language-barrier-and-serialization-need.md)** | The Language Barrier & Need for Serialization | Incompatible memory layouts, heterogeneous client-server environments, universal wire format |
| **[Chapter 02](./02-serialization-deserialization-fundamentals.md)** | Serialization & Deserialization Fundamentals | Definitions, mathematical model, complete 7-step end-to-end HTTP request/response lifecycle |
| **[Chapter 03](./03-text-vs-binary-formats.md)** | Text-Based Formats vs Binary Formats | JSON, YAML, XML vs Protobuf, Avro, MessagePack, comparative trade-offs & payload size |
| **[Chapter 04](./04-deep-dive-into-json.md)** | Deep Dive into JSON (Industry Standard) | Strict syntax rules, allowed vs unsupported types, JSON traps (`BigInt`, `Date`, `undefined`, circular refs) |
| **[Chapter 05](./05-osi-layers-and-network-mental-model.md)** | OSI Layers & Network Mental Model | Layer 7 abstraction, packetization of JSON into TCP/IP frames and bits, network payload reassembly |
| **[Chapter 06](./06-express-node-deserialization-and-body-parsing.md)** | Express/Node.js Deserialization & Body Parsing | Under the hood of `express.json()`, stream buffer consumption (`data`/`end` events), security & error handling |

---

## 🎯 Learning Objectives

By studying these chapter notes and reviewing the included Node.js/Express implementations, you will understand:
1. **Why direct memory sharing across network boundaries is impossible** and how serialization bridges the gap between disparate programming languages (e.g., JavaScript client, Rust/Node backend).
2. **The exact mechanics of Serialization and Deserialization**, mapping native objects into wire-ready byte streams and back.
3. **The trade-offs between Text-based (JSON, XML) and Binary (Protobuf, Avro) serialization formats** in modern backend architectures.
4. **The strict syntax rules and data-type constraints of JSON**, along with techniques to overcome common edge cases (like `BigInt` precision loss or `Date` stringification).
5. **The OSI Layer 7 mental model** that allows backend developers to treat complex network layers as transparent channels for JSON transmission.
6. **How to build a custom JSON body parser from first principles** in Express/Node.js by consuming raw request stream buffers.
