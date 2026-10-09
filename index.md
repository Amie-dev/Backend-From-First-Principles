# 📚 Backend From First Principles — Master Notes Index

Welcome to the master index of theoretical notes for **Backend From First Principles**. Each chapter provides first-principles architectural explanations, protocol diagrams, and code demonstrations.

---

## 🚀 Day 01: HTTP & Backend Fundamentals

| Chapter | Title & Key Topics | Quick Link |
| :--- | :--- | :---: |
| 📖 **Overview** | **Day 01 Notes Overview**<br>• Complete Day 01 Curriculum Overview & Learning Map | [Read Overview](./day01/notes/README.md) |
| 0️⃣1️⃣ **Chapter 01** | **Core Principles of HTTP**<br>• Layer 7 Protocol Specs • Statelessness vs State Reconstruction • Client-Server Model | [Read Chapter 01](./day01/notes/01-core-principles.md) |
| 0️⃣2️⃣ **Chapter 02** | **Transport Protocols & HTTP Evolution**<br>• TCP vs UDP/QUIC • HTTP/1.0 Connection Overhead • HTTP/1.1 Keep-Alive & HoL Blocking • HTTP/2 Binary Framing & Multiplexing • HTTP/3 QUIC | [Read Chapter 02](./day01/notes/02-http-versions-and-transport.md) |
| 0️⃣3️⃣ **Chapter 03** | **Anatomy of HTTP Messages**<br>• Request & Status Lines • Header Delimiters • The `\r\n\r\n` Header Boundary • Buffer Parsers | [Read Chapter 03](./day01/notes/03-http-message-anatomy.md) |
| 0️⃣4️⃣ **Chapter 04** | **HTTP Headers & Metadata Control**<br>• Request, Response, General, & Representation Headers • Security Headers (HSTS, CSP, X-Frame-Options, Cookie security) | [Read Chapter 04](./day01/notes/04-http-headers.md) |
| 0️⃣5️⃣ **Chapter 05** | **HTTP Methods & Idempotency**<br>• Semantic Intent of HTTP Verbs • Safe vs Idempotent Matrix • `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` | [Read Chapter 05](./day01/notes/05-http-methods-and-idempotency.md) |
| 0️⃣6️⃣ **Chapter 06** | **Cross-Origin Resource Sharing (CORS)**<br>• Same-Origin Policy (SOP) • Simple vs Non-Simple Requests • `OPTIONS` Preflight Handshake & CORS Headers | [Read Chapter 06](./day01/notes/06-cors-and-security-policies.md) |
| 0️⃣7️⃣ **Chapter 07** | **Standardized HTTP Status Codes**<br>• 1xx, 2xx, 3xx, 4xx, 5xx Categories & Semantics • Custom API Exception Hierarchy & Error Middleware | [Read Chapter 07](./day01/notes/07-http-status-codes.md) |
| 0️⃣8️⃣ **Chapter 08** | **HTTP Caching & Conditional Requests**<br>• `Cache-Control` Directives • `ETag` Cryptographic Hashing • `If-None-Match` & `304 Not Modified` Revalidation Flow | [Read Chapter 08](./day01/notes/08-http-caching.md) |
| 0️⃣9️⃣ **Chapter 09** | **Content Negotiation & Compression**<br>• Quality Values ($q$-factors) in `Accept` headers • Gzip & Brotli (`br`) Compression • `Vary` Header Protection | [Read Chapter 09](./day01/notes/09-content-negotiation-and-compression.md) |
| 1️⃣0️⃣ **Chapter 10** | **Handling Large Data Transfers**<br>• `multipart/form-data` Boundaries • RAM-efficient Disk Pipe Streaming (`req.pipe()`) • Server-Sent Events (SSE) | [Read Chapter 10](./day01/notes/10-large-data-transfers.md) |
| 1️⃣1️⃣ **Chapter 11** | **Security, SSL/TLS & HTTPS**<br>• HTTPS Encrypted Tunnel • Symmetric vs Asymmetric Cryptography • TLS 1.3 Handshake Sequence | [Read Chapter 11](./day01/notes/11-https-and-tls-security.md) |

---

## 🗺️ Day 02: Routing & URL Architecture

| Chapter | Title & Key Topics | Quick Link |
| :--- | :--- | :---: |
| 📖 **Overview** | **Day 02 Notes Overview**<br>• Complete Day 02 Routing Curriculum & Learning Map | [Read Overview](./day02/notes/README.md) |
| 0️⃣1️⃣ **Chapter 01** | **What is Routing?**<br>• HTTP Verbs ("What") vs Paths ("Where") • Dispatch Key Resolution • Route Handlers | [Read Chapter 01](./day02/notes/01-what-is-routing.md) |
| 0️⃣2️⃣ **Chapter 02** | **Static & Dynamic Routes**<br>• Fixed URL paths • Dynamic Path Parameters (`:id`) • Extracting Identifiers | [Read Chapter 02](./day02/notes/02-static-and-dynamic-routes.md) |
| 0️⃣3️⃣ **Chapter 03** | **Query Parameters & Search Filtering**<br>• Query String syntax (`?key=val`) • Pagination (`page=2`) • Sorting & Searching in GET requests | [Read Chapter 03](./day02/notes/03-query-parameters.md) |
| 0️⃣4️⃣ **Chapter 04** | **Nested Routes & Hierarchical Resources**<br>• Parent-Child Resource Relational Hierarchies (`/users/:userId/posts/:postId`) • Express `{ mergeParams: true }` | [Read Chapter 04](./day02/notes/04-nested-routes.md) |
| 0️⃣5️⃣ **Chapter 05** | **Route Versioning & Deprecation**<br>• `/api/v1` vs `/api/v2` • Managing Breaking Changes • `Deprecation` & `Sunset` RFC 8594 Headers | [Read Chapter 05](./day02/notes/05-route-versioning-and-deprecation.md) |
| 0️⃣6️⃣ **Chapter 06** | **Catch-All Routes & Fallback Handlers**<br>• Wildcard (`*`) Routing • Pipeline Precedence Order • RFC 404 Not Found JSON Envelopes | [Read Chapter 06](./day02/notes/06-catch-all-routes.md) |

---

## ⚡ Day 03: Serialization & Deserialization

| Chapter | Title & Key Topics | Quick Link |
| :--- | :--- | :---: |
| 📖 **Overview** | **Day 03 Notes Overview**<br>• Complete Day 03 Serialization & Deserialization Overview | [Read Overview](./day03/notes/README.md) |
| 0️⃣1️⃣ **Chapter 01** | **The Language Barrier & Need for Serialization**<br>• Incompatible memory layouts • Heterogeneous client-server environments • Universal wire formats | [Read Chapter 01](./day03/notes/01-language-barrier-and-serialization-need.md) |
| 0️⃣2️⃣ **Chapter 02** | **Serialization & Deserialization Fundamentals**<br>• Definitions • Mathematical model ($\mathcal{S}$ and $\mathcal{D}$) • Complete 7-step HTTP request/response lifecycle | [Read Chapter 02](./day03/notes/02-serialization-deserialization-fundamentals.md) |
| 0️⃣3️⃣ **Chapter 03** | **Text-Based Formats vs Binary Formats**<br>• JSON, YAML, XML vs Protobuf, Avro, MessagePack • Comparative trade-offs & payload size benchmarks | [Read Chapter 03](./day03/notes/03-text-vs-binary-formats.md) |
| 0️⃣4️⃣ **Chapter 04** | **Deep Dive into JSON (Industry Standard)**<br>• Strict syntax rules • Allowed vs unsupported types • JSON traps (`BigInt`, `Date`, `undefined`, circular refs) | [Read Chapter 04](./day03/notes/04-deep-dive-into-json.md) |
| 0️⃣5️⃣ **Chapter 05** | **OSI Layers & Network Mental Model**<br>• Layer 7 abstraction • Packetization of JSON into TCP/IP frames & bits • Network payload stream reassembly | [Read Chapter 05](./day03/notes/05-osi-layers-and-network-mental-model.md) |
| 0️⃣6️⃣ **Chapter 06** | **Express/Node.js Deserialization & Body Parsing**<br>• Under the hood of `express.json()` • Stream buffer consumption (`data`/`end` events) • DoS payload limits & security error handling | [Read Chapter 06](./day03/notes/06-express-node-deserialization-and-body-parsing.md) |