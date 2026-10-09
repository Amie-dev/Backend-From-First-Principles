# Day 03: Serialization & Deserialization Codebase

This directory contains the production-grade **Express.js / Node.js code implementation** demonstrating all core concepts of serialization, custom stream body parsing, text vs binary wire format benchmarks, OSI layer stream reassembly, and safe JSON transformations covered in Day 03.

---

## 🛠️ Project Structure

```
day03/code/
├── package.json                       # Node.js dependencies & execution scripts ("type": "module")
├── README.md                          # Master instructions & cURL testing guide
├── implementation-guide/              # Detailed markdown walkthrough guides for each topic
│   ├── 01-language-barrier-and-wire-formats.md
│   ├── 02-custom-body-parser-middleware.md
│   ├── 03-text-vs-binary-serialization.md
│   ├── 04-safe-json-handling-and-edge-cases.md
│   ├── 05-osi-tcp-stream-reassembly.md
│   └── README.md
└── src/
    ├── server.js                      # Main HTTP server launcher (Port 3000)
    ├── app.js                         # Express app assembly & custom body parser setup
    ├── raw-json-parser.js             # Standalone stream body parser demo (Port 3002)
    ├── wire-format-benchmark.js       # Standalone JSON vs Binary buffer benchmark
    ├── safe-json-serializer.js        # Standalone safe JSON transformer demo (BigInt/Date/Circular)
    ├── osi-packet-simulator.js        # Standalone TCP packetization & stream reassembly simulator
    ├── controllers/
    │   └── serialization.controller.js # Endpoint controllers for registration & telemetry
    ├── middlewares/
    │   └── json-body-parser.middleware.js # First-principles stream body parser middleware
    ├── routes/
    │   └── api.routes.js              # Express API endpoints (/api/v1/...)
    ├── utils/
    │   ├── safe-json-transformer.js   # Custom JSON replacer & reviver logic
    │   └── binary-protocol-encoder.js # Low-level binary buffer encoder & benchmark tool
    └── simulators/
        └── osi-stream-packetizer.js   # Layer 4 TCP socket packetizer & Layer 7 reassembler
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
cd day03/code
npm install
```

### 2. Run Main Express Application
```bash
npm start
```
*Server runs on `http://localhost:3000`*

---

## 📜 NPM Demonstration Scripts

| Script Command | Description |
| :--- | :--- |
| `npm start` | Starts the main Express server with custom body parsing middleware. |
| `npm run dev` | Runs main Express server in `--watch` development mode. |
| `npm run raw-parser` | Runs standalone custom stream parser testing valid, malformed, and payload-limit scenarios. |
| `npm run wire-benchmark` | Runs payload size comparison between JSON string and compact binary buffer encoding. |
| `npm run safe-json` | Demonstrates safe JSON handling for `BigInt`, `Date`, `Set`, `Map`, and circular references. |
| `npm run osi-simulator` | Simulates Layer 4 TCP packet fragmentation and Layer 7 stream reassembly. |

---

## 🧪 Testing Endpoints with `cURL`

### 1. Health Check
```bash
curl -v http://localhost:3000/api/v1/health
```

### 2. Register User (Tests Custom JSON Body Parser Middleware)
```bash
curl -v -X POST http://localhost:3000/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{"username": "alex_dev", "email": "alex@example.com", "role": "ADMIN"}'
```

### 3. Test Malformed JSON Error Handling (Returns 400 Bad Request)
```bash
curl -v -X POST http://localhost:3000/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{"username": alex_dev}'
```

### 4. Ingest Telemetry (Tests JSON vs Binary Benchmark Stats)
```bash
curl -v -X POST http://localhost:3000/api/v1/telemetry/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "sensorId": "SENS-NODE-99",
    "timestamp": 1718000000000,
    "readings": [23.4, 23.6, 23.5, 24.1],
    "statusOk": true
  }'
```

### 5. Export Complex State (Tests Custom Safe JSON Transformer)
```bash
curl -v http://localhost:3000/api/v1/data/complex-export
```
