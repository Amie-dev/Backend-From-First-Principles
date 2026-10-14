# Day 04: Authentication & Authorization — Code Implementation Guide

A **step-by-step, build-it-yourself walkthrough** of the `day04/code` codebase: an
Express + **JWT** + **bcrypt** AuthN/AuthZ API built from first principles.

Every guide follows the same five-part shape used across this repository:

1. 🎯 **Goal & first-principles context** — the problem the file exists to solve.
2. 📂 **Files involved** — where the code lives.
3. 💻 **Source code** — the real, copy-pasteable ES-module source.
4. 🔬 **Deep explanation** — why each line is written that way and which attack it stops.
5. ✅ **Verification** — the exact `curl` / `node` / `npm` command and its expected output.

> **Read the theory first.** Each guide maps to a chapter in
> [`day04/notes`](../../notes/README.md); the code comments cite the chapter numbers.

---

## 📚 Guide Index

| Guide | Title | Source files |
| :--- | :--- | :--- |
| **[01](./01-project-setup-and-dependencies.md)** | Project setup, dependencies & layering | `package.json`, `.env`, `.env.example` |
| **[02](./02-environment-configuration-and-fail-fast-guards.md)** | Typed `.env` configuration & fail-fast production guards | `src/config/env.js` |
| **[03](./03-bcrypt-password-hashing.md)** | bcrypt password storage, policy & hash upgrades | `src/services/password.service.js` |
| **[04](./04-user-store-and-registration.md)** | User store, email normalisation & registration | `src/db/user.store.js`, `src/controllers/auth.controller.js` |
| **[05](./05-login-and-credential-attack-defences.md)** | Login: throttling, timing equaliser, enumeration defence | `src/controllers/auth.controller.js` |
| **[06](./06-jwt-access-token-implementation.md)** | Stateless JWT access tokens (HS256, claims, verification) | `src/services/token.service.js` |
| **[07](./07-refresh-token-rotation-and-breach-detection.md)** | Refresh-token rotation & the breach circuit breaker | `src/services/token.service.js`, `src/controllers/auth.controller.js` |
| **[08](./08-cookie-and-session-transport-security.md)** | Hardened cookies: RFC-6265 parsing & security flags | `src/middlewares/cookies.middleware.js`, `src/controllers/auth.controller.js` |
| **[09](./09-authentication-middleware.md)** | The AuthN gate (Bearer verification + live status check) | `src/middlewares/authenticate.middleware.js` |
| **[10](./10-authorization-rbac-and-anti-bola.md)** | RBAC matrix, ownership & anti-BOLA (403 vs 404) | `src/middlewares/authorise.middleware.js`, `src/db/note.store.js` |
| **[11](./11-api-keys-and-machine-to-machine-auth.md)** | API keys & M2M authentication with scopes and RPM limits | `src/services/api-key.service.js`, `src/middlewares/api-key-auth.middleware.js`, `src/controllers/api-key.controller.js` |
| **[12](./12-cors-security-headers-and-rate-limiting.md)** | CORS allow-list, security headers & sliding-window rate limiting | `src/middlewares/cors.middleware.js`, `src/middlewares/security-headers.middleware.js`, `src/services/rate-limiter.service.js` |
| **[13](./13-error-handling-audit-logging-and-safe-egress.md)** | Error hierarchy, audit logging & safe egress | `src/errors/api-error.js`, `src/middlewares/error.middleware.js`, `src/middlewares/request-context.middleware.js` |
| **[14](./14-pipeline-assembly-and-graceful-shutdown.md)** | 7-stage pipeline assembly, routing & graceful shutdown | `src/app.js`, `src/routes/v1/*`, `src/bootstrap.js`, `src/server.js` |
| **[15](./15-testing-and-verification-playbook.md)** | Testing & verification playbook (38 e2e tests) | `test/auth.e2e.test.js` |

---

## ⚡ Quickstart

```bash
cd day04/code

# 1. Install dependencies (express · jsonwebtoken · bcrypt · dotenv)
npm install

# 2. Create your environment file and review it
cp .env.example .env

# 3. Start the API (prints a route map + seeded demo credentials)
npm start            # → http://localhost:4000

# 4. Verify the whole surface (38 end-to-end tests, no test framework needed)
npm test
```

### Seeded demo accounts

| Role | Email | Password |
| :--- | :--- | :--- |
| `admin` | `aminul@example.com` | `SuperSecret#2024!` |
| `moderator` | `sarah@example.com` | `Moderate@Pass99` |
| `user` | `bob@example.com` | `User$Passw0rd` |
| `user` | `alice@example.com` | `Alice$Secure1` |

---

## 🗺️ Suggested Build Order

If you are writing this codebase from scratch, follow the guides in order — each one only
depends on files introduced earlier:

```
01 setup → 02 config → 03 bcrypt → 04 users/register → 05 login
      → 06 access JWT → 07 refresh rotation → 08 cookies → 09 authenticate
      → 10 authorize/RBAC → 11 API keys → 12 CORS/limits → 13 errors/audit
      → 14 pipeline assembly → 15 tests
```

---

## 🧰 Requirements

| Tool | Version | Notes |
| :--- | :--- | :--- |
| Node.js | ≥ 18 (developed on 24.x) | `fetch`, `node:test`, `--watch` are used by the tests |
| npm | ≥ 9 | only four runtime dependencies |
| `curl` | any | used for the manual verification steps |
| Build tools | optional | `bcrypt` ships prebuilt binaries; only needed if your platform has none |

---

## 🔐 What You Will Have Built

```
JWT (jsonwebtoken)     →  stateless 15-minute access tokens (HS256, iss/aud/jti/sid)
bcrypt                 →  adaptive password hashing (cost 12) + timing equaliser
.env (dotenv)          →  typed, frozen config with fail-fast production guards
CORS                   →  env-driven origin allow-list with safe preflight handling
+ refresh-token rotation & breach detection, RBAC + anti-BOLA, API keys with scopes,
  sliding-window rate limits, audit logging, graceful shutdown, 38 e2e tests
```
