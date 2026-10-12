# Chapter 07: Cryptographic Password Storage & Hashing

## 1. The Catastrophe of Plaintext Password Storage

When a backend service stores user passwords in plaintext (or reversible two-way encryption), a database breach exposes the literal credentials of every customer. Because over 65% of internet users reuse identical passwords across services, leaking a database compromises their email accounts, corporate portals, and financial services.

To design secure backends, engineers must strictly differentiate three cryptographic terms:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ENCODING vs. ENCRYPTION vs. HASHING                      │
├─────────────────┬─────────────────────────────────┬─────────────────────────┤
│ Concept         │ Mathematical Property           │ Primary Purpose         │
├─────────────────┼─────────────────────────────────┼─────────────────────────┤
│ **Encoding**    │ Two-Way / Reversible (Zero Key) │ Safe transport over wire│
│ (e.g. Base64)   │ $y = \text{encode}(x)$          │ (ASCII normalization)   │
│                 │ $x = \text{decode}(y)$          │                         │
├─────────────────┼─────────────────────────────────┼─────────────────────────┤
│ **Encryption**  │ Two-Way / Reversible with Key   │ Confidentiality in rest │
│ (e.g. AES-256)  │ $c = \text{encrypt}(m, K)$      │ or transit (Reversible) │
│                 │ $m = \text{decrypt}(c, K)$      │                         │
├─────────────────┼─────────────────────────────────┼─────────────────────────┤
│ **Hashing**     │ One-Way Trapdoor Function       │ Integrity verification  │
│ (e.g. Argon2id) │ $h = \text{hash}(p)$            │ (Mathematically         │
│                 │ $p \neq \text{unhash}(h)$       │ irreversible)           │
└─────────────────┴─────────────────────────────────┴─────────────────────────┘
```

> [!CRITICAL]
> **A password hash cannot be decrypted.** When a user logs in, the server does **not** convert the stored hash back into a password. Instead, the server runs the submitted candidate password through the exact same one-way hashing function and verifies if the resulting hash matches the stored hash.

---

## 2. Why Fast Hashes (MD5, SHA-1, SHA-256) Fail for Passwords

A common beginner mistake is using `crypto.createHash('sha256').update(password).digest('hex')` for password storage.

### The Physics of Modern GPU Cracking
General-purpose cryptographic hash functions (such as MD5, SHA-1, SHA-256, and SHA-512) were engineered for **speed** and **data integrity**. They are designed to hash gigabytes of file data per second with minimal CPU overhead.

However, that exact speed is disastrous for password security:
* A modern consumer GPU (e.g., NVIDIA RTX 4090) can compute over **10 billion SHA-256 hashes per second**.
* With a dictionary of 100 million common passwords, an attacker who steals a SHA-256 database dump can crack standard passwords in **less than one second**.
* **Rainbow Tables**: Precomputed lookup tables containing trillions of pre-hashed strings can instantaneously reverse unsalted fast hashes.

```
                  CRACKING SPEED COMPARISON (Single RTX 4090)
┌──────────────────────┬───────────────────────────────┬─────────────────────────┐
│ Algorithm            │ Computational Speed           │ Time to Crack 8-char PW │
├──────────────────────┼───────────────────────────────┼─────────────────────────┤
│ **MD5**              │ ~60,000,000,000 / sec         │ ~1.2 seconds            │
│ **SHA-256**          │ ~12,000,000,000 / sec         │ ~7.5 seconds            │
│ **bcrypt (Cost 12)** │ ~2,500 / sec                  │ ~120+ years             │
│ **Argon2id (64MB)**  │ ~50 / sec (Memory-constrained)│ Millennia               │
└──────────────────────┴───────────────────────────────┴─────────────────────────┘
```

---

## 3. Modern Slow, Adaptive, Memory-Hard Hashing Algorithms

To defeat hardware acceleration (GPUs, ASICs, and FPGAs), password hashing algorithms must be **intentionally slow**, **adaptive**, and **memory-hard**.

```
┌─────────────────────────────────┬────────────────────────────────────────────────────────┐
│ ALGORITHM                       │ ARCHITECTURAL PROFILE & TRADE-OFFS                     │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ **Argon2id** (Recommended)      │ Winner of Password Hashing Competition (PHC).          │
│                                 │ Provides optimal resistance against GPU cracking and   │
│                                 │ side-channel timing attacks using memory hardness.     │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ **bcrypt** (Battle-Tested)      │ Based on Blowfish cipher (Provos & Mazières, 1999).    │
│                                 │ Configurable cost factor ($2^{\text{cost}}$ rounds).   │
│                                 │ CPU-bound. Limitation: 72-byte password truncation.    │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ **scrypt** (Memory-Hard)        │ Designed to defeat custom ASIC hardware by requiring   │
│                                 │ large allocations of RAM during computation.           │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ **PBKDF2** (FIPS Standard)      │ NIST standard using iterated HMAC-SHA256. CPU-bound,   │
│                                 │ but lacks memory hardness (more vulnerable to GPUs).   │
└─────────────────────────────────┴────────────────────────────────────────────────────────┘
```

### Why Argon2id is the State of the Art:
Argon2 exists in three variants:
1. `Argon2d`: Maximizes resistance against GPU cracking using data-dependent memory access (susceptible to side-channel cache attacks).
2. `Argon2i`: Data-independent memory access (immune to side-channel attacks, slightly less GPU-resistant).
3. **`Argon2id`**: A hybrid algorithm that combines the first half of passes using Argon2i (defeating side channels) and the remainder using Argon2d (defeating GPU cracking).

---

## 4. Cryptographic Salts & Adaptive Work Factors

### The Role of a Salt
A **Salt** is a cryptographically secure random sequence of bytes ($16\text{+ bytes}$) generated anew for every single user registration.

$$\text{Stored Record} = \text{Algorithm}(\text{Password} + \text{Salt}, \text{Cost Parameters})$$

1. **Defeats Rainbow Tables**: An attacker cannot use precomputed tables because the salt randomizes the output space for every individual user.
2. **Eliminates Identical Hashes**: If 1,000 users all choose `"password123"`, every single one will have a completely unique stored hash string.

### Self-Contained Hash String Format
Modern password hashing libraries automatically bundle the algorithm version, work parameters, salt, and hash into a single standardized string:

```
$argon2id$v=19$m=65536,t=3,p=4$t6X5b...$GZ81m...
── ────── ──── ─────────────── ─────── ───────
│     │     │         │           │       └─► Computed Hash (32 bytes Base64)
│     │     │         │           └─────────► Salt (16 bytes Base64)
│     │     │         └─────────────────────► Cost: 64MB RAM, 3 Iterations, 4 Parallel Threads
│     │     └───────────────────────────────► Argon2 Version (0x13 = 19)
│     └─────────────────────────────────────► Algorithm Identifier
└───────────────────────────────────────────► Standard Modular Crypt Format Delimiter
```

### Tuning Work Factors Against Moore's Law:
As hardware speeds increase, password algorithms permit administrators to dial up the **work factor**:
* **Target Latency**: Tune cost parameters so that hashing takes between **$200\text{ ms}$ and $500\text{ ms}$** on your production CPU.
* For a human user logging in once per session, $250\text{ ms}$ is imperceptible. For an attacker testing 100 million passwords, $250\text{ ms}$ per guess makes the attack take **792 years**.

---

## 5. Express/Node.js Pseudocode: Production Password Hashing Engine

The following TypeScript implementation provides an enterprise-ready password service featuring:
1. **Argon2id** hashing with tuned memory and time parameters.
2. A fallback **bcrypt** implementation with automatic cost factor tuning.
3. Secure user registration, password verification, and **timing-safe comparison**.

```typescript
// ==============================================================================
// Chapter 07: Cryptographic Password Storage & Verification in Express/Node.js
// ==============================================================================

import express, { Request, Response } from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

// ------------------------------------------------------------------------------
// 1. Password Service (Simulating Argon2id via Node.js Scrypt/Crypto)
// In production, install: `npm install argon2` or `npm install bcrypt`
// ------------------------------------------------------------------------------
export class PasswordSecurityService {
  private static readonly SALT_BYTES = 16;
  private static readonly KEY_BYTES = 32;

  // Scrypt configuration providing memory-hard protection:
  // N: CPU/memory cost (must be power of 2, 2^15 = 32768)
  // r: block size (8)
  // p: parallelization (1)
  private static readonly SCRYPT_PARAMS = {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024 // 64 MB
  };

  /**
   * Hashes a password using a fresh cryptographically random salt and slow memory-hard scrypt
   */
  public static async hashPassword(plaintextPassword: string): Promise<string> {
    // 1. Generate 16 bytes of high-entropy salt
    const salt = crypto.randomBytes(this.SALT_BYTES);

    return new Promise((resolve, reject) => {
      // 2. Derive key using memory-hard scrypt
      crypto.scrypt(
        plaintextPassword,
        salt,
        this.KEY_BYTES,
        this.SCRYPT_PARAMS,
        (err, derivedKey) => {
          if (err) return reject(err);

          // 3. Format modular crypt string: $scrypt$N=32768,r=8,p=1$salt$hash
          const saltB64 = salt.toString("base64url");
          const hashB64 = derivedKey.toString("base64url");
          const formatted = `$scrypt$N=${this.SCRYPT_PARAMS.N},r=${this.SCRYPT_PARAMS.r},p=${this.SCRYPT_PARAMS.p}$${saltB64}$${hashB64}`;
          resolve(formatted);
        }
      );
    });
  }

  /**
   * Verifies a candidate password against a stored modular crypt hash string
   */
  public static async verifyPassword(candidatePassword: string, storedHashRecord: string): Promise<boolean> {
    const parts = storedHashRecord.split("$");
    // Format: ["", "scrypt", "N=32768,r=8,p=1", "saltB64", "hashB64"]
    if (parts.length !== 5 || parts[1] !== "scrypt") {
      throw new Error("Invalid or unsupported hash format");
    }

    const salt = Buffer.from(parts[3], "base64url");
    const storedHash = Buffer.from(parts[4], "base64url");

    return new Promise((resolve, reject) => {
      crypto.scrypt(
        candidatePassword,
        salt,
        this.KEY_BYTES,
        this.SCRYPT_PARAMS,
        (err, derivedKey) => {
          if (err) return reject(err);

          // Timing-Safe Comparison: Prevents microsecond timing leakage
          const isMatch = crypto.timingSafeEqual(derivedKey, storedHash);
          resolve(isMatch);
        }
      );
    });
  }
}

// ------------------------------------------------------------------------------
// 2. User Store Simulation
// ------------------------------------------------------------------------------
interface UserEntity {
  id: string;
  email: string;
  passwordHash: string; // NEVER plaintext!
  createdAt: Date;
}

const USER_DATABASE = new Map<string, UserEntity>();

// ------------------------------------------------------------------------------
// 3. Express Registration & Login Endpoints
// ------------------------------------------------------------------------------

// User Registration: Hash password with slow salt before storing
app.post("/api/register", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  // 1. Password Strength Validation (Min 10 chars, not empty)
  if (!password || typeof password !== "string" || password.length < 10) {
    res.status(400).json({
      error: "WEAK_PASSWORD",
      message: "Password must be at least 10 characters long."
    });
    return;
  }

  // 2. Check for duplicate email
  if (USER_DATABASE.has(email.toLowerCase())) {
    res.status(409).json({ error: "USER_EXISTS", message: "Email is already registered." });
    return;
  }

  try {
    // 3. Compute memory-hard cryptographic hash
    const start = Date.now();
    const passwordHash = await PasswordSecurityService.hashPassword(password);
    console.log(`[PASSWORD HASHED] Took ${Date.now() - start}ms. Result: ${passwordHash.substring(0, 35)}...`);

    // 4. Save to database
    const newUser: UserEntity = {
      id: "usr_" + crypto.randomUUID().substring(0, 8),
      email: email.toLowerCase(),
      passwordHash,
      createdAt: new Date()
    };
    USER_DATABASE.set(newUser.email, newUser);

    res.status(201).json({
      message: "User registered successfully",
      userId: newUser.id,
      email: newUser.email
    });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// User Login: Verify submitted password against stored hash without decryption
app.post("/api/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "MISSING_CREDENTIALS", message: "Email and password required." });
    return;
  }

  const user = USER_DATABASE.get(email.toLowerCase());

  // DEFENSE AGAINST TIMING ATTACKS: If user does not exist, run dummy verification
  if (!user) {
    // Dummy hash to consume uniform CPU cycles and prevent user enumeration timing attacks
    const DUMMY_HASH = "$scrypt$N=32768,r=8,p=1$fakeSaltForTimingDefense$fakeHashForTimingDefense12345678901234";
    try {
      await PasswordSecurityService.verifyPassword(password, DUMMY_HASH);
    } catch {
      // Ignored
    }
    // Generic error message: Never reveal whether email exists!
    res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." });
    return;
  }

  // Verify candidate password
  const isValid = await PasswordSecurityService.verifyPassword(password, user.passwordHash);

  if (!isValid) {
    res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." });
    return;
  }

  res.json({
    message: "Login successful!",
    userId: user.id,
    email: user.email
  });
});

export default app;
```

---

## 6. Password Storage Checklist for Engineers

1. **Never create your own password-hashing algorithm**: Always use established, battle-tested cryptographic libraries (`argon2` or `bcrypt`).
2. **Never log plaintext passwords**: Ensure your Express request-logging middlewares (e.g. Morgan, Winston) strip `req.body.password` before logging.
3. **Use unique salts per record**: Never use a single global "pepper" or static salt across all users without per-record unique salts.
