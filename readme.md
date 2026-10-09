# Backend From First Principles

Welcome to **Backend From First Principles** — a comprehensive, language-agnostic roadmap and deep-dive repository designed to teach backend engineering from the ground up.

---

## 🎯 The Philosophy Behind This Project

Backend engineering is far more than just building a set of basic CRUD APIs. True backend engineering is about designing and constructing **reliable, scalable, fault-tolerant, maintainable codebases, and efficient systems**.

### Why Learn Backend Development from First Principles?

When beginners start learning backend development today, they often face two major challenges:

1. **Information Overload Without a Big Picture**:
   There are thousands of tutorials, bootcamps, and courses available. However, most focus on isolated snippets without explaining how all the components—network hops, firewalls, reverse proxies, HTTP protocols, validation pipelines, databases, caching layers, and background workers—connect in a production system. It often takes developers years of trial-and-error to connect these dots.

2. **Language and Framework Blind Spots**:
   Most developers start backend development tied to a specific ecosystem (e.g., Express.js, Spring Boot, Ruby on Rails, or Django). When you view backend architecture solely through the lens of a single framework, you acquire blind spots. If your team migrates to a different language (e.g., Rails to Go for performance reasons), how much of your knowledge can you transfer if you don't understand the underlying systems?

### The Solution: First-Principles Architecture

This project strips away framework abstractions to help you master the core principles, network mechanics, and architectural patterns of backend systems. Once you understand the underlying concepts, you can easily apply them to **any language or framework** (Node.js, Go, Python, Java, Rust, etc.).

---

## 🚀 The 3-Phase Learning Journey

```text
+-------------------------------------------------------------------------------+
|  Phase 1: Story, Concepts & Philosophy                                       |
|  - Request flow across network hops (DNS -> Firewall -> Nginx -> Server)     |
|  - HTTP protocol mechanics, status codes, CORS, caching, security, routing    |
|  - Language-agnostic system design patterns and principles                   |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
|  Phase 2: Deep-Dive Code Implementations                                     |
|  - Translating theory into production-grade implementations                   |
|  - Hands-on codebases in Node.js (Express) and Go                            |
|  - First-principles implementations (e.g., raw TCP HTTP parsers, custom CORS) |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
|  Phase 3: Production-Level Capstone Projects                                 |
|  - End-to-end production systems built with industry best practices           |
|  - Scalable architectures handling zero to 1,000,000+ users                  |
+-------------------------------------------------------------------------------+
```

---

## 📚 Comprehensive Curriculum Roadmap

### 1. Network Hops & System Architecture
* **Request Journey**: Tracing a request from the client browser $\rightarrow$ DNS resolution $\rightarrow$ AWS EC2 Firewall/Security Groups $\rightarrow$ Reverse Proxy (Nginx) $\rightarrow$ Application Server (PM2 / Node / Go).
* **DNS Records**: A Records, CNAME Records, routing domain names to static public IPs.
* **Firewalls & Ports**: Allowing ingress traffic on Port 80 (HTTP), Port 443 (HTTPS), and Port 22 (SSH).
* **Reverse Proxies (Nginx)**: Centralized request routing, SSL termination (Certbot / Let's Encrypt), forwarding requests from Port 80/443 to internal server ports (e.g., `localhost:3000`).

### 2. HTTP Protocol Deep Dive
* **Protocol Evolution**: HTTP/1.0 (short-lived connections), HTTP/1.1 (Keep-Alive, Head-of-Line blocking), HTTP/2.0 (Binary framing, multiplexed streams, HPACK), HTTP/3.0 (QUIC over UDP, zero-RTT connection migration).
* **HTTP Message Anatomy**: Request line, status line, headers, `\r\n\r\n` boundary separation, payload bodies.
* **Headers**: Request, Response, General, Representation (`Content-Type`, `Content-Length`, `Content-Encoding`), and Security headers (`HSTS`, `CSP`, `X-Frame-Options`, `X-Content-Type-Options`).
* **Verbs & Idempotency**: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`. Mathematical definitions of Safe vs. Idempotent operations ($f(x) = f(f(x))$).
* **Same-Origin Policy & CORS**: Simple vs. Preflighted requests, handling `OPTIONS` preflights (`204 No Content`), `Access-Control-Allow-*` headers.
* **Status Codes**: 1xx (Informational), 2xx (Success), 3xx (Redirection), 4xx (Client Errors), 5xx (Server Errors).
* **Caching & Validation**: `Cache-Control` directives (`no-cache`, `no-store`, `max-age`), `ETag` strong/weak validators, conditional `If-None-Match` requests returning `304 Not Modified`.
* **Content Negotiation & Compression**: Quality values ($q$-factors) in `Accept` headers, payload compression via Gzip and Brotli (`br`), `Vary: Accept-Encoding` protection.
* **Security**: SSL/TLS 1.3 handshake sequence, Symmetric vs. Asymmetric key exchange (ECDHE + AES), HTTPS socket encryption.

### 3. Routing & URL Mapping
* **Parameters**: Path parameters vs. Query parameters.
* **Route Types**: Static, Dynamic, Nested, Hierarchical, Wildcard/Catch-all, and Regex routes.
* **API Versioning**: URI versioning, Header versioning, Query string versioning, Media type versioning, Deprecation strategies.
* **Route Grouping**: Versioning isolation, permission boundaries, shared middleware pipelines.

### 4. Serialization & Deserialization
* **Data Interchange**: Translating internal runtime data structures to network formats (Serialization) and parsing incoming network bytes into native objects (Deserialization).
* **Formats**: Text-based (JSON, XML) vs. Binary (Protocol Buffers / Protobuf, gRPC). Trade-offs in human readability vs. payload size and serialization speed.
* **JSON Mechanics**: Data types, handling missing/null fields, date/timezone issues, custom serializers, schema validation using JSON Schema.

### 5. Authentication & Authorization
* **Models**: Stateful (Sessions, Cookies, Redis) vs. Stateless (JWT, Bearer Tokens).
* **Protocols**: Basic Auth, OAuth 2.0, OpenID Connect (OIDC), API Keys, Multi-Factor Authentication (MFA).
* **Access Control**: Discretionary (DAC), Mandatory (MAC), Role-Based (RBAC), Attribute-Based (ABAC), Relationship-Based (ReBAC).
* **Cryptography**: Password hashing (Bcrypt, Argon2), Salting, Digital Signatures.
* **Security Protections**: Mitigating CSRF, XSS, MITM, Audit logging, preventing info leakage via obfuscated error messages, and constant-time password comparisons to prevent timing attacks.

### 6. Validation & Transformation Pipeline
* **Validation Types**: Syntactic (format checks like email/phone), Semantic (domain rules like age boundaries), Type validation.
* **Server-Side Validation**: Why server-side validation is the true security gateway despite client-side UX checks. The "Fail Fast" principle.
* **Transformations & Normalization**: Type casting (string $\rightarrow$ integer), trimming whitespace, lowercasing emails, phone number formatting, input sanitization against SQL Injection (SQLi) and Cross-Site Scripting (XSS).

### 7. Middleware Architecture
* **Request Lifecycle**: Pre-request processing, short-circuiting responses, post-response execution.
* **Chaining & Ordering**: Correct sequence flow: `Logging` $\rightarrow$ `Security Headers` $\rightarrow$ `CORS` $\rightarrow$ `Body Parsing` $\rightarrow$ `Auth` $\rightarrow$ `Validation` $\rightarrow$ `Controller` $\rightarrow$ `Error Handler`.
* **Custom Middlewares**: Rate limiting, CSRF protection, request tracking, compression, structured logging.

### 8. Request Context & Scope
* **Request-Scoped State**: Passing metadata (User identity, Request IDs, Trace IDs, Permissions) across middlewares and handlers without coupling layer parameters.
* **Context Lifecycle**: Cleanup strategies, request timeouts, cancellation signals, memory leak prevention.

### 9. Handlers, Controllers & Layered Architecture
* **Layered Architecture**: Presentation Layer (Controllers/Routes) $\rightarrow$ Business Logic Layer (Services) $\rightarrow$ Data Access Layer (Repositories/DB).
* **REST Best Practices**: Resource-oriented URI design, pagination (offset vs. cursor), searching, sorting, filtering, consistent JSON response envelopes.

### 10. Databases & Persistence
* **SQL vs. NoSQL**: Relational (PostgreSQL, MySQL) vs. Non-Relational (MongoDB, Redis).
* **Core Theory**: ACID properties (Atomicity, Consistency, Isolation, Durability), CAP Theorem (Consistency, Availability, Partition Tolerance).
* **Optimization**: Schema design, indexing strategies (B-Tree, Hash, GIN), query optimization, connection pooling, database migrations.

### 11. Business Logic Layer (BLL) & SOLID Principles
* **Design Principles**: Single Responsibility (SRP), Open/Closed (OCP), Dependency Inversion (DIP), Separation of Concerns.
* **Domain Models & Services**: Isolating core business rules from HTTP frameworks and database drivers.

### 12. Caching Strategies
* **Cache Patterns**: Cache-Aside (Lazy Loading), Write-Through, Write-Behind (Write-Back), Read-Through.
* **Eviction Policies**: Least Recently Used (LRU), Least Frequently Used (LFU), Time-To-Live (TTL), First-In-First-Out (FIFO).
* **Multi-Level Caching**: L1 In-Memory Cache (RAM) + L2 Distributed Cache (Redis/Memcached). Cache Hit/Miss ratio optimization.

### 13. Asynchronous Task Queues & Background Workers
* **Offloading Heavy Operations**: Moving email delivery, image resizing, PDF generation, and third-party webhooks out of the synchronous HTTP request-response cycle.
* **Architecture**: Task Producers $\rightarrow$ Message Broker / Queue (Redis / RabbitMQ) $\rightarrow$ Worker Consumers.
* **Reliability**: Retries, exponential backoff, dead-letter queues (DLQ), task prioritization, rate limiting.

### 14. Full-Text Search Engines (ElasticSearch)
* **Mechanics**: Inverted Index, Term Frequency / Inverse Document Frequency (TF-IDF), Segments, Shards, Replicas.
* **Use Cases**: Typeahead search, log analytics, fuzzy searching, aggregations, relevance scoring.

### 15. Resilience, Logging & Observability
* **Three Pillars of Observability**: Logs, Metrics, Traces.
* **Structured Logging**: JSON logging, log levels (`debug`, `info`, `warn`, `error`, `fatal`), log correlation IDs.
* **Monitoring**: Infrastructure & Application Performance Monitoring (Prometheus, Grafana, Sentry), alert threshold management.
* **Graceful Shutdown**: Intercepting OS signals (`SIGTERM`, `SIGINT`), stopping new connections, completing in-flight requests, closing DB pools safely before process termination.

### 16. Security, Performance & Scalability
* **OWASP Vulnerability Defenses**: SQLi, NoSQLi, XSS, CSRF, Broken Auth, Insecure Deserialization.
* **Performance Tuning**: Resolving N+1 query problems, batching database queries, memory leak profiling, zero-copy payload streaming.
* **Real-Time Communications**: WebSockets, Server-Sent Events (SSE), Pub/Sub architecture.
* **DevOps & Infrastructure**: 12-Factor App principles, Docker containerization, Kubernetes orchestration, CI/CD pipelines, Horizontal vs. Vertical scaling, Blue-Green & Rolling deployment strategies.

---

## 📁 Repository Directory Structure

```text
Backend-From-First-Principles/
├── index.md                             # Master Table of Contents & Theory Notes Index
├── readme.md                            # Main Project Documentation & Curriculum
├── day01/                               # Day 01: Core HTTP & Express Backend Deep Dive
│   ├── notes/                           # 📚 11 Theory Notes (Markdown)
│   └── code/                            # 💻 Production-Grade Express Codebase
├── day02/                               # Day 02: Express Routing & URL Architecture
│   ├── notes/                           # 📚 6 Theory Notes (Markdown)
│   └── code/                            # 💻 Production-Grade Express Routing Codebase
└── day03/                               # Day 03: Serialization & Deserialization Deep Dive
    ├── notes/                           # 📚 6 Theory Notes (Markdown)
    └── code/                            # 💻 Express / Node.js Serialization Codebase & Benchmarks
```

---

## 🤝 How to Use This Repository

1. **Study the Theory**: Start with the **[Theory Notes Index](./index.md)** to build a conceptual understanding of each system component.
2. **Follow the Implementation Guides**: Read through **[day01/code/implementation-guide](./day01/code/implementation-guide/README.md)** for step-by-step code walkthroughs.
3. **Run and Test the Code**: Explore **[day01/code](./day01/code/README.md)**, run the Express server, and execute the provided `cURL` commands to see the principles in action.