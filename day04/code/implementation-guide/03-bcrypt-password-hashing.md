# Implementation Guide 03: bcrypt Password Storage, Policy & Hash Upgrades

## 1. Goal & First-Principles Context

Chapter 07 of the notes makes one point that everything else follows from:

> A general-purpose hash (MD5, SHA-1, SHA-256) is engineered to be **fast**. A password
> hash must be engineered to be **slow** — and, crucially, slow *in a way you can dial up*
> as hardware gets faster.

`src/services/password.service.js` implements that with **bcrypt**:

| Property | Implementation |
| :--- | :--- |
| Cost calibration | `BCRYPT_COST` from `.env` (default 12 ≈ 250 ms/hash on modern hardware) |
| Unique salt | Generated internally by bcrypt, embedded in the digest (128-bit) |
| Input ceiling | bcrypt ignores bytes past 72 → over-long passwords are **rejected**, not truncated |
| Policy | length + complexity + common-password deny-list, enforced in one place |
| Constant-time compare | `bcrypt.compare` (no early-exit byte comparison) |
| Timing equaliser | `runDummyVerify()` burns the same CPU time when the account does not exist |
| Upgrade path | `needsRehash()` detects digests created with a cheaper cost factor |
| Dependency | `bcrypt` (native, prebuilt binaries) — no external service, no network call |

**What a stored record looks like** — bcrypt is self-describing, so nothing else is needed
to verify it later:

```
$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
 │   │  └── 22-char salt ─┐ └── 31-char digest ──┘
 │   └── cost factor (2^12 = 4096 key-expansion rounds)
 └── bcrypt version (2b)
```

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `src/services/password.service.js` | hashing, verification, policy, timing equaliser, rehash detection |
| `src/controllers/auth.controller.js` | calls the service on register (`hash`) and login (`verify`) |
| `src/db/user.store.js` | stores the digest; `updatePasswordHash()` persists upgrades |
| `test/auth.e2e.test.js` | asserts policy rejections, salting and `needsRehash()` behaviour |

---

## 3. Source: Format Guard, Deny-list & Policy

```javascript
import bcrypt from "bcrypt";
import { config } from "../config/env.js";
import { BadRequestError } from "../errors/api-error.js";

/** Matches `$2a$`/`$2b$`/`$2y$` modular-crypt bcrypt records (60 chars). */
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * A tiny deny-list of passwords that satisfy complexity rules yet dominate every
 * credential-stuffing wordlist. In production, check HaveIBeenPwned's k-anonymity
 * range API instead of maintaining this list by hand.
 */
const COMMON_PASSWORDS = new Set([
  "password1234", "password123!", "qwerty123456", "letmein12345",
  "welcome12345", "admin1234567", "iloveyou1234", "changeme1234",
]);

export class PasswordService {
  /** Effective work factor applied to new hashes. */
  static get costFactor() {
    return config.password.bcryptCost;
  }

  /**
   * Validate a candidate password against the configured policy.
   * Returns a list of human-readable violations (empty array === acceptable).
   */
  static validate(password) {
    const violations = [];
    const policy = config.password;

    if (typeof password !== "string" || password.length === 0) {
      return ["password is required"];
    }

    // Length is measured in CHARACTERS for UX, but bcrypt's ceiling is BYTES.
    if (password.length < policy.minLength) {
      violations.push(`must be at least ${policy.minLength} characters long`);
    }

    const byteLength = Buffer.byteLength(password, "utf8");
    if (byteLength > policy.maxBytes) {
      violations.push(
        `must be at most ${policy.maxBytes} bytes when UTF-8 encoded (bcrypt silently truncates longer input)`
      );
    }

    if (password.includes("\0")) violations.push("must not contain null bytes");

    if (policy.requireComplexity) {
      const missing = [];
      if (!/[a-z]/.test(password)) missing.push("a lowercase letter");
      if (!/[A-Z]/.test(password)) missing.push("an uppercase letter");
      if (!/\d/.test(password))    missing.push("a digit");
      if (!/[^A-Za-z0-9]/.test(password)) missing.push("a symbol");
      if (missing.length > 0) violations.push(`must contain ${missing.join(", ")}`);
    }

    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      violations.push("is on the common-password deny-list — choose something unique");
    }

    return violations;
  }

  /** Assert the policy, throwing a 400 for the batch of violations found. */
  static assertAcceptable(password) {
    const violations = PasswordService.validate(password);
    if (violations.length > 0) {
      throw new BadRequestError(`Password rejected: ${violations.join("; ")}`);
    }
  }
}
```

### Deep explanation

1. **`BCRYPT_HASH_PATTERN` is a contract check, not decoration.** It guarantees that we only
   ever send a real bcrypt record to `bcrypt.compare`/`getRounds`; a malformed row from a
   data migration raises a clear error instead of an obscure native failure.
2. **Two length measurements.** `password.length` (characters) is what a user understands;
   `Buffer.byteLength()` (UTF-8 bytes) is what bcrypt actually limits. An emoji-heavy
   passphrase can be under 72 *characters* and over 72 *bytes*.
3. **Rejecting > 72 bytes instead of truncating** — the classic bcrypt footgun. If you pass
   a 200-character passphrase, bcrypt authenticates using only the first 72 bytes, silently
   weakening the credential. A 400 is honest; silent truncation is a security bug.
4. **Complexity rules live in the service**, so registration, password reset and an admin
   "set password" endpoint can never disagree about the policy — the drift that produces
   accounts with weaker credentials than intended.
5. **`assertAcceptable` throws `BadRequestError`** (HTTP 400) which the global error handler
   serialises; the service deliberately does not know about HTTP status codes beyond that
   one typed error.

---

## 4. Source: Hash, Verify, Upgrade & Timing Equaliser

```javascript
  /**
   * Hash a plaintext password with bcrypt.
   * @returns {Promise<string>} 60-character modular crypt record, e.g. `$2b$12$…`
   */
  static async hash(plaintext) {
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      throw new TypeError("PasswordService.hash() expects a non-empty string");
    }
    return bcrypt.hash(plaintext, config.password.bcryptCost);
  }

  /**
   * Verify a candidate password against a stored bcrypt record in constant time.
   * Never throws for a bad password — only for a malformed stored record.
   */
  static async verify(candidate, storedHash) {
    if (typeof candidate !== "string" || typeof storedHash !== "string") return false;
    if (!BCRYPT_HASH_PATTERN.test(storedHash)) {
      throw new Error("Unrecognised password hash format — expected a bcrypt record");
    }
    // bcrypt.compare is internally constant-time and independent of hash length.
    return bcrypt.compare(candidate, storedHash);
  }

  /**
   * Has this hash been produced with a work factor below the current policy?
   * When true the caller re-hashes the (just verified) plaintext and persists the
   * upgraded digest — a zero-downtime cost-factor migration.
   */
  static needsRehash(storedHash) {
    if (typeof storedHash !== "string" || !BCRYPT_HASH_PATTERN.test(storedHash)) return true;
    try {
      return bcrypt.getRounds(storedHash) < config.password.bcryptCost;
    } catch {
      return true;
    }
  }
```

### Deep explanation

1. **`hash()` takes the cost from config, never from a caller.** A controller cannot
   accidentally mint a cost-4 digest: the work factor is a deployment decision, not a
   request parameter.
2. **`verify()` returns `false` for a wrong password but *throws* on a malformed record.**
   Those are different events — one is a user typo, the other is data corruption. Collapsing
   them hides broken migrations behind endless "wrong password" reports.
3. **`needsRehash()` enables a rolling migration.** Raise `BCRYPT_COST` from 12 → 13 and
   existing users keep working, getting silently upgraded on their next successful login —
   no forced reset, no "please log in again" campaign.
4. **`getRounds()` reads the cost out of the digest itself**, which is why the record is
   self-describing and no separate column or config version is needed.

---

## 5. Source: The Timing Equaliser

```javascript
  /**
   * Timing equaliser (user-enumeration defence).
   *
   *   unknown email → "no row found"      → returns in ~1 ms
   *   known email   → bcrypt.compare runs → returns in ~250 ms
   *
   * That 250 ms delta announces which accounts exist. A throwaway bcrypt
   * comparison against a fixed digest makes both paths cost the same.
   */
  static async runDummyVerify(candidate) {
    const dummyHash = await PasswordService.#getDummyHash();
    try {
      await bcrypt.compare(typeof candidate === "string" ? candidate : "", dummyHash);
    } catch {
      // Never surface anything from the equaliser path.
    }
  }

  /** Lazily-built, memoised dummy digest (computed once per process). */
  static #dummyHash = null;

  static async #getDummyHash() {
    if (!PasswordService.#dummyHash) {
      PasswordService.#dummyHash = await bcrypt.hash(
        "DUMMY_GUARD_TIMING_EQUALISER",
        config.password.bcryptCost
      );
    }
    return PasswordService.#dummyHash;
  }
}
```

### Deep explanation

1. **`#dummyHash` is a private static field, memoised per process.** Recomputing it on every
   failed login would *double* the cost of the failure path — a self-inflicted DoS, and the
   opposite of the intent.
2. **The equaliser swallows its own errors.** Its only job is to consume CPU; it must never
   be able to change the API's response.
3. **`Buffer`-free and string-safe** — a non-string candidate degrades to `""` rather than
   throwing inside the failure path.

---

## 6. Where It Is Called (login flow)

```javascript
// src/controllers/auth.controller.js  (excerpt)
const user = userStore.findByEmail(emailKey);

// ── Defences 3 & 4: timing equaliser + uniform failure message ───────────────
if (!user) {
  await PasswordService.runDummyVerify(password);        // burn the same ~250 ms
  logger.warn("login failed", { reason: "unknown_account", email: emailKey, ip: req.ip });
  throw new UnauthorizedError("Invalid email or password");
}

const passwordOk = await PasswordService.verify(password, user.passwordHash);
if (!passwordOk) {
  logger.warn("login failed", { reason: "bad_password", userId: user.id, ip: req.ip });
  throw new UnauthorizedError("Invalid email or password");   // ← identical message
}

if (user.active === false) {
  // Checked AFTER password verification so a disabled account cannot be
  // enumerated by someone who does not know the password.
  throw new UnauthorizedError("This account has been deactivated — contact an administrator");
}

// ── Transparent cost-factor migration ───────────────────────────────────────
if (PasswordService.needsRehash(user.passwordHash)) {
  const upgraded = await PasswordService.hash(password);
  userStore.updatePasswordHash(user.id, upgraded);
  logger.info("password hash upgraded", { userId: user.id, bcryptCost: config.password.bcryptCost });
}
```

Note the guard order: **throttle → lookup → (dummy | real) verify → active check → rehash →
issue tokens.** Every step before `verify` is cheap, and nothing after it reveals whether the
account existed.

---

## 7. Verification

Hash, verify and cost-calibrate from the command line (observe the `$2b$12$` prefix and the
~250 ms cost — that latency *is* the security property):

```bash
node --input-type=module -e "
import('./src/services/password.service.js').then(async (m) => {
  const s = m.PasswordService;
  const t0 = Date.now();
  const h = await s.hash('Valid\$Pass123');
  console.log('hash      :', h);
  console.log('cost ms   :', Date.now() - t0);
  console.log('verify ok :', await s.verify('Valid\$Pass123', h));
  console.log('verify bad:', await s.verify('nope', h));
  console.log('rehash?   :', s.needsRehash('\$2b\$04\$abcdefghijklmnopqrstuu'));
})"
```

Expected:

```text
hash      : $2b$12$keevheXHnQOu9lARJQo2gu…
cost ms   : 240
verify ok : true
verify bad: false
rehash?   : true
```

Inspect policy violations directly:

```bash
node --input-type=module -e "
import('./src/services/password.service.js').then(m => console.log(m.PasswordService.validate('abc')))"
```

```text
[
  'must be at least 10 characters long',
  'must contain an uppercase letter, a digit, a symbol'
]
```

And through the API (server running), confirm the rejections are HTTP 400:

```bash
# too short
curl -s -X POST http://localhost:4000/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"weak@example.com","username":"weakling","password":"short1!"}'
# → {"error":{"code":"BAD_REQUEST","message":"Password rejected: must be at least 10 characters long","status":400}}

# complexity
curl -s -X POST http://localhost:4000/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"nosym@example.com","username":"nosymbol","password":"NoSymbol12345"}'
# → "Password rejected: must contain a symbol"

# >72 bytes (would be silently truncated by bcrypt without this guard)
node -e "console.log(JSON.stringify({email:'long@example.com',username:'toolong',password:'Aa1!'+'x'.repeat(70)}))"
```

The suite also proves the digest is salted and upgrade-aware:

```bash
npm test   # tests: "bcrypt digests are salted, self-describing and upgrade-aware (Ch07)"
```

---

## 8. Why This Matters

* **The cost factor is the whole defence.** GPUs try billions of SHA-256 hashes per second; at
  cost 12 one bcrypt guess costs ~250 ms of memory-hard work, which makes offline cracking of
  a decent password economically pointless.
* **Salting defeats precomputation.** Two users with the same password get different digests
  (bcrypt embeds a 128-bit CSPRNG salt), killing rainbow tables and cross-account correlation
  in a leaked dump.
* **Upgrades must be free**, or they never happen. `needsRehash()` lets you raise the work
  factor continuously with no migration window — the most common reason teams sit on a stale
  cost factor for years.
* **Timing is a side channel.** Without `runDummyVerify` the 250 ms delta is a reliable
  "this email exists" oracle, which credential-stuffing campaigns use to sort their lists.


