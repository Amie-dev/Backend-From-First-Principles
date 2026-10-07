# Day 01: Express.js Backend Code Implementation

This directory contains the production-grade **Express.js code implementation** demonstrating all 11 core concepts covered in Day 01 of **Backend From First Principles**.

---

## 🛠️ Project Structure

```
day01/code/
├── package.json                   # Node.js dependencies & execution scripts
├── README.md                      # Instructions & testing guide
└── src/
    ├── server.js                  # Main HTTP server entry point
    ├── app.js                     # Express app assembly (Middlewares & Routes)
    ├── raw-http-server.js         # Raw TCP socket HTTP server (No framework)
    ├── errors/
    │   └── api-error.js           # Custom RFC HTTP status code exception hierarchy
    ├── middlewares/
    │   ├── auth.middleware.js     # Stateless JWT authorization middleware
    │   ├── security-headers.middleware.js # Defensive HTTP security headers
    │   ├── cors.middleware.js     # Custom CORS preflight OPTIONS handler
    │   ├── etag-cache.middleware.js # ETag computation & 304 Not Modified revalidation
    │   ├── compression.middleware.js # Gzip / Brotli content negotiation compression
    │   └── error.middleware.js    # Global Express exception handler
    └── controllers/
        ├── user.controller.js     # REST API demonstrating Safe & Idempotent verbs
        └── stream.controller.js   # Disk streaming upload & Server-Sent Events (SSE)
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Main Express Server
```bash
npm start
```
*Server runs on `http://localhost:3000`*

### 3. Run the Low-Level Raw TCP Server (No Framework)
```bash
npm run raw-server
```
*Raw TCP HTTP server runs on `http://localhost:8080`*

---

## 🧪 Testing All Concepts with `cURL`

### 1. Chapter 01: Stateless JWT Login & Access
```bash
# Obtain stateless JWT token
curl -X POST http://localhost:3000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "alice", "password": "password123"}'
```

### 2. Chapter 04 & 06: Security Headers & CORS Preflight (`OPTIONS`)
```bash
# Test CORS Preflight OPTIONS Request
curl -v -X OPTIONS http://localhost:3000/api/v1/users \
     -H "Origin: https://frontend-app.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Authorization, Content-Type"
```

### 3. Chapter 05: HTTP Verbs & Idempotency
```bash
# GET Users (Safe & Idempotent)
curl -v http://localhost:3000/api/v1/users -H "Authorization: Bearer <YOUR_TOKEN>"

# POST Create User (NON-IDEMPOTENT - Creates a new entity each run)
curl -v -X POST http://localhost:3000/api/v1/users \
     -H "Authorization: Bearer <YOUR_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"name": "Charlie", "email": "charlie@example.com"}'

# PUT Replace User #1 (IDEMPOTENT - Leaves state identical on repeated runs)
curl -v -X PUT http://localhost:3000/api/v1/users/1 \
     -H "Authorization: Bearer <YOUR_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"name": "Alice Smith Updated", "email": "alice@example.com"}'

# DELETE User #1 (IDEMPOTENT - Returns 204 No Content)
curl -v -X DELETE http://localhost:3000/api/v1/users/1 \
     -H "Authorization: Bearer <YOUR_TOKEN>"
```

### 4. Chapter 08: ETag Caching & `304 Not Modified`
```bash
# Step 1: Initial request (Note the ETag header returned in response)
curl -v http://localhost:3000/api/v1/users -H "Authorization: Bearer <YOUR_TOKEN>"

# Step 2: Conditional revalidation request using returned ETag
curl -v http://localhost:3000/api/v1/users \
     -H "Authorization: Bearer <YOUR_TOKEN>" \
     -H 'If-None-Match: "<ETAG_VALUE_FROM_STEP_1>"'
# Expect HTTP 304 Not Modified with 0 body bytes!
```

### 5. Chapter 09: Content Negotiation & Gzip Compression
```bash
# Request gzip compressed payload
curl -v http://localhost:3000/api/v1/users \
     -H "Authorization: Bearer <YOUR_TOKEN>" \
     -H "Accept-Encoding: gzip"
```

### 6. Chapter 10: Real-time Server-Sent Events (SSE)
```bash
# Listen to live SSE event stream
curl -N http://localhost:3000/api/v1/stream/events
```
