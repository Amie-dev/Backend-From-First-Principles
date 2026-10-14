# Implementation Guide 01: Project Setup, Dependencies & Layering

## 1. Goal & First-Principles Context

An authentication service has an unusually high cost of getting the *foundations* wrong:
a hard-coded secret, a wrong dependency, or an un-layered project becomes a security
incident rather than a bug. This guide builds the skeleton:

* an **ES-module** Node project (no bundler, no transpiler — Node runs the source directly),
* exactly **four runtime dependencies**, each one justified,
* a **`.env`-driven** configuration surface (created in Guide 02),
* a **layered directory layout** where the request flows in one direction only:

```
HTTP → routes → middlewares → controllers → services → db
                        ↑                      ↓
                     errors  ←──────────  thrown upwards
```

---

## 2. Scaffold the Project

```bash
mkdir -p day04/code/src/{config,routes/v1,middlewares,controllers,services,db,errors}
mkdir -p day04/code/test
cd day04/code
npm init -y
```

## 3. Install Dependencies

```bash
npm install express@^4.19.2 jsonwebtoken@^9.0.2 bcrypt@^6.0.0 dotenv@^17.4.2
```

| Package | Why it is here | Why nothing else is here |
| :--- | :--- | :--- |
| **express** | Minimal, well-understood HTTP routing + middleware pipeline; the repository's reference framework | No ORM, no validation library, no logger package — those hide the mechanics the notes are teaching |
| **jsonwebtoken** | Canonical JWT sign/verify for Node; exposes `algorithms`, `issuer`, `audience`, `jwtid` options that matter for security | Hand-rolling HMAC/base64url is a fun exercise and a terrible production choice |
| **bcrypt** | Adaptive, salted, deliberately-slow password KDF with native bindings (prebuilt binaries ⇒ no compiler required) | `bcryptjs` is pure JS and ~30 % slower with no security gain; Argon2id would add a second native dependency |
| **dotenv** | Loads `.env` into `process.env` once, before any module reads config | The 12-factor alternative is real environment variables; `.env` keeps local dev reproducible |

> **Note on bcrypt vs scrypt:** an earlier iteration of this code used Node's built-in
> `crypto.scrypt`. It was replaced by **bcrypt** because (a) bcrypt's cost factor is a
> single integer that is trivially calibrated per environment, (b) the cost is embedded in
> the digest itself, which makes transparent hash upgrades possible (Guide 03), and
> (c) it is the hash most reviewers can audit by eye.

---

## 4. `package.json`

```json
{
  "name": "day04-auth-from-first-principles",
  "version": "1.0.0",
  "description": "Day 04 - Authentication & Authorization: Sessions, JWTs, API Keys, RBAC, and Threat Defenses from First Principles (ES Modules)",
  "main": "src/server.js",
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test test/*.test.js",
    "test:watch": "node --test --watch test/*.test.js"
  },
  "dependencies": {
    "bcrypt": "^6.0.0",
    "dotenv": "^17.4.2",
    "express": "^4.22.3",
    "jsonwebtoken": "^9.0.3"
  }
}
```

### Deep explanation

1. **`"type": "module"`** — every `.js` file is an ES module, so `import`/`export` work
   without a `.mjs` extension and the code matches the other days in this repository.
   Consequence: `__dirname` does not exist; use `import.meta.url` if you ever need paths.
2. **`start` vs `dev`** — `npm start` is the production-shaped entry point (no watcher,
   fail-fast config validation). `npm run dev` adds `--watch`; because seeding is
   *idempotent* (Guide 14) a restart never duplicates data.
3. **`test` uses `node --test`** — Node's built-in runner. No Jest/Mocha/Vitest means no
   config surface, no transpilation, and one fewer supply-chain dependency in a security
   service. The glob (`test/*.test.js`) is explicit so the runner never wanders into
   `node_modules`.
4. **The exact dependency list is a feature** — cookies, CORS, rate limiting, crypto and
   error handling are all implemented in-repo, so nothing security-critical is a black box.

---

## 5. Create `.env` from `.env.example`

```bash
cp .env.example .env

# Generate real secrets for anything that will ever be public:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

* `.env` holds real values and **must never be committed** — the repository `.gitignore`
  already lists it (verify with `git check-ignore -v day04/code/.env`).
* `.env.example` is committed and documents *every* variable with its purpose (Guide 02).
* `dotenv.config({ quiet: true })` is called exactly once, in `src/config/env.js`, so the
  load order is deterministic regardless of which module is imported first.

---

## 6. Final Directory Layout

```
day04/code
├── .env / .env.example          # 12-factor configuration (never commit .env)
├── package.json                 # ESM + scripts + 4 dependencies
├── README.md                    # architecture, API reference, curl walkthrough
├── implementation-guide/        # ← this guide series
├── test/auth.e2e.test.js        # 38 end-to-end tests (node:test)
└── src
    ├── app.js                   # middleware pipeline assembly (Guide 14)
    ├── server.js                # boot + graceful shutdown (Guide 14)
    ├── bootstrap.js             # seeding + maintenance timers (Guide 14)
    ├── config/env.js            # typed config + logger + guards (Guide 02)
    ├── routes/v1/               # auth · notes · admin · integration (Guide 14)
    ├── middlewares/             # cors · cookies · authn · authz · error (Guides 08–13)
    ├── controllers/             # HTTP translation layer (Guides 04, 05, 11)
    ├── services/                # password · token · api-key · limiter (Guides 03, 06, 07, 11, 12)
    ├── db/                      # user + note stores (Guides 04, 10)
    └── errors/api-error.js      # status-code hierarchy (Guide 13)
```

**Layering rule enforced throughout:** a middleware never queries a store, a store never
touches `req`/`res`, and a controller never hand-builds ownership filters — the ownership
predicate lives *inside* the store method (Guide 10).

---

## 7. Verification

```bash
npm ls --depth=0
```

Expected output:

```text
day04-auth-from-first-principles@1.0.0 /home/…/day04/code
├── bcrypt@6.0.0
├── dotenv@17.4.2
├── express@4.22.3
└── jsonwebtoken@9.0.3
```

Confirm the native bcrypt binding works on your machine — it must print `bcrypt OK $2b$12$ true`:

```bash
node -e "import('bcrypt').then(async (b) => {
  const h = await b.default.hash('x', 12);
  console.log('bcrypt OK', h.slice(0, 7), await b.default.compare('x', h));
})"
```

---

## 8. Why This Matters

* A **wrong dependency** in an auth service is an unreviewable trust decision — every
  package you do not add is one fewer supply-chain attack path.
* A **single `.env` loader** means a missing secret fails loudly at boot (Guide 02) instead
  of silently falling back to a default at 3 a.m.
* A **one-way layering** is what makes "where do I enforce ownership?" a question with
  exactly one answer (the store) — the structural fix for BOLA/IDOR (Guide 10).

