# Day 04: Authentication & Authorization - Complete Notes

Welcome to the comprehensive notes for **Day 04: Authentication & Authorization for Backend Engineers**. These notes expand upon the raw class material into nine structured, first-principles chapters featuring detailed architectural diagrams, comparative trade-off tables, security attack vectors, and production-ready Express/Node.js pseudocode implementations.

---

## 📚 Table of Contents

| Chapter | Title | Key Topics Covered |
| :--- | :--- | :--- |
| **[Chapter 01](./01-authn-vs-authz-and-identity-evolution.md)** | AuthN vs. AuthZ & The Evolution of Identity | Definitions, 5-era evolution (trust, seals, passwords, crypto), dual gatekeeper architecture, Express middleware separation |
| **[Chapter 02](./02-stateless-http-and-the-core-triad-sessions-jwt-cookies.md)** | Stateless HTTP & The Core Triad (Sessions, JWTs, Cookies) | HTTP statelessness, in-memory/Redis sessions, JWT anatomy (`header.payload.signature`), cookie security flags (`HttpOnly`, `Secure`, `SameSite`) |
| **[Chapter 03](./03-stateful-vs-stateless-vs-hybrid-architectures.md)** | Stateful vs. Stateless vs. Hybrid Architectures | Centralized Redis revocation, stateless token scaling, hybrid model, refresh token rotation (RTR), and token family reuse detection |
| **[Chapter 04](./04-api-keys-and-machine-to-machine-auth.md)** | API Keys & Machine-to-Machine (M2M) Authentication | M2M communication vs user auth, Stripe-style key anatomy (`sk_live_...`), SHA-256 database hashing, key scopes, and rate limiting |
| **[Chapter 05](./05-oauth2-and-openid-connect.md)** | Delegated Access & Federation (OAuth 2.0 & OIDC) | Delegated authorization problem, 4 OAuth roles, Auth Code Flow with PKCE (`code_verifier` / `code_challenge`), ID token vs access token, "Sign in with Google" |
| **[Chapter 06](./06-authorization-models-rbac-abac-and-ownership.md)** | Authorization Models (RBAC, ABAC, and Ownership) | Role-Based Access Control matrix, declarative permission middleware, BOLA/IDOR vulnerability defense, resource ownership, ABAC/ReBAC |
| **[Chapter 07](./07-password-hashing-and-cryptographic-storage.md)** | Cryptographic Password Storage & Hashing | Plaintext catastrophe, encoding vs encryption vs hashing, why GPU-fast hashes (MD5, SHA-256) fail, Argon2id, bcrypt, salts, and work factors |
| **[Chapter 08](./08-security-attacks-threat-modeling-and-defenses.md)** | Threat Modeling, Attacks & Defensive Countermeasures | HTTP 401 vs 403, brute-force & credential stuffing defense, user enumeration elimination, timing attacks & dummy hashing, token theft |
| **[Chapter 09](./09-end-to-end-request-lifecycle-and-project-roadmap.md)** | End-to-End Request Pipeline & Engineering Roadmap | Complete 7-stage backend pipeline, 18-point production checklist, 4 hands-on projects, self-assessment questions, and revision sheet |

---

## 🎯 Learning Objectives

By studying these chapter notes and reviewing the included Node.js/Express implementations, you will master:

1. **The Fundamental Boundary Between AuthN and AuthZ**:
   * Distinguish between identifying *who* is making the request (**Authentication**) and deciding *what* they are allowed to touch (**Authorization**).
   * Understand why AuthN must always precede AuthZ in the request lifecycle.
2. **The Core Triad of Web Identity**:
   * Recognize that **Sessions** represent server-side state, **JWTs** represent self-contained signed tokens, and **Cookies** represent browser storage and transport mechanisms.
   * Configure hardened cookies using `HttpOnly`, `Secure`, and `SameSite` flags.
3. **Architectural Trade-Offs Across State Models**:
   * Contrast stateful session databases against stateless cryptographic tokens.
   * Implement the modern **Hybrid Model** featuring short-lived access tokens (15m) and rotating refresh tokens with automatic breach detection.
4. **Machine-to-Machine (M2M) Security**:
   * Generate high-entropy API keys with identifiable prefixes (`sk_live_...`), store one-way SHA-256 hashes, and enforce per-key rate limits and scopes.
5. **Modern Identity Federation (OAuth 2.0 & OIDC)**:
   * Explain why the Implicit Flow was deprecated and implement the **Authorization Code Flow with PKCE** (`S256`).
   * Differentiate between **Access Tokens** (for APIs) and **ID Tokens** (for identity) in *"Sign in with Google"* workflows.
6. **Robust Access Control Models & BOLA Defense**:
   * Build declarative **Role-Based Access Control (RBAC)** middleware.
   * Defend against **Broken Object Level Authorization (BOLA/IDOR)** by enforcing resource ownership directly in application logic and database queries.
7. **Cryptographic Password Storage**:
   * Understand why fast general-purpose hashes (MD5, SHA-256) are easily cracked by modern GPUs.
   * Implement slow, memory-hard hashing using **Argon2id** and **bcrypt** with dynamic salts and work factor calibration.
8. **Threat Modeling & Hardened API Design**:
   * Return precise HTTP semantics (**401 Unauthorized** vs **403 Forbidden**).
   * Neutralize **User Enumeration** using uniform error responses and prevent **Timing Attacks** using dummy hash computations and constant-time string comparisons (`crypto.timingSafeEqual`).

---

## 🗺️ Architectural Mental Model: The Dual Gatekeeper

```
                                 HTTP REQUEST
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │   1. Authentication Gate  │
                        │   ("Who are you?")        │
                        └─────────────┬─────────────┘
                                      │
                     Credentials Valid?
                     ├─── NO  ──────────────────────► Return 401 Unauthorized
                     └─── YES
                                      │ Attach `req.user`
                                      ▼
                        ┌───────────────────────────┐
                        │   2. Authorization Gate   │
                        │   ("What can you do?")    │
                        └─────────────┬─────────────┘
                                      │
                     Has Permission & Owns Resource?
                     ├─── NO  ──────────────────────► Return 403 Forbidden
                     └─── YES
                                      │ Proceed
                                      ▼
                        ┌───────────────────────────┐
                        │   3. Scoped Controller    │
                        │   & Database Query        │
                        └───────────────────────────┘
```

---

## 🚀 Practical Projects Roadmap

To build deep muscle memory, work through the practical projects detailed in **[Chapter 09](./09-end-to-end-request-lifecycle-and-project-roadmap.md)**:

1. **Project 1 (Beginner)**: Stateful Authentication API (Node.js + Express + Scrypt/Argon2 + Sessions + Cookies).
2. **Project 2 (Intermediate)**: Role-Based Access Control (RBAC) & Note Ownership API (Anti-BOLA/IDOR).
3. **Project 3 (Intermediate)**: Hybrid Token-Based API (Short-lived JWT Access Tokens + Refresh Token Family Rotation).
4. **Project 4 (Advanced)**: Social Login & Delegated Access (OAuth 2.0 PKCE + Google OpenID Connect Client).
