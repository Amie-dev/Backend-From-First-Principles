# Chapter 08: Threat Modeling, Attacks & Defensive Countermeasures

## 1. Threat Modeling the Authentication Surface

Authentication and authorization endpoints represent the highest-value attack surface of any backend architecture. If an attacker bypasses business logic validation, they may corrupt a single record; if they bypass authentication or authorization, they compromise the entire platform.

```
                     ATTACK VECTORS ON THE AUTH BOUNDARY
                                       │
      ┌────────────────────────────────┼────────────────────────────────┐
      ▼                                ▼                                ▼
1. BRUTE FORCE /             2. USER ENUMERATION /             3. TOKEN THEFT /
CREDENTIAL STUFFING             TIMING ATTACKS                 BOLA / IDOR
   (Mass Guessing)                (Side-Channel Recon)            (Privilege Escalation)
```

---

## 2. HTTP Status Code Semantics: 401 Unauthorized vs. 403 Forbidden

Proper defense begins with accurate HTTP response semantics. Returning incorrect codes confuses API clients and leaks system behavior to adversaries.

```
┌─────────────────────────────────┬─────────────────────────────────┐
│       HTTP 401 UNAUTHORIZED     │       HTTP 403 FORBIDDEN        │
├─────────────────────────────────┼─────────────────────────────────┤
│ Semantics: "Unauthenticated"    │ Semantics: "Access Refused"     │
├─────────────────────────────────┼─────────────────────────────────┤
│ Identity is unknown or invalid. │ Identity is proven, but rights  │
│                                 │ are insufficient.               │
├─────────────────────────────────┼─────────────────────────────────┤
│ The client CAN retry if they    │ The client CANNOT succeed by    │
│ provide valid credentials.      │ repeating the identical request.│
├─────────────────────────────────┼─────────────────────────────────┤
│ Examples:                       │ Examples:                       │
│ • Missing `Authorization` header│ • Regular user accessing        │
│ • Expired access token          │   `/admin/dashboard`            │
│ • Invalid Bearer token signature│ • Modifying another user's note │
└─────────────────────────────────┴─────────────────────────────────┘
```

---

## 3. Threat Vector 1: Brute-Force & Credential Stuffing

### The Threat
* **Brute-Force**: Automated scripts systematically trying thousands of common passwords against an account.
* **Credential Stuffing**: Attackers ingest automated dumps of billions of email/password combinations leaked from third-party data breaches, testing them against your API.

### Defenses:
1. **Multi-Tier Rate Limiting**:
   * **IP-Level Rate Limiting**: Max 20 login requests per minute per IP address.
   * **Account-Level Rate Limiting**: Max 5 failed login attempts per username/email in a 15-minute window.
2. **Progressive Delays (Exponential Backoff)**:
   * Introduce artificial delays after consecutive failed attempts ($1\text{s}$, $2\text{s}$, $4\text{s}$, $8\text{s}$).
3. **Avoid Permanent Account Lockouts**:
   > [!CAUTION]
   > Permanently locking an account after 5 failed attempts allows attackers to launch a **Denial of Service (DoS) attack against your legitimate users** simply by writing a script that enters bad passwords for known executive email addresses. Use **temporary progressive lockouts** and CAPTCHA instead.

---

## 4. Threat Vector 2: User Enumeration

### The Threat
User enumeration occurs when an API inadvertently reveals whether a given user account exists in the database. Attackers use this to build targeted victim lists.

```
                 VULNERABLE (Leaks Account Existence)
POST /login { email: "ceo@company.com", password: "wrong" } ──► "Incorrect password"
POST /login { email: "fake@company.com", password: "wrong" } ──► "Email not found" ❌

                 HARDENED (Zero Information Leaked)
POST /login { ... } ──────────────────────────────────────────► "Invalid email or password" ✅
```

### Defending All Entry Points:
1. **Login Endpoints**: Return a single uniform error: `401 Unauthorized` with body `{ "error": "Invalid email or password" }`.
2. **Password Reset Endpoints**:
   * Bad: `"Email does not exist in our system."`
   * Hardened: `"If an account is associated with that email address, a password reset link has been dispatched."` (Always return `200 OK`).
3. **Registration Endpoints**: If an account already exists, do not announce `"Email already taken"`. Instead, display `"Verification link dispatched"` and send an email stating: *"Someone attempted to register an account with your email. If this was you, please log in here."*

---

## 5. Threat Vector 3: Timing Attacks & Side-Channel Leaks

### The Threat
Computers execute code at physical speeds determined by CPU instructions. If an API returns faster when a user does not exist than when a user does exist, an attacker can statistically measure response times over the network to enumerate users.

```
Request 1: email: "unknown@test.com" ──► User lookup fails (0ms) ──────────► Returns in 2ms
Request 2: email: "real_ceo@test.com" ──► User exists ──► Run Scrypt (250ms) ─► Returns in 252ms
```
$$\text{Timing Delta} = 252\text{ms} - 2\text{ms} = 250\text{ms} \quad \text{(Glaring Information Leak)}$$

### Defensive Engineering:
1. **Dummy Password Hash Computation**:
   * If the requested user email is not found in the database, **still execute an identical dummy password verification** against a pre-generated hash.
   * Both code paths consume identical CPU cycles ($\approx 250\text{ms}$), flattening the timing differential.
2. **Constant-Time Comparison**:
   * Standard JavaScript `===` compares strings character by character, returning `false` on the first non-matching byte.
   * Always use `crypto.timingSafeEqual()` when comparing HMAC signatures, tokens, or hashes.

---

## 6. Threat Vector 4: Token Theft, XSS, and CSRF

```
┌─────────────────────────────────┬────────────────────────────────────────────────────────┐
│ ATTACK VECTOR                   │ MECHANISM & DEFENSE                                    │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ **XSS**                         │ Injected JavaScript reads `window.localStorage`        │
│ (Cross-Site Scripting)          │ and exfiltrates access tokens.                         │
│                                 │ **Defense**: Store tokens in `HttpOnly; Secure` cookies│
│                                 │ and enforce a strict `Content-Security-Policy`.        │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ **CSRF**                        │ Malicious site forces victim's browser to send         │
│ (Cross-Site Request Forgery)    │ authenticated cookie requests.                         │
│                                 │ **Defense**: Use `SameSite=Lax` or `SameSite=Strict`   │
│                                 │ cookie flags and anti-CSRF custom request headers.     │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ **Token Replay**                │ Attacker intercepts a bearer token and replays it.     │
│                                 │ **Defense**: Short access token TTL ($\le 15\text{m}$) │
│                                 │ and Refresh Token Rotation with reuse detection.       │
└─────────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 7. Express/Node.js Pseudocode: Hardened Authentication Pipeline

The following TypeScript implementation incorporates:
* **Uniform error messaging** (Defeating user enumeration).
* **Dummy password hashing** (Defeating timing attacks).
* **Sliding-window rate limiting** per IP and per account.
* **Timing-safe comparison** for all cryptographic tokens.

```typescript
// ==============================================================================
// Chapter 08: Threat-Hardened Authentication Controller in Express/Node.js
// ==============================================================================

import express, { Request, Response } from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

// ------------------------------------------------------------------------------
// 1. Sliding Window Rate Limiter (Defending Brute Force)
// ------------------------------------------------------------------------------
interface RateLimitBucket {
  timestamps: number[];
}

class SlidingWindowRateLimiter {
  private buckets = new Map<string, RateLimitBucket>();

  public isAllowed(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { timestamps: [] };
      this.buckets.set(key, bucket);
    }

    // Filter out timestamps outside the active sliding window
    bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

    if (bucket.timestamps.length >= limit) {
      return { allowed: false, remaining: 0 };
    }

    bucket.timestamps.push(now);
    return { allowed: true, remaining: limit - bucket.timestamps.length };
  }
}

const ipLimiter = new SlidingWindowRateLimiter();
const accountLimiter = new SlidingWindowRateLimiter();

// ------------------------------------------------------------------------------
// 2. Mock Database & Pre-computed Constant Dummy Hash
// ------------------------------------------------------------------------------
interface User {
  id: string;
  email: string;
  passwordHash: string;
}

// Pre-computed hash matching the exact cost factor of production users
// Used when an unknown email is submitted to consume equal CPU cycles
const PRECOMPUTED_DUMMY_HASH =
  "$scrypt$N=32768,r=8,p=1$fakeSaltEntropy32BytesLongString$fakeDerivedKeyHash32BytesLongString";

const USERS: Map<string, User> = new Map([
  [
    "aminul@example.com",
    {
      id: "usr_101",
      email: "aminul@example.com",
      // Salted scrypt hash for "CorrectPassword123!"
      passwordHash: "$scrypt$N=32768,r=8,p=1$Z2VuZXJhdGVkU2FsdA$bW9ja0hhc2hDb250ZW50VmFsdWU"
    }
  ]
]);

// ------------------------------------------------------------------------------
// 3. Cryptographic Verification with Timing Defense
// ------------------------------------------------------------------------------
async function verifyScryptPassword(candidate: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  const salt = Buffer.from(parts[3] || "dummySalt", "base64url");
  const hash = Buffer.from(parts[4] || "dummyHash", "base64url");

  return new Promise((resolve) => {
    // 32768 rounds = ~200ms CPU consumption
    crypto.scrypt(candidate, salt, 32, { N: 32768, r: 8, p: 1 }, (_err, derivedKey) => {
      if (!derivedKey || derivedKey.length !== hash.length) {
        resolve(false);
        return;
      }
      // Constant-Time Comparison
      const isMatch = crypto.timingSafeEqual(derivedKey, hash);
      resolve(isMatch);
    });
  });
}

// ------------------------------------------------------------------------------
// 4. Hardened Login Handler
// ------------------------------------------------------------------------------
app.post("/api/auth/login", async (req: Request, res: Response): Promise<void> => {
  const clientIp = req.ip || "127.0.0.1";
  const { email, password } = req.body;

  // 1. Defend Against Floods: Check IP-Level Rate Limit (Max 10 / min)
  const ipCheck = ipLimiter.isAllowed(`ip:${clientIp}`, 10, 60_000);
  if (!ipCheck.allowed) {
    res.status(429).json({
      error: "TOO_MANY_REQUESTS",
      message: "Too many login attempts from this network. Try again in 1 minute."
    });
    return;
  }

  // Basic Input Validation
  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "INVALID_INPUT", message: "Email and password required." });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // 2. Defend Against Targeted Guessing: Check Account-Level Limit (Max 5 / 15 min)
  const accountCheck = accountLimiter.isAllowed(`account:${normalizedEmail}`, 5, 15 * 60_000);
  if (!accountCheck.allowed) {
    res.status(429).json({
      error: "ACCOUNT_LOCKED_TEMPORARILY",
      message: "Too many failed attempts for this account. Locked for 15 minutes."
    });
    return;
  }

  // 3. User Lookup
  const user = USERS.get(normalizedEmail);

  // 4. TIMING ATTACK & USER ENUMERATION COUNTERMEASURE:
  // If user does NOT exist, verify candidate password against the DUMMY HASH.
  // This guarantees that BOTH branches consume identical CPU time (~200ms)!
  const targetHash = user ? user.passwordHash : PRECOMPUTED_DUMMY_HASH;
  const isPasswordValid = await verifyScryptPassword(password, targetHash);

  // 5. Final Evaluation:
  // If user does not exist OR password does not match -> Return identical generic error
  if (!user || !isPasswordValid) {
    res.status(401).json({
      error: "INVALID_CREDENTIALS",
      message: "Invalid email or password."
    });
    return;
  }

  // Login Success
  res.json({
    message: "Authentication successful",
    user: { id: user.id, email: user.email }
  });
});

export default app;
```

---

## 8. Summary Checklist for Defensive Authentication

1. **Uniform Error Responses**: Always use `"Invalid email or password"` on auth failures.
2. **Equalize Timing Paths**: Never short-circuit before running a dummy hash when an account does not exist.
3. **Use Timing-Safe Functions**: Use `crypto.timingSafeEqual()` for comparing secret tokens, never `===`.
4. **Use Strict Cookies**: Set `HttpOnly; Secure; SameSite=Lax` on all authentication cookies.
5. **Rate-Limit at Two Levels**: Limit by IP address to thwart bots, and by target account to prevent targeted dictionary attacks.
