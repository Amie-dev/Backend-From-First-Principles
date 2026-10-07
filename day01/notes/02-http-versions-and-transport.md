# Chapter 02: Transport Protocols & HTTP Evolution

## 1. Transport Layer Foundation (TCP vs. UDP)

HTTP requires an underlying transport protocol to move data across the internet. Historically, HTTP relied exclusively on **TCP (Transmission Control Protocol)** due to its guarantee of reliable, ordered delivery. HTTP/3 introduced a paradigm shift by adopting **QUIC**, which runs on top of **UDP (User Datagram Protocol)**.

```
+-------------------------------------------------------------------------+
|                              HTTP Protocol                              |
+------------------------------------+------------------------------------+
|  HTTP/1.0 | HTTP/1.1 | HTTP/2.0      |             HTTP/3.0               |
+------------------------------------+------------------------------------+
|                TCP                 |          QUIC (over UDP)           |
+------------------------------------+------------------------------------+
```

---

## 2. Comprehensive Comparison of HTTP Versions

| Metric / Feature | HTTP/1.0 | HTTP/1.1 | HTTP/2.0 | HTTP/3.0 |
| :--- | :--- | :--- | :--- | :--- |
| **Transport Protocol** | TCP | TCP | TCP | QUIC (over UDP) |
| **Connection Model** | New TCP per request | Persistent (`Keep-Alive`) | Single Multiplexed TCP | Single Multiplexed QUIC |
| **Format** | Plain Text | Plain Text | Binary Frames | Binary Frames |
| **Head-of-Line (HoL) Blocking** | Severe (Connection level) | Application level (Pipelining) | Eliminated at HTTP level; present at TCP level | Completely Eliminated |
| **Multiplexing** | No | No | Yes (Interleaved frames) | Yes (Independent streams) |
| **Header Compression** | None | None | Yes (HPACK) | Yes (QPACK) |
| **Handshake Latency** | 1-RTT (TCP) + 2-RTT (TLS) | 1-RTT (TCP) + 2-RTT (TLS) | 1-RTT (TCP) + 2-RTT (TLS) | 0-RTT or 1-RTT (TLS 1.3 built-in) |

---

## 3. Detailed Breakdown of HTTP Evolution

### 3.1 HTTP/1.0: Short-Lived Connections
* **Mechanism**: Every HTTP request opens a brand new TCP connection, exchanges data, and immediately terminates the connection.
* **Flaw**: Significant performance penalty caused by repeated TCP 3-way handshakes (`SYN` $\rightarrow$ `SYN-ACK` $\rightarrow$ `ACK`) and TLS handshakes for every CSS file, JS file, and image.

```
Client                                      Server
  | --- SYN ----------------------------------> | (TCP Handshake)
  | <-- SYN-ACK -------------------------------+
  | --- ACK ----------------------------------> |
  | --- GET /index.html ----------------------> | (Request)
  | <-- 200 OK (HTML Payload) -----------------+ (Response)
  | --- FIN ----------------------------------> | (Close Connection)
```

---

### 3.2 HTTP/1.1: Persistent Connections & Head-of-Line Blocking
* **Mechanism**: Introduces `Connection: keep-alive` by default. Multiple requests reuse a single TCP connection.
* **Flaw (Head-of-Line Blocking)**: HTTP/1.1 requires responses to be returned in the exact order requests were received. If Request 1 (a slow database query) takes 5 seconds, Request 2 (a tiny image) must wait behind Request 1, even if the server processed Request 2 instantly.

```
HTTP/1.1 Connection Queue:
[Request 1 (Slow)] ===> [Request 2 (Fast)] ===> [Request 3 (Fast)]
       |
       v (Blocks all requests behind it until complete)
   Processing...
```

---

### 3.3 HTTP/2.0: Binary Framing & Multiplexing
* **Binary Framing**: Text messages are converted into binary frames (`HEADERS`, `DATA`, `SETTINGS`, `RST_STREAM`).
* **Streams & Multiplexing**: Multiple requests and responses are split into frames with unique **Stream IDs** and interleaved across a single TCP connection simultaneously.
* **HPACK**: Headers are compressed into dynamic index tables, eliminating redundant header bytes.

```
HTTP/2 Connection (Single TCP Connection):
+-------------------------------------------------------------------+
| [Stream 1: Frame 1] | [Stream 3: Frame 1] | [Stream 1: Frame 2]   |
+-------------------------------------------------------------------+
```

* **Flaw (TCP-level HoL Blocking)**: Because HTTP/2 uses a single TCP connection, if a single TCP packet is dropped at the network layer, TCP stops processing *all* streams until the missing packet is retransmitted.

---

### 3.4 HTTP/3.0: QUIC Protocol over UDP
* **QUIC (Quick UDP Internet Connections)**: Replaces TCP with a custom transport layer running on top of UDP.
* **Stream Independence**: Each HTTP/3 stream is handled independently by QUIC. Packet loss on Stream 1 does **not** stall data delivery on Stream 2 or Stream 3.
* **0-RTT / 1-RTT Handshake**: Merges transport and TLS 1.3 handshakes into a single round trip.
* **Connection Migration**: Connections are identified by a unique 64-bit Connection ID rather than an IP/Port tuple. Changing networks (e.g., switching from Wi-Fi to cellular LTE) does not drop active connections.

---

## 4. JavaScript Pseudocode: Simulating HTTP Connection Models

```javascript
// ==============================================================================
// JavaScript / Node.js Simulation comparing HTTP/1.1 Sequential Pipeline Blocking vs HTTP/2 Multiplexing
// ==============================================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- HTTP/1.1 Pipeline Connection (Sequential Execution / HoL Blocking) ---
class HTTP11Connection {
  async sendRequests(requests) {
    const results = [];
    console.log("[HTTP/1.1] Processing requests sequentially over 1 TCP connection...");
    
    for (const req of requests) {
      console.log(`[HTTP/1.1] Waiting for Request ${req.id} (${req.duration}ms)...`);
      await sleep(req.duration); // HoL Blocking: Req N+1 must wait for Req N
      results.push(`Response ${req.id}`);
    }
    return results;
  }
}

// --- HTTP/2 Connection (Multiplexed Streams / Non-blocking) ---
class HTTP2Connection {
  async sendRequests(requests) {
    console.log("[HTTP/2] Multiplexing streams concurrently over single TCP connection...");
    
    // Each request is assigned a Stream ID and processed concurrently via Promise.all
    const streamPromises = requests.map(async (req) => {
      console.log(`[HTTP/2 Stream ${req.id}] Frame sent. Processing concurrently...`);
      await sleep(req.duration);
      console.log(`[HTTP/2 Stream ${req.id}] Frame received back!`);
      return `Response ${req.id}`;
    });

    return await Promise.all(streamPromises);
  }
}

// Execution Demonstration
async function runSimulation() {
  const requests = [
    { id: 1, name: "slow_db_query", duration: 500 },
    { id: 2, name: "fast_avatar_img", duration: 100 },
    { id: 3, name: "small_css_file", duration: 100 }
  ];

  const h1 = new HTTP11Connection();
  const h2 = new HTTP2Connection();

  console.log("=== HTTP/1.1 Execution ===");
  await h1.sendRequests(requests);

  console.log("\n=== HTTP/2 Execution ===");
  await h2.sendRequests(requests);
}

runSimulation();
```

---

## 5. Key Takeaways

1. **HTTP/1.0** suffered from TCP setup overhead per request.
2. **HTTP/1.1** introduced persistent connections (`Keep-Alive`), but suffered from **Application Head-of-Line Blocking**.
3. **HTTP/2.0** solved HTTP HoL blocking via **Binary Framing and Multiplexing**, but remained vulnerable to **TCP-level packet drop stalls**.
4. **HTTP/3.0** runs on **QUIC over UDP**, achieving true stream isolation, lower handshake latencies, and seamless network connection migration.
