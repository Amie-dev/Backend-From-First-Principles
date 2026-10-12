# Chapter 03: Stateful vs. Stateless vs. Hybrid Authentication Architectures

## 1. The Architectural Divide: Where Does State Belong?

In backend distributed systems, the choice of authentication architecture dictates how services scale, how databases are loaded, and how security incidents are mitigated. The primary question is:

$$\text{\textbf{Where does the authoritative truth about an authenticated session live?}}$$

```
STATEFUL (Server-Centric)                      STATELESS (Token-Centric)
       ┌──────────┐                                    ┌──────────┐
       │ Browser  │                                    │ Browser  │
       └────┬─────┘                                    └────┬─────┘
   Session  │                                       Bearer  │
      ID    │                                         JWT   │
            ▼                                               ▼
       ┌──────────┐                                    ┌──────────┐
       │ Backend  │ ──► Look up DB / Redis             │ Backend  │ ──► Verify Crypto Signature
       └──────────┘     (State on Server)              └──────────┘     (State on Wire)
```

---

## 2. Stateful Session Architecture

In a stateful model, every authenticated request is cross-referenced against a centralized server-side data store.

```
Client                             Server Node 1           Shared Redis Store
  │                                      │                         │
  │ ── 1. GET /api/data (Cookie: sid) ─► │                         │
  │                                      │ ── 2. GET sid_9918 ───► │
  │                                      │ ◄─ 3. Return user data ─│
  │                                      │    (Valid! Process)     │
  │ ◄─ 4. 200 OK [Data] ─────────────────│                         │
```

### Advantages of Stateful Systems:
1. **Instant, Absolute Revocation**:
   * If a user loses their phone, clicks *"Log out of all devices"*, or if an administrator bans an account, the server deletes the session record from Redis.
   * The next request from that client fails immediately.
2. **Immediate Permission Changes**:
   * If an admin demotes a user from `admin` to `user`, the change takes effect instantly because permissions are fetched from the live store on each request (or cached briefly).
3. **Small Payload Over the Wire**:
   * The client only sends a 32-byte opaque identifier (e.g. `sid_8f...`), saving network bandwidth compared to large cryptographic tokens.

### Challenges in High-Scale Stateful Systems:
1. **Horizontal Scaling Bottleneck**:
   * Without a shared cache, Server Node A cannot recognize a session created on Server Node B.
   * Requires either **Sticky Sessions** (load balancer pins user IP to a specific container—brittle and uneven load distribution) or a **Distributed In-Memory Store (Redis Cluster)**.
2. **High Database / Cache I/O**:
   * Every single HTTP request incurs a database or cache network round-trip ($1\text{–}3\text{ ms}$). At 100,000 requests per second, the session store must handle 100,000 read operations per second.

---

## 3. Stateless JWT Architecture

In a pure stateless model, the backend signs an access token containing the user's claims and sends it to the client. The client returns the token on every subsequent request inside the `Authorization: Bearer <token>` header.

```
Client                             Microservice A          Microservice B
  │                                      │                       │
  │ ── 1. GET /orders (Bearer JWT) ────► │                       │
  │                                      │ (Verify Signature     │
  │                                      │  with Public Key)     │
  │                                      │  No DB lookups!       │
  │ ◄─ 2. 200 OK [Orders] ────────────── │                       │
  │                                                              │
  │ ── 3. GET /billing (Bearer JWT) ───────────────────────────► │
  │                                                              │ (Verify Signature)
  │ ◄─ 4. 200 OK [Invoices] ──────────────────────────────────── │ Zero DB lookups!
```

### Advantages of Stateless Systems:
1. **Zero Database Lookups on Request Path**:
   * The server validates the cryptographic signature using a local CPU operation ($<0.05\text{ ms}$) without querying any database or network socket.
2. **Effortless Microservice Scaling**:
   * Microservice A and Microservice B can independently verify the token using the same public key without needing network access to an Auth service or Redis cluster.
3. **Mobile & Non-Browser Friendly**:
   * Avoids cross-domain cookie restrictions, third-party cookie blocking, and CORS session issues common in native mobile apps.

### The Fatal Flaws of Pure Stateless JWTs:
> [!CAUTION]
> 1. **The Revocation Dilemma**: Once signed, a JWT is **mathematically valid until its expiration timestamp (`exp`) passes**. If an attacker steals a token valid for 24 hours, the backend cannot revoke it without introducing server-side state (which destroys statelessness).
> 2. **Stale Claims**: If a user's role is downgraded from `admin` to `member`, the JWT still asserts `role: admin` until it expires.
> 3. **Payload Bloat**: JWTs typically range between 500 bytes and 2 KB. Transmitting this on every API request increases bandwidth costs significantly at scale.

---

## 4. The Industry Standard: The Hybrid Architecture

To reconcile the scalability of stateless tokens with the security control of stateful sessions, modern engineering teams utilize the **Hybrid Token Pair Model**:

```
                                  HYBRID ARCHITECTURE
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
          ACCESS TOKEN (Stateless)                      REFRESH TOKEN (Stateful)
   ┌─────────────────────────────────────┐       ┌─────────────────────────────────────┐
   │ • Short-Lived: 5 to 15 minutes      │       │ • Long-Lived: 7 to 30 days          │
   │ • Stateless JWT in Memory           │       │ • Opaque String or Signed Token     │
   │ • Fast verification on API routes   │       │ • Stored in DB/Redis with metadata  │
   │ • Carried in Authorization Header   │       │ • Stored in HttpOnly/Secure Cookie  │
   │ • Unrevocable, but expires quickly  │       │ • Used ONLY at `/auth/refresh`      │
   └─────────────────────────────────────┘       └─────────────────────────────────────┘
```

```
Browser Client                                                    Backend Server
      │                                                                  │
      │ ── 1. API Call (Bearer AccessToken - Expired!) ────────────────► │
      │ ◄─ 2. 401 Unauthorized (TokenExpiredError) ───────────────────── │
      │                                                                  │
      │ ── 3. POST /auth/refresh (Cookie: RefreshToken) ───────────────► │
      │                                                                  │ 4. Check Redis: Is valid?
      │                                                                  │ 5. Rotate Refresh Token!
      │ ◄─ 4. Return NEW AccessToken + Set-Cookie: NEW RefreshToken ──── │
      │                                                                  │
      │ ── 5. Retry API Call with NEW AccessToken ─────────────────────► │
      │ ◄─ 6. 200 OK [Data] ──────────────────────────────────────────── │
```

### Automatic Breach Detection: Refresh Token Rotation & Family Invalidation
What happens if an attacker steals a long-lived refresh token?
1. **Refresh Token Rotation (RTR)**: Every time a refresh token is exchanged, it is consumed and immediately replaced with a brand-new refresh token.
2. **Token Family Tracking**: If the server receives an already-used refresh token, it assumes a breach has occurred (either the legitimate client or the attacker used it first).
3. **Emergency Circuit Breaker**: The server immediately revokes the **entire token family**, forcing all sessions for that user to log in again.

```
       Initial Login ──► Issues RT_1
                            │
               RT_1 exchanged for RT_2 (RT_1 marked REVOKED)
                            │
        Attacker attempts to use RT_1!
                            │
   ┌────────────────────────┴────────────────────────┐
   │ THEFT DETECTED: RT_1 has already been used!     │
   │ Immediate Action: Revoke RT_2 and all sessions! │
   └─────────────────────────────────────────────────┘
```

---

## 5. Architectural Comparison Matrix

| Architectural Factor | Stateful Sessions | Stateless JWT | Hybrid Token Pair (Recommended) |
| :--- | :--- | :--- | :--- |
| **Server State per Request** | Mandatory DB/Cache read | Zero server state | Zero state on regular API; state check on refresh |
| **Instant Revocation** | Native and instant | Impossible before `exp` | Instant for sessions; max $\approx 15\text{ min}$ for access token |
| **Horizontal Scalability** | Requires distributed Redis | Effortless ($O(1)$) | High scalability with minimal Redis refresh load |
| **Network Payload Size** | Minimal ($\approx 32\text{ bytes}$) | Large ($0.5\text{–}2\text{ KB}$) | Large on API requests, minimal on refresh |
| **Security Risk Profile** | Redis downtime = auth outage | Stolen token replay | Minimal window of vulnerability ($\le 15\text{ min}$) |
| **Ideal Use Case** | Traditional SaaS, admin portals | Simple public APIs, webhooks | Modern SPAs, mobile apps, enterprise APIs |

---

## 6. Express/Node.js Pseudocode: Production-Grade Hybrid Authentication

The following TypeScript code implements the complete Hybrid Architecture with **Access Tokens**, **Stateful Refresh Tokens**, **Rotation**, and **Compromise Detection**.

```typescript
// ==============================================================================
// Chapter 03: Hybrid Authentication with Refresh Token Family Rotation
// ==============================================================================

import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const ACCESS_SECRET = "access_token_secret_32_bytes_long_minimum";
const REFRESH_SECRET = "refresh_token_secret_32_bytes_long_minimum";

// ------------------------------------------------------------------------------
// 1. Refresh Token Store with Family Tracking (Simulating Redis / SQL)
// ------------------------------------------------------------------------------
interface RefreshTokenRecord {
  tokenId: string;
  familyId: string;
  userId: string;
  isRevoked: boolean;
  expiresAt: number;
}

class TokenVault {
  // Map of tokenId -> RefreshTokenRecord
  private tokens = new Map<string, RefreshTokenRecord>();

  createToken(userId: string, familyId?: string, ttlDays: number = 7): { tokenId: string; familyId: string } {
    const tokenId = crypto.randomUUID();
    const family = familyId || crypto.randomUUID();
    const expiresAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;

    this.tokens.set(tokenId, {
      tokenId,
      familyId: family,
      userId,
      isRevoked: false,
      expiresAt
    });

    return { tokenId, familyId: family };
  }

  get(tokenId: string): RefreshTokenRecord | null {
    return this.tokens.get(tokenId) || null;
  }

  revoke(tokenId: string): void {
    const record = this.tokens.get(tokenId);
    if (record) {
      record.isRevoked = true;
    }
  }

  // Security Defense: Invalidate entire lineage if token reuse is detected
  revokeFamily(familyId: string): void {
    console.warn(`[SECURITY ALERT] Invalidating entire token family: ${familyId}`);
    for (const record of this.tokens.values()) {
      if (record.familyId === familyId) {
        record.isRevoked = true;
      }
    }
  }
}

const tokenVault = new TokenVault();

// ------------------------------------------------------------------------------
// 2. Token Utilities (Access JWT & Refresh Token Helper)
// ------------------------------------------------------------------------------
interface TokenClaims {
  sub: string;
  role: string;
  exp: number;
}

function generateAccessToken(userId: string, role: string): string {
  // In production, use standard jsonwebtoken library with 15m expiry
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      role: role,
      exp: Math.floor(Date.now() / 1000) + 15 * 60 // 15 Minutes
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", ACCESS_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

function verifyAccessToken(token: string): TokenClaims {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) throw new Error("Malformed token");

  const expectedSig = crypto
    .createHmac("sha256", ACCESS_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    throw new Error("Invalid signature");
  }

  const claims: TokenClaims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  if (Date.now() / 1000 > claims.exp) {
    throw new Error("Token expired");
  }

  return claims;
}

// ------------------------------------------------------------------------------
// 3. API Routes: Login, Refresh (with Rotation & Breach Detection), Logout
// ------------------------------------------------------------------------------

// Step 1: User Login
app.post("/api/auth/login", (req: Request, res: Response) => {
  const { username, password } = req.body;

  // Mock validation
  if (username === "aminul" && password === "pass123") {
    const userId = "usr_9918";
    const role = "developer";

    // 1. Generate short-lived stateless Access Token
    const accessToken = generateAccessToken(userId, role);

    // 2. Generate long-lived stateful Refresh Token in new Family
    const { tokenId } = tokenVault.createToken(userId);

    // 3. Attach Refresh Token in Secure HttpOnly Cookie
    res.setHeader("Set-Cookie", [
      `refreshToken=${tokenId}; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=${7 * 86400}`
    ]);

    res.json({
      accessToken,
      tokenType: "Bearer",
      expiresIn: 15 * 60 // 15 mins
    });
    return;
  }

  res.status(401).json({ error: "Invalid credentials" });
});

// Step 2: Token Refresh Endpoint with Token Rotation & Reuse Detection
app.post("/api/auth/refresh", (req: Request, res: Response) => {
  // Extract refreshToken from cookie
  const rawCookie = req.headers.cookie || "";
  const match = rawCookie.match(/refreshToken=([^;]+)/);
  const presentedTokenId = match ? match[1] : null;

  if (!presentedTokenId) {
    res.status(401).json({ error: "Refresh token missing" });
    return;
  }

  const tokenRecord = tokenVault.get(presentedTokenId);

  // BREACH DETECTION: If token does not exist or was ALREADY revoked
  if (!tokenRecord || tokenRecord.isRevoked) {
    if (tokenRecord && tokenRecord.isRevoked) {
      // Token reuse detected! Attacker or victim reused an old token!
      tokenVault.revokeFamily(tokenRecord.familyId);
    }
    res.setHeader("Set-Cookie", [`refreshToken=; Path=/api/auth; HttpOnly; Secure; Max-Age=0`]);
    res.status(403).json({ error: "Breach detected. Refresh token revoked. Please login again." });
    return;
  }

  // Check TTL
  if (Date.now() > tokenRecord.expiresAt) {
    tokenVault.revoke(presentedTokenId);
    res.status(401).json({ error: "Refresh token expired" });
    return;
  }

  // SUCCESSFUL ROTATION:
  // 1. Revoke currently used token
  tokenVault.revoke(presentedTokenId);

  // 2. Issue NEW token in the SAME family
  const { tokenId: nextTokenId } = tokenVault.createToken(
    tokenRecord.userId,
    tokenRecord.familyId
  );

  // 3. Issue NEW Access Token
  const newAccessToken = generateAccessToken(tokenRecord.userId, "developer");

  // 4. Update Client Cookie with new Refresh Token
  res.setHeader("Set-Cookie", [
    `refreshToken=${nextTokenId}; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=${7 * 86400}`
  ]);

  res.json({
    accessToken: newAccessToken,
    tokenType: "Bearer",
    expiresIn: 15 * 60
  });
});

// Step 3: Logout
app.post("/api/auth/logout", (req: Request, res: Response) => {
  const rawCookie = req.headers.cookie || "";
  const match = rawCookie.match(/refreshToken=([^;]+)/);
  if (match) {
    tokenVault.revoke(match[1]);
  }

  res.setHeader("Set-Cookie", [`refreshToken=; Path=/api/auth; HttpOnly; Secure; Max-Age=0`]);
  res.json({ message: "Successfully logged out" });
});

// Step 4: Stateless Protected Endpoint
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Access token required" });
    return;
  }

  try {
    const claims = verifyAccessToken(authHeader.split(" ")[1]);
    (req as any).user = claims;
    next();
  } catch (err: any) {
    res.status(401).json({ error: "Invalid or expired access token", message: err.message });
  }
}

app.get("/api/notes", requireAuth, (req: Request, res: Response) => {
  res.json({
    message: "Access granted to protected notes without database lookup",
    principal: (req as any).user
  });
});

export default app;
```

---

## 7. Golden Rules of Architecture Selection

1. **If building a standard server-rendered or single-domain SPA**: Default to **Stateful Sessions** stored in Redis with `HttpOnly`, `SameSite=Lax` cookies. It is simpler, more secure, and provides immediate session termination.
2. **If building a multi-service ecosystem or mobile application**: Deploy the **Hybrid Model** (15-minute stateless JWTs + rotating refresh tokens in secure storage).
3. **Never deploy long-lived stateless JWTs (e.g. 30 days) with no refresh mechanism**: Stolen credentials will remain active indefinitely with zero administrative recourse.
