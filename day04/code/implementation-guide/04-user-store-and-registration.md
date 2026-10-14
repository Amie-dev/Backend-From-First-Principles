# Implementation Guide 04: User Store, Email Normalisation & Registration

## 1. Goal & First-Principles Context

Registration looks trivial and is not. The three mistakes that keep reappearing in real
codebases are:

1. **Trusting client-supplied fields** — accepting `role: "admin"` from a public form
   (*mass assignment / privilege escalation*).
2. **Case-sensitive identity** — `Bob@example.com` and `bob@example.com` becoming two
   accounts, which breaks login, password reset, and "unique" constraints.
3. **Storing the wrong thing** — persisting a plaintext or fast-hashed password, or
   returning the digest in the API response.

This guide implements the store and the registration handler so that all three are
structurally impossible.

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `src/db/user.store.js` | in-memory user table: id map + email index, hashing-aware seeds |
| `src/controllers/auth.controller.js` | `register()` — validation, policy, hashing, safe response |
| `src/errors/api-error.js` | `ConflictError` (409), `BadRequestError` (400) |

---

## 3. Source: `src/db/user.store.js`

```javascript
import crypto from "crypto";
import { config } from "../config/env.js";
import { PasswordService } from "../services/password.service.js";
import { ConflictError, NotFoundError } from "../errors/api-error.js";

class UserStore {
  constructor() {
    /** @type {Map<string, UserRecord>}  keyed by id */
    this._byId = new Map();
    /** @type {Map<string, string>}  email (lowercase) → id  ← the unique index */
    this._emailIndex = new Map();
  }

  list()            { return [...this._byId.values()]; }
  findById(id)      { return this._byId.get(id) ?? null; }

  /** Case-insensitive lookup: the index is keyed on the normalised address. */
  findByEmail(email) {
    const id = this._emailIndex.get(String(email).toLowerCase());
    return id ? (this._byId.get(id) ?? null) : null;
  }

  /** Persist a new user. Caller must have already hashed the password. */
  create({ email, username, passwordHash, role = "user", tenantId = "tenant_default" }) {
    const normalised = email.toLowerCase().trim();
    if (this._emailIndex.has(normalised)) {
      throw new ConflictError(`A user with email '${normalised}' already exists`);
    }

    const record = {
      id: "usr_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12),
      email: normalised,
      username,
      passwordHash,
      passwordUpdatedAt: new Date(),
      role,
      active: true,
      tenantId,
      createdAt: new Date(),
    };

    this._byId.set(record.id, record);
    this._emailIndex.set(normalised, record.id);
    return record;
  }

  /** Update mutable fields (role, active). Never touches passwordHash here. */
  update(id, patch) {
    const user = this._byId.get(id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
    if (patch.role   !== undefined) user.role   = patch.role;
    if (patch.active !== undefined) user.active = patch.active;
    return user;
  }

  /** Replace a stored digest (registration, password change, cost upgrade). */
  updatePasswordHash(id, passwordHash) {
    const user = this._byId.get(id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
    user.passwordHash = passwordHash;
    user.passwordUpdatedAt = new Date();
    return user;
  }
}

export const userStore = new UserStore();

// ── Seeding: passwords are bcrypt-hashed at boot, never stored in clear text ──
export async function seedUsers() {
  if (!config.seedDemoData) {
    console.log("[DB] SEED_DEMO_DATA=false — skipping demo user seeding");
    return 0;
  }

  const seeds = [
    { email: "aminul@example.com", username: "aminul", password: "SuperSecret#2024!", role: "admin"     },
    { email: "sarah@example.com",  username: "sarah",  password: "Moderate@Pass99",   role: "moderator" },
    { email: "bob@example.com",    username: "bob",    password: "User$Passw0rd",     role: "user"      },
    { email: "alice@example.com",  username: "alice",  password: "Alice$Secure1",     role: "user"      },
  ];

  for (const s of seeds) {
    if (userStore.findByEmail(s.email)) continue;  // idempotent re-seed
    PasswordService.assertAcceptable(s.password);   // demo data obeys the same policy
    const passwordHash = await PasswordService.hash(s.password);
    userStore.create({ email: s.email, username: s.username, passwordHash, role: s.role, tenantId: "tenant_alpha" });
  }

  console.log(`[DB] Seeded ${seeds.length} demo users (bcrypt cost ${config.password.bcryptCost})`);
  return seeds.length;
}
```

### Deep explanation

1. **Two maps, one identity.** `_byId` is the primary store; `_emailIndex` is the uniqueness
   constraint (the in-memory equivalent of `UNIQUE (email)` in SQL). Normalisation happens in
   exactly one place, so every code path agrees on what "the same user" means.
2. **`role = "user"` default + `ConflictError` thrown by the store.** Validation that is
   *impossible to forget* belongs in the store; formatting checks that produce friendly 400s
   belong in the controller.
3. **Opaque, prefixed ids (`usr_…`).** Surrogate keys never leak auto-increment volume, and
   the prefix makes `usr_` identifiers instantly recognisable in logs.
4. **`active: true` and `passwordUpdatedAt`** exist from day one because every real system
   eventually needs "disable this account" and "when was the password last changed?".
5. **Idempotent seeding** — `if (userStore.findByEmail(...)) continue` makes `--watch`
   restarts safe, and seeding validates demo passwords against the *same* policy as real
   users (so the demo data can never drift from the rules).

---

## 4. Source: `register()` in `src/controllers/auth.controller.js`

```javascript
/** Pragmatic RFC-5322-lite check — full RFC compliance belongs in a mail library. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function register(req, res, next) {
  try {
    const throttle = registerIpLimiter.attempt(`ip:${req.ip}`);
    if (!throttle.allowed) {
      return next(new TooManyRequestsError(
        "Too many accounts created from this network — try again later",
        Math.ceil(throttle.retryAfterMs / 1000)
      ));
    }

    const { email, username, password } = req.body ?? {};

    if (typeof email !== "string" || typeof username !== "string" || typeof password !== "string") {
      throw new BadRequestError("email, username and password are required (all strings)");
    }

    const normalisedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalisedEmail)) {
      throw new BadRequestError("A valid email address is required");
    }

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 40) {
      throw new BadRequestError("username must be between 3 and 40 characters");
    }

    // Password policy lives in the service so every entry point agrees (Guide 03)
    PasswordService.assertAcceptable(password);

    if (userStore.findByEmail(normalisedEmail)) {
      // NOTE: this reveals account existence. Trade-off: better UX at registration vs.
      // zero enumeration. Public APIs with sensitive user bases should return a generic
      // 202 + "check your email" flow instead.
      throw new ConflictError("An account with that email already exists");
    }

    // Deliberately expensive: ~250 ms of bcrypt. The rate limit above stops abuse.
    const passwordHash = await PasswordService.hash(password);

    const user = userStore.create({
      email: normalisedEmail,
      username: cleanUsername,
      passwordHash,
      role: "user",            // ← always. The client cannot ask for a role.
      tenantId: "tenant_alpha",
    });

    logger.info("account registered", { userId: user.id, email: user.email });

    res.status(201)
      .setHeader("Location", `/api/v1/admin/users/${user.id}`)
      .json({
        status: "success",
        message: "Account created — sign in to receive an access token",
        data: {
          id: user.id, email: user.email, username: user.username,
          role: user.role, createdAt: user.createdAt,
        },
      });
  } catch (err) {
    next(err);
  }
}
```

### Deep explanation

1. **`const { email, username, password } = req.body ?? {}` destructures exactly three
   fields.** A request containing `{"role":"admin"}` is simply ignored — this is the
   *defence* against mass assignment: you never copy the client's object wholesale
   (`userStore.create({ ...req.body })` would be the bug).
2. **Rate limiting comes first**, before any bcrypt work. Otherwise the endpoint becomes a
   CPU-exhaustion amplifier: each request costs the server ~250 ms of focused work.
3. **Email is normalised before it touches the store or the index** (`.trim().toLowerCase()`),
   so `"  ADMIN@Example.COM "` collides correctly with `admin@example.com`.
4. **Type checks before semantic checks** — `typeof password !== "string"` prevents a JSON
   array or object from reaching the policy code (where `password.length` would be
   meaningless and `Buffer.byteLength` would throw).
5. **Username is trimmed and bounded (3–40)** — length bounds on user-controlled strings are
   cheap input hygiene that prevents both accidental truncation and stored-XSS payloads
   being carried around forever.
6. **No session is issued on registration.** The client must log in (`POST /auth/login`),
   which keeps the registration endpoint free of credential-stuffing value and keeps one
   token-issuing code path (Guide 05) instead of two.
7. **The response is a whitelist, not a projection of the record.** `passwordHash` and
   `passwordUpdatedAt` are not filtered out — they were never added. Whitelisting beats
   blacklisting for egress (Ch09 Stage 7).
8. **`Location` header + 201** is correct REST: the created resource has a URL, and the body
   tells the client what to do next.

---

## 5. Verification

```bash
BASE=http://localhost:4000

# 1. Successful registration → 201, role forced to "user", no cookie issued
curl -s -i -X POST $BASE/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"NewUser@Example.com","username":"newuser","password":"Brand$New99x"}' | head -12

# 2. Duplicate (case-insensitive) → 409 CONFLICT
curl -s -X POST $BASE/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"newuser@example.com","username":"newuser2","password":"Brand$New99x"}'

# 3. Privilege-escalation attempt → 201 with role "user" (the role field is ignored)
curl -s -X POST $BASE/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"sneaky@example.com","username":"sneaky","password":"Sneaky$Pass99","role":"admin"}'

# 4. Missing field → 400
curl -s -X POST $BASE/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"x@example.com","username":"x"}'
```

Expected highlights:

```text
HTTP/1.1 201 Created
Location: /api/v1/admin/users/usr_1ac6acedfd5c
{"status":"success","message":"Account created — sign in to receive an access token",
 "data":{"id":"usr_1ac6acedfd5c","email":"newuser@example.com","username":"newuser","role":"user", …}}
```

```text
{"error":{"code":"CONFLICT","message":"A user with email 'newuser@example.com' already exists","status":409}}
```

```text
{"status":"success","data":{"role":"user", …}}     ← even though "role":"admin" was sent
```

The suite asserts all four behaviours:

```bash
npm test   # "registration normalises email, never auto-logs-in, and rejects duplicates"
           # "an attempted admin self-registration is ignored (privilege escalation, Ch08)"
```

---

## 6. Why This Matters

* **Mass assignment is the #1 cause of self-service privilege escalation.** Destructuring a
  fixed field list (instead of spreading `req.body`) removes the vulnerability by
  construction, not by discipline.
* **Identity has to be canonical.** One normalisation function feeding one unique index means
  "the same person" has exactly one representation — which is what makes password reset,
  session revocation and account lockout actually work.
* **The store owns invariants, the controller owns messages.** Uniqueness and default roles
  live in the store (impossible to bypass); friendly 400/409 text lives in the controller.
  Mixing them produces endpoints that leak whatever the store happened to throw.
* **Registration is an unauthenticated write endpoint** — the favourite target for account
  farming. Rate limiting it, validating it, and never issuing a session from it keeps the
  endpoint's value to an attacker close to zero.


