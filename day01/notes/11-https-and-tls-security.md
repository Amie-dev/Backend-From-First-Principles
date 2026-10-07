# Chapter 11: Security, SSL/TLS & HTTPS

## 1. What is HTTPS?

**HTTPS (Hypertext Transfer Protocol Secure)** is standard HTTP communication encapsulated inside an encrypted **TLS (Transport Layer Security)** socket connection. HTTPS typically operates over TCP port `443` (compared to unencrypted HTTP on port `80`).

```
+-------------------------------------------------------------+
|                     HTTP Protocol (Layer 7)                 |
+-------------------------------------------------------------+
|                 TLS Encryption Tunnel (Layer 6)             |  <-- HTTPS Security Layer
+-------------------------------------------------------------+
|                     TCP Connection (Layer 4)                |
+-------------------------------------------------------------+
```

---

## 2. Core Security Pillars of TLS

TLS provides three essential security guarantees for web traffic:

1. **Confidentiality (Encryption)**: Prevents attackers from eavesdropping on data packets as they travel across public Wi-Fi networks and routers.
2. **Integrity (Tamper Prevention)**: Uses Message Authentication Codes (MAC / HMAC) to detect if packets have been altered in transit by a Man-in-the-Middle (MitM) attacker.
3. **Authentication (Identity Verification)**: Uses X.509 Digital Certificates signed by trusted **Certificate Authorities (CAs)** to verify that the server is legitimately owned by the claimed domain.

---

## 3. Asymmetric vs. Symmetric Encryption

TLS combines both asymmetric and symmetric cryptography to balance computational speed with security:

```
[Asymmetric Cryptography]               [Symmetric Cryptography]
Used during TLS Handshake only         Used for Bulk Data Payload Transfer
- Slow computational performance       - Extremely Fast (Hardware Accelerated)
- Uses Public/Private Key pairs         - Uses Single Shared Master Key
- Purpose: Authenticate & Exchange      - Purpose: Encrypt actual HTTP data
```

---

## 4. Modern TLS 1.3 Handshake Sequence

TLS 1.3 reduced the handshake latency from 2 Round-Trip Times (2-RTT in TLS 1.2) to **1 Round-Trip Time (1-RTT)** by combining key exchange with the hello messages.

```
Client                                                       Server
  |                                                             |
  | ----- ClientHello ----------------------------------------> |
  |       (Supported Ciphers, Client Random, ECDHE Key Share)   |
  |                                                             |
  | <---- ServerHello ----------------------------------------- |
  |       (Selected Cipher, Server Random, Server Key Share)    |
  | <---- EncryptedExtensions & Server Certificate ------------ |
  | <---- CertificateVerify & Finished ------------------------ |
  |                                                             |
  | [Both sides compute Shared Master Symmetric Key via ECDHE]  |
  |                                                             |
  | ----- Finished -------------------------------------------> |
  |                                                             |
  | ===== ENCRYPTED HTTP APPLICATION DATA TRAFFIC BEGINS ====== |
```

---

## 5. JavaScript Pseudocode: Node.js TLS Handshake & Encrypted Socket Simulation

```javascript
// ==============================================================================
// JavaScript / Node.js Simulation of TLS Handshake & Encrypted Socket Wrapping
// Demonstrates key exchange, certificate verification, and AES payload encryption
// ==============================================================================

const crypto = require("crypto");

class MockTLSSocket {
  constructor(rawTcpSocket) {
    this.tcpSocket = rawTcpSocket;
    this.sharedSymmetricKey = null;
  }

  performTls13Handshake(serverHostname) {
    console.log(`[TLS HANDSHAKE] Initiating TLS 1.3 handshake with ${serverHostname}...`);

    // 1. Step 1: ClientHello (Send Client ECDHE Public Key Share)
    const clientPrivateKey = 42; // Simplified ECDHE DH Private Key representation
    const clientPublicShare = Math.pow(5, clientPrivateKey) % 23;
    console.log(`[TLS HANDSHAKE] Sent ClientHello with Key Share: ${clientPublicShare}`);

    // 2. Step 2: ServerHello & Certificate Transmission
    const serverPublicShare = 8;
    const serverCertificate = `CERT_SIGNED_BY_CA_FOR_${serverHostname}`;

    // 3. Verify Server Certificate Identity
    if (!this.verifyCertificate(serverCertificate, serverHostname)) {
      throw new Error("TLS Handshake Failed: Invalid Server Certificate!");
    }

    // 4. Step 3: Compute Shared Master Secret Key (Diffie-Hellman)
    const rawSharedSecret = Math.pow(serverPublicShare, clientPrivateKey) % 23;

    // Derive 256-bit Symmetric Session Key using SHA-256
    this.sharedSymmetricKey = crypto
      .createHash("sha256")
      .update(rawSharedSecret.toString())
      .digest("hex");

    console.log(`[TLS HANDSHAKE] Handshake Complete! Master Session Key Derived: ${this.sharedSymmetricKey.slice(0, 16)}...`);
  }

  verifyCertificate(certStr, expectedHost) {
    console.log(`[TLS CERT] Verifying certificate authority chain for ${expectedHost}...`);
    return certStr.includes(expectedHost);
  }

  sendEncryptedHttpRequest(rawHttpRequestStr) {
    if (!this.sharedSymmetricKey) {
      throw new Error("Cannot send data over unencrypted socket!");
    }

    // Simulating Symmetric AES Payload Encryption
    const encryptedBytes = `ENCRYPTED[${rawHttpRequestStr}] WITH_KEY[${this.sharedSymmetricKey.slice(0, 8)}]`;
    console.log(`\n[NETWORK WIRE] Transmitting encrypted TLS payload across port 443:`);
    console.log(`  --> ${encryptedBytes}`);
    return encryptedBytes;
  }
}

// Execution Test
const mockRawSocket = {};
const tlsTunnel = new MockTLSSocket(mockRawSocket);

// Establish TLS connection
tlsTunnel.performTls13Handshake("api.example.com");

// Transmit plain text HTTP request safely inside the TLS encrypted tunnel
const plainHttpRequest = "GET /api/v1/user/profile HTTP/1.1\r\nHost: api.example.com\r\n\r\n";
tlsTunnel.sendEncryptedHttpRequest(plainHttpRequest);
```

---

## 6. Key Takeaways

1. **HTTPS** is HTTP running over a **TLS encrypted socket tunnel** on port 443.
2. TLS provides **Confidentiality** (encryption), **Integrity** (anti-tampering), and **Authentication** (digital certificates).
3. **Asymmetric key exchange** (ECDHE) is used during the handshake to establish a **shared symmetric session key**.
4. Modern **TLS 1.3** reduces handshake latency to **1-RTT** (and 0-RTT for resumed connections).
