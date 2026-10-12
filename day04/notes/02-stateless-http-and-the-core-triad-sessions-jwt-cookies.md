# Chapter 02: Stateless HTTP & The Core Triad (Sessions, JWTs, and Cookies)

## 1. The Core Distributed Systems Problem: HTTP Is Stateless

The foundational protocol of the World Wide Web, HTTP (Hypertext Transfer Protocol), was architected as a **stateless request-response protocol**. 

```
Client Browser                                             Backend Server
     │                                                           │
     │ ────── 1. GET /notes (Who am I?) ───────────────────────► │
     │ ◄───── 2. 200 OK [Notes List] ─────────────────────────── │
     │    (TCP connection may persist or close, state discarded) │
     │                                                           │
     │ ────── 3. POST /notes { title: "Secret" } ──────────────► │
     │ ◄───── 4. 401 Unauthorized? (Server forgot client!) ──── │
```

### What Statelessness Actually Means:
1. **Isolated Requests**: By default, the server processes each incoming HTTP request in complete isolation. Request $N+1$ knows nothing about Request $N$.
2. **No Native Memory**: HTTP lacks a built-in memory mechanism across requests. The TCP socket or TLS session simply delivers bytes; the application layer treats every request as coming from an anonymous stranger unless identity context is explicitly attached.
3. **The Engineering Challenge**: To build e-commerce carts, user profiles, authenticated dashboards, and collaborative apps, we must inject an **identity state abstraction** on top of a stateless transport layer.

This state abstraction is maintained through three distinct engineering building blocks: **Sessions**, **JWTs**, and **Cookies**.

---

## 2. Demystifying the Confusion: Sessions vs. JWTs vs. Cookies

A pervasive point of confusion among engineers is treating Sessions, JWTs, and Cookies as mutually exclusive alternatives. They belong to completely different architectural categories:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            THE IDENTITY TRIAD                               │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ 1. Storage & State Model      │ Session: Server-side record in RAM/DB/Redis │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ 2. Token / Payload Format     │ JWT: Self-contained cryptographic token     │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ 3. Client Transport Mechanism │ Cookie: Browser-managed HTTP storage/header │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

> [!NOTE]
> * **A Cookie is NOT an authentication method**; it is an HTTP transport and storage mechanism. A cookie can transport a Session ID, a JWT, or arbitrary preference data.
> * **A Session is a state storage strategy**; it lives on the server and maps a client reference back to server RAM, Redis, or SQL.
> * **A JWT is a data structure format**; it can be stored in an HTTP cookie, sent in an `Authorization: Bearer` header, or stored in browser local storage.

---

## 3. Building Block 1: Server-Side Sessions

In a **session-based architecture**, the server retains authoritative state about the authenticated user in its own data store.

```
Client (Browser)                                    Server & Session Store
      │                                                        │
      │ ── 1. POST /login { email, password } ───────────────► │
      │                                                        │ 2. Verify password hash
      │                                                        │ 3. Generate random Session ID
      │                                                        │ 4. Save to Redis:
      │                                                        │    session:abc123xyz -> { userId: 42 }
      │ ◄─ 5. Set-Cookie: sid=abc123xyz; HttpOnly; Secure ──── │
      │                                                        │
      │ ── 6. GET /notes (Cookie: sid=abc123xyz) ────────────► │
      │                                                        │ 7. Lookup Redis: 'session:abc123xyz'
      │                                                        │ 8. Found userId 42! Attach req.user
      │ ◄─ 9. 200 OK [Notes] ───────────────────────────────── │
```

### Key Mechanics of Sessions:
1. **Opaque Identifier**: The client receives only a high-entropy cryptographically random string (e.g., `sid_f89a31b2...`). This string contains **zero personal information**.
2. **Server-Side State**: All metadata (user ID, role, login timestamp, device info) lives inside server memory, a relational database, or an in-memory key-value store like **Redis**.
3. **Instant Revocation**: If an account is compromised or a user clicks "Log out of all devices", the server deletes the session keys from Redis. The client's cookie immediately becomes useless on the next request.

### Session Storage Comparison:

| Storage Type | Scalability | Latency | Resiliency | Operational Cost |
| :--- | :--- | :--- | :--- | :--- |
| **In-Memory (Node RAM)** | ❌ Single node only | Extremely fast (<0.1ms) | ❌ Wiped on app restart/crash | Zero extra setup |
| **Relational DB (Postgres/MySQL)** | ⚠️ High DB connection load | Slow (5–20ms per query) | Persistent across reboots | High DB I/O overhead |
| **Distributed Cache (Redis)** | ✅ High (Shared across all nodes) | Very fast (1–3ms via RAM) | Supports TTL and clustering | Requires Redis infrastructure |

---

## 4. Building Block 2: JSON Web Tokens (JWT)

A **JSON Web Token (JWT)** (defined by RFC 7519) is an open, industry-standard method for representing claims securely between two parties. Unlike a session ID, a JWT is **stateless and self-contained**: it carries the user's data inside the token itself.

### Anatomy of a JWT: `Header.Payload.Signature`

A JWT string is formed by concatenating three Base64URL-encoded strings separated by periods (`.`):

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfNDIiLCJyb2xlIjoidXNlciIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ.u7Z0S2Qf31JbQY_k8rFv_dG7qKz1l9a2Bx8c7X6w9sM
│───────────────────────────────────│.│─────────────────────────────────────────────────────────────────────────────────│.│──────────────────────────────────────────│
               HEADER                                                       PAYLOAD                                                           SIGNATURE
```

```
┌─────────────────────────────────┐
│ 1. HEADER (JSON)                │ ──► Algorithm & Token Type
│ { "alg": "HS256", "typ": "JWT" }│     Base64URL encoded
└─────────────────────────────────┘
                 │
┌─────────────────────────────────┐
│ 2. PAYLOAD (JSON Claims)        │ ──► Subject, Expiry, Custom Roles
│ { "sub": "usr_42", "exp": ... } │     Base64URL encoded (NOT ENCRYPTED!)
└─────────────────────────────────┘
                 │
┌─────────────────────────────────┐
│ 3. SIGNATURE (HMAC / RSA)       │ ──► HMACSHA256(Base64(H) + "." + Base64(P), SecretKey)
│ Computed cryptographic hash     │     Detects tampering & verifies integrity
└─────────────────────────────────┘
```

### Standard Registered Claims:
* `sub` (*Subject*): The unique identifier of the principal (e.g., `"usr_9823"`).
* `iat` (*Issued At*): UNIX timestamp when the token was signed.
* `exp` (*Expiration Time*): UNIX timestamp after which the token is invalid.
* `iss` (*Issuer*): The identity provider issuing the token (e.g., `"https://auth.company.com"`).
* `aud` (*Audience*): The target recipient service (e.g., `"https://api.company.com"`).

### Critical Security Truths Regarding JWTs:
> [!WARNING]
> 1. **Base64URL is NOT Encryption**: Anyone who intercepts a JWT can decode the payload using standard tools like `atob()` or `jwt.io`. **Never place plaintext passwords, credit card numbers, or internal database secrets inside a JWT payload.**
> 2. **Signatures Guarantee Integrity, Not Secrecy**: The signature proves that the payload was created by the secret holder and has not been altered in transit; it does not hide the content.
> 3. **The Alg=None Trap**: Attackers historically bypassed verification by changing `{"alg": "none"}` in the header and stripping the signature. Secure libraries must explicitly reject unsigned tokens.

---

## 5. Building Block 3: Browser Cookies as Secure Transport

A **Cookie** is a stateful client-side storage mechanism managed directly by web browsers. When an HTTP response includes the `Set-Cookie` header, the browser automatically stores the key-value pair and sends it back in the `Cookie` request header for subsequent requests matching the path and domain.

```http
HTTP/1.1 200 OK
Set-Cookie: session_id=e7b4...; Path=/; Domain=.example.com; HttpOnly; Secure; SameSite=Lax; Max-Age=86400
```

### Critical Security Flags for Cookies:

| Flag / Attribute | Purpose | Security Protection |
| :--- | :--- | :--- |
| `HttpOnly` | Disallows client-side JavaScript (`document.cookie`) from reading the cookie value. | **Mitigates XSS (Cross-Site Scripting)** token theft. Malicious scripts injected into the DOM cannot extract the session key. |
| `Secure` | Instructs the browser to transmit the cookie strictly over encrypted TLS connections (`https://`). | **Prevents Man-in-the-Middle (MitM)** eavesdropping over unencrypted public Wi-Fi. |
| `SameSite=Strict` | The cookie is only sent on requests originating from the exact same site domain. | **Maximum CSRF Protection**. Never sent on external cross-site links. |
| `SameSite=Lax` | The cookie is sent on same-site requests and top-level navigation (GET links from external sites). | **Balanced Default**. Prevents CSRF on state-changing requests (`POST`, `PUT`, `DELETE`). |
| `SameSite=None` | Sent on all cross-site requests (requires `Secure` to be true). | Used for third-party widgets and embedded iframes. Highly vulnerable to CSRF without anti-CSRF tokens. |
| `Max-Age` / `Expires` | Explicit TTL in seconds or date string. | Limits persistence in local disk storage. Without this, it defaults to an ephemeral in-memory session cookie. |

---

## 6. Comprehensive Comparison: The Identity Triad

| Dimension | Server-Side Session | JSON Web Token (JWT) | HTTP Cookie |
| :--- | :--- | :--- | :--- |
| **Category** | State Storage Pattern | Token Data Format | Transport & Storage Mechanism |
| **Where State Lives** | Server RAM / Redis / DB | Inside the Client Token String | Browser Storage Cache |
| **Storage Overhead** | $O(N)$ on the server (grows with users) | $O(1)$ on server; $O(N)$ in network bandwidth | $4\text{ KB}$ max storage per cookie in browser |
| **Revocation Capability** | **Instant** (delete from Redis) | **Difficult** (requires revocation list or short TTL) | Cleared via browser or `Set-Cookie` expiry |
| **Primary Vulnerability** | Store downtime / memory leaks | Stolen token replay before `exp` | CSRF (if configured without proper `SameSite`) |
| **Best Used For** | Monolithic & SaaS browser apps | Mobile apps & distributed microservices | Transporting Session IDs or Refresh Tokens |

---

## 7. Express/Node.js Pseudocode: The Complete Triad in Action

The following runnable TypeScript/Node.js example implements:
1. A **Redis-style In-Memory Session Engine**.
2. A **Native Cryptographic HMAC-SHA256 JWT Generator & Verifier** (using Node.js standard `crypto`).
3. An Express server handling both **Stateful Session Cookies** and **Stateless JWT Headers**.

```typescript
// ==============================================================================
// Chapter 02: Sessions, JWTs, and Secure Cookies in Node.js & Express
// ==============================================================================

import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const JWT_SECRET = "super_secret_cryptographic_key_at_least_32_bytes_long";

// ------------------------------------------------------------------------------
// 1. In-Memory Session Engine (Simulating Redis Store)
// ------------------------------------------------------------------------------
interface SessionData {
  userId: string;
  username: string;
  role: string;
  createdAt: number;
  expiresAt: number;
}

class SessionStore {
  private sessions = new Map<string, SessionData>();

  create(data: Omit<SessionData, "createdAt" | "expiresAt">, ttlSeconds: number = 3600): string {
    const sessionId = "sid_" + crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    this.sessions.set(sessionId, {
      ...data,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000
    });
    return sessionId;
  }

  get(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  destroy(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }
}

const sessionStore = new SessionStore();

// ------------------------------------------------------------------------------
// 2. Pure Node.js Cryptographic JWT Engine (Zero External Dependencies)
// ------------------------------------------------------------------------------
class CustomJWT {
  private static base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  private static base64UrlDecode(str: string): string {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    return Buffer.from(str, "base64").toString("utf-8");
  }

  public static sign(payload: Record<string, any>, secret: string, expiresInSeconds: number): string {
    const header = { alg: "HS256", typ: "JWT" };
    const enrichedPayload = {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(enrichedPayload));

    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  public static verify(token: string, secret: string): Record<string, any> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify Algorithm in Header
    const header = JSON.parse(this.base64UrlDecode(headerB64));
    if (header.alg !== "HS256") {
      throw new Error("Unsupported or tampered algorithm");
    }

    // Verify Cryptographic Signature
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const isMatch = crypto.timingSafeEqual(
      Buffer.from(signatureB64),
      Buffer.from(expectedSignature)
    );

    if (!isMatch) {
      throw new Error("Invalid cryptographic signature");
    }

    // Verify Expiration
    const payload = JSON.parse(this.base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) {
      throw new Error("Token has expired");
    }

    return payload;
  }
}

// ------------------------------------------------------------------------------
// 3. Cookie Parsing Helper (Simulates cookie-parser middleware)
// ------------------------------------------------------------------------------
function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;

  cookieHeader.split(";").forEach((cookie) => {
    let [name, ...rest] = cookie.split("=");
    name = name?.trim();
    if (!name) return;
    const value = rest.join("=").trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

// ------------------------------------------------------------------------------
// 4. Express Routes Demonstrating Sessions & Cookies
// ------------------------------------------------------------------------------

// Stateful Login: Creates Session & Sets Secure Cookie
app.post("/auth/session-login", (req: Request, res: Response) => {
  const { username, password } = req.body;

  // In production: verify password hash against database
  if (username === "aminul" && password === "correct_pass") {
    const sessionId = sessionStore.create({
      userId: "usr_101",
      username: "aminul",
      role: "admin"
    });

    // Set Hardened Cookie Attributes
    res.setHeader("Set-Cookie", [
      `sid=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`
    ]);

    res.json({ message: "Stateful session established", sessionId });
    return;
  }

  res.status(401).json({ error: "Invalid credentials" });
});

// Stateful Middleware: Validates Session Cookie
function sessionAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies["sid"];

  if (!sessionId) {
    res.status(401).json({ error: "Missing session cookie" });
    return;
  }

  const session = sessionStore.get(sessionId);
  if (!session) {
    res.status(401).json({ error: "Session invalid or expired" });
    return;
  }

  (req as any).user = session;
  next();
}

// Stateful Logout: Destroys Session in Store & Clears Cookie
app.post("/auth/session-logout", (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies["sid"];

  if (sessionId) {
    sessionStore.destroy(sessionId);
  }

  // Instruct browser to delete cookie immediately
  res.setHeader("Set-Cookie", [
    `sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  ]);

  res.json({ message: "Successfully logged out and session revoked" });
});

// ------------------------------------------------------------------------------
// 5. Express Routes Demonstrating Stateless JWTs
// ------------------------------------------------------------------------------

// Stateless Login: Issues Self-Contained JWT
app.post("/auth/jwt-login", (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (username === "aminul" && password === "correct_pass") {
    const token = CustomJWT.sign(
      { sub: "usr_101", username: "aminul", role: "admin" },
      JWT_SECRET,
      900 // 15 minutes TTL
    );

    res.json({ tokenType: "Bearer", accessToken: token, expiresIn: 900 });
    return;
  }

  res.status(401).json({ error: "Invalid credentials" });
});

// Stateless Middleware: Verifies Cryptographic Signature without DB Lookup
function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Bearer token" });
    return;
  }

  const rawToken = authHeader.split(" ")[1];
  try {
    const claims = CustomJWT.verify(rawToken, JWT_SECRET);
    (req as any).user = claims;
    next();
  } catch (err: any) {
    res.status(401).json({ error: "JWT verification failed", details: err.message });
  }
}

// Protected Route accessible via JWT
app.get("/api/dashboard", jwtAuthMiddleware, (req: Request, res: Response) => {
  res.json({
    message: "Welcome to stateless protected dashboard",
    user: (req as any).user
  });
});

export default app;
```

---

## 8. Architectural Rules to Remember

1. **Never send JWTs via basic un-scoped cookies without CSRF defense**: If storing tokens in cookies, always use `SameSite=Lax` or `SameSite=Strict`.
2. **Never store JWTs in Browser LocalStorage for high-security applications**: Any XSS vulnerability (e.g. from an untrusted NPM package) can execute `localStorage.getItem("token")` and exfiltrate the credential immediately.
3. **Session IDs should be at least 128 bits of cryptographic entropy**: Always use `crypto.randomBytes(32)` or standard UUID v4; never use auto-incrementing database integers or timestamps as session keys.
