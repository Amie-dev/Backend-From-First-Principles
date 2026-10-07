# Day 01: HTTP & Backend Fundamentals - Complete Notes

Welcome to the comprehensive notes for **Day 01: Core Backend Principles & HTTP Deep Dive**. These notes break down the raw class concepts into 11 modular, deeply structured chapters with first-principles explanations, architectural diagrams, and JavaScript/Node.js environment pseudocode.

---

## 📚 Table of Contents

| Chapter | Title | Key Topics Covered |
| :--- | :--- | :--- |
| **[Chapter 01](./01-core-principles.md)** | Core Principles of HTTP | Statelessness, Client-Server Model, Token State Reconstruction |
| **[Chapter 02](./02-http-versions-and-transport.md)** | Transport Protocols & HTTP Evolution | TCP vs UDP, Keep-Alive, HTTP/1.1 HoL Blocking, HTTP/2 Multiplexing, HTTP/3 QUIC |
| **[Chapter 03](./03-http-message-anatomy.md)** | Anatomy of HTTP Messages | Request/Response Start Lines, Headers Format, `\r\n\r\n` Delimiter, Raw Parsers |
| **[Chapter 04](./04-http-headers.md)** | HTTP Headers & Metadata Control | Request/Response/General/Representation Headers, Security Headers (HSTS, CSP, Cookies) |
| **[Chapter 05](./05-http-methods-and-idempotency.md)** | HTTP Methods & Idempotency | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, Safety vs Idempotency Matrix |
| **[Chapter 06](./06-cors-and-security-policies.md)** | Cross-Origin Resource Sharing (CORS) | Same-Origin Policy, Simple vs Preflight Requests, CORS Headers, Preflight Middleware |
| **[Chapter 07](./07-http-status-codes.md)** | Standardized HTTP Status Codes | 1xx, 2xx, 3xx, 4xx, 5xx Categories, Exact Error Semantics, Exception Handling Pipeline |
| **[Chapter 08](./08-http-caching.md)** | HTTP Caching & Conditional Requests | `Cache-Control`, `ETag`, `If-None-Match`, `Last-Modified`, 304 Revalidation Flow |
| **[Chapter 09](./09-content-negotiation-and-compression.md)** | Content Negotiation & Compression | `Accept` headers, Server Negotiation, Gzip/Brotli Compression Pipeline |
| **[Chapter 10](./10-large-data-transfers.md)** | Handling Large Data Transfers | `multipart/form-data` Parsing, Boundaries, Chunked Transfer, Server-Sent Events (SSE) |
| **[Chapter 11](./11-https-and-tls-security.md)** | Security, SSL/TLS & HTTPS | Symmetric vs Asymmetric Encryption, TLS Handshake, Certificates, Encrypted Tunnels |

---

## 🎯 Learning Objectives

By studying these chapter notes and reading the included JavaScript pseudocode, you will understand:
1. **How network bytes turn into parsed HTTP structures** inside Node.js backend web servers.
2. **Why HTTP evolved** from single TCP connection models to binary framing, streams, and UDP-based QUIC.
3. **How to design resilient RESTful APIs** enforcing strict method semantics, idempotency, and standardized status codes.
4. **How browser security policies (SOP & CORS)** interact with server preflight responses.
5. **How caching, compression, and streaming** drastically reduce payload size and server workload.
