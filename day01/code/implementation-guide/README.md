# Day 01: Express Backend Implementation Guide (From First Principles)

Welcome to the **Step-by-Step Implementation Guide** for the Day 01 Express.js backend codebase. This guide is designed for developers who want to build, understand, and master an Express backend from scratch.

Every chapter in this guide contains:
* 🛠️ **Exact Terminal Commands**: Setup and testing commands (`npm`, `curl`).
* 💻 **Complete, Copy-Pasteable Source Code**: 100% functional ES Module JavaScript code.
* 📖 **Deep Line-by-Line Code Explanations**: First-principles breakdown of why every line of code was written.

---

## 📚 Guide Table of Contents

| Chapter Guide | Topic Covered | Implementation File |
| :--- | :--- | :--- |
| **[Chapter 01](./01-setup-and-project-structure.md)** | Project Setup & ES Module Configuration | `package.json` |
| **[Chapter 02](./02-raw-tcp-http-parser.md)** | First-Principles Raw TCP Socket HTTP Server | `src/raw-http-server.js` |
| **[Chapter 03](./03-stateless-jwt-auth.md)** | Stateless JWT Authentication Middleware | `src/middlewares/auth.middleware.js` |
| **[Chapter 04](./04-security-headers-middleware.md)** | Defensive HTTP Security Headers Middleware | `src/middlewares/security-headers.middleware.js` |
| **[Chapter 05](./05-cors-preflight-middleware.md)** | Custom CORS Preflight `OPTIONS` Middleware | `src/middlewares/cors.middleware.js` |
| **[Chapter 06](./06-rest-verbs-and-idempotency.md)** | REST Verbs & Idempotency Handlers | `src/controllers/user.controller.js` |
| **[Chapter 07](./07-status-codes-and-error-handling.md)** | Custom Error Hierarchy & Global Error Handler | `src/errors/api-error.js` & `src/middlewares/error.middleware.js` |
| **[Chapter 08](./08-etag-caching-middleware.md)** | ETag Computation & `304 Not Modified` Caching | `src/middlewares/etag-cache.middleware.js` |
| **[Chapter 09](./09-content-negotiation-compression.md)** | Gzip & Brotli Content Negotiation Compression | `src/middlewares/compression.middleware.js` |
| **[Chapter 10](./10-streaming-uploads-and-sse.md)** | Streaming File Uploads & Server-Sent Events (SSE) | `src/controllers/stream.controller.js` |
| **[Chapter 11](./11-server-assembly-and-testing.md)** | App Assembly, Server Entry, & Testing Playbook | `src/app.js` & `src/server.js` |

---

## ⚡ Quickstart Commands

```bash
# 1. Create directory structure
mkdir -p day01/code/src/{errors,middlewares,controllers}

# 2. Navigate to project root
cd day01/code

# 3. Install dependencies
npm install

# 4. Start main Express server
npm start

# 5. In another terminal, run raw TCP server
npm run raw-server
```
