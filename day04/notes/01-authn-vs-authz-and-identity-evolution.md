# Chapter 01: Authentication vs. Authorization & The Evolution of Identity

## 1. The Fundamental Distinction: AuthN vs. AuthZ

Every secure backend system operating over a network must resolve two fundamentally distinct security questions for every incoming request:

```
                          Incoming Request
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ 1. Who are you?       │ ──► Authentication (AuthN)
                     └───────────────────────┘
                                 │ (Identity Verified)
                                 ▼
                     ┌───────────────────────┐
                     │ 2. What can you do?   │ ──► Authorization (AuthZ)
                     └───────────────────────┘
                                 │ (Permissions Granted)
                                 ▼
                     ┌───────────────────────┐
                     │ Execute Protected     │
                     │ Resource Logic        │
                     └───────────────────────┘
```

### Authentication (AuthN) — *"Who are you?"*
* **Definition**: The process of validating a caller's claimed identity using credentials, tokens, or cryptographic signatures.
* **Core Artifact**: Returns an authenticated principal (e.g., `userId: "usr_9812"`, `email: "aminul@example.com"`).
* **Failure State**: If credentials are missing, malformed, or invalid, the backend halts execution with **HTTP 401 Unauthorized** (semantically "Unauthenticated").
* **Examples**:
  * Verifying an email and password against stored cryptographic hashes.
  * Verifying a signed JWT signature and expiry.
  * Validating a Google OpenID Connect ID token.
  * Authenticating a client via mTLS (Mutual TLS) certificates.

### Authorization (AuthZ) — *"What are you allowed to do?"*
* **Definition**: The process of determining whether an already-authenticated identity possesses the rights to perform a specific action on a specific resource.
* **Core Artifact**: A boolean access decision (`ALLOW` or `DENY`) based on roles, scopes, relationships, or attributes.
* **Failure State**: If the identity is verified but lacks permission, the backend halts execution with **HTTP 403 Forbidden**.
* **Examples**:
  * A regular user can read their own notes (`GET /notes/101`), but cannot view another user's notes (`GET /notes/102`).
  * An admin can inspect archived audit records (`GET /admin/archived-notes`).
  * A billing service can read credit card tokens, whereas a support agent can only view masked card numbers.

---

## 2. Why Modern Backends Require Both Gates

A common beginner pitfall is treating login as an all-access pass. In distributed systems, **Authentication without Authorization is catastrophic**, and **Authorization without Authentication is impossible**.

### Scenario Breakdown Matrix

| Scenario | Authentication Check | Authorization Check | Outcome / HTTP Code |
| :--- | :--- | :--- | :--- |
| **Anonymous access to public docs** | Skipped / Optional | Public route permitted | `200 OK` |
| **User logs in with valid password** | Validates credentials; returns session/token | Checks if account is active/not suspended | `200 OK` (Token issued) |
| **User reads their own private note** | Confirms caller is `User A` | Verifies `note.ownerId === "User A"` | `200 OK` |
| **User attempts to delete another user's note** | Confirms caller is `User A` | Checks `note.ownerId === "User B"` (Mismatch!) | `403 Forbidden` |
| **User requests `/admin/users` without admin role** | Confirms caller is `User A` | Verifies `req.user.role === "admin"` (False!) | `403 Forbidden` |
| **Request with expired or forged JWT** | Signature invalid or `exp` elapsed | Never evaluated (Pipeline aborted) | `401 Unauthorized` |

> [!IMPORTANT]
> **Authentication must always precede Authorization.** If the server cannot verifiably determine who is making the request, it cannot evaluate permissions against access control lists (ACLs) or ownership rules.

---

## 3. The Historical Evolution of Identity Verification

Understanding why modern authentication architectures rely on asymmetric cryptography, tokens, and delegated access requires tracing the historical progression of identity. As human communication transitioned from localized villages to global computer networks, identity systems evolved across five distinct eras:

```
Era 1: Personal Trust   ──► In-person recognition (Tribal / Village scale)
Era 2: Physical Proof   ──► Wax seals, insignias, stamped passports
Era 3: Shared Secrets   ──► Passphrases, telegraph cyphers, countersigns
Era 4: OS Multi-User    ──► Passwords stored in /etc/passwd (Time-sharing mainframe)
Era 5: Modern Crypto    ──► PKI, MFA, OAuth2/OIDC, WebAuthn & Post-Quantum
```

### 1. Human Trust and Physical Recognition (Local Era)
* **Mechanism**: Small communities and village assemblies (e.g., traditional elders/panchayats). People were recognized visually and vouched for by trusted community leaders.
* **System Limitation**: Relies entirely on physical co-presence. Does not scale across geographic distances or unfamiliar parties.

### 2. Physical Proof of Identity (Documentary Era)
* **Mechanism**: Kings and magistrates used engraved wax seals (such as King Henry V's Great Seal), signet rings, and official stamped letters of passage.
* **System Limitation**: Physical tokens can be stolen, physically duplicated, or forged by skilled artisans. Physical inspection cannot be verified over a wire.

### 3. Shared Secrets & Passphrases (Telegraph & Early Network Era)
* **Mechanism**: Military field posts and telegraph operators agreed upon pre-shared secret code words (*"Something you know"*) before transmitting messages.
* **System Limitation**: Pre-shared keys must be securely distributed beforehand. If a key is intercepted during distribution, the entire system is compromised.

### 4. Multi-User Computer Passwords (1960s Mainframe Era)
* **Mechanism**: With systems like CTSS (Compatible Time-Sharing System) and the IBM System/360, multiple engineers accessed the same physical CPU via terminals. The OS introduced alphanumeric user accounts and passwords to protect user files from other local users.
* **System Limitation**: Mainframes originally stored passwords in plaintext in system files. A breach of the system file leaked all user credentials simultaneously.

### 5. Modern Cryptographic Era (1970s - Present)
* **1970s**: Diffie-Hellman Key Exchange and RSA revolutionized security by introducing asymmetric cryptography (public/private key pairs). Systems could authenticate across untrusted networks without sharing private secrets.
* **1990s - 2000s**: The explosion of the World Wide Web necessitated HTTPS (SSL/TLS), password salting/hashing, and multi-factor authentication (MFA).
* **2010s**: The rise of mobile smartphones and distributed microservices popularized token-based architectures (JWTs) and delegated identity protocols (OAuth 2.0 / OpenID Connect).
* **Modern Era & Future**:
  * **WebAuthn / Passkeys**: Asymmetric cryptographic keys bound to hardware TPMs/biometrics, replacing passwords entirely.
  * **Decentralized Identity (DIDs & Verifiable Credentials)**: Self-sovereign identity without centralized gatekeepers.
  * **Post-Quantum Cryptography (PQC)**: Lattice-based algorithms (e.g., ML-KEM, ML-DSA) designed to withstand attacks by quantum computers.

---

## 4. The Two-Gate Architecture in Web Applications

In backend engineering, authentication and authorization are implemented as **independent sequential middleware layers**. 

```
                                 HTTP REQUEST
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │ Authentication Middleware │
                        └───────────────────────────┘
                                      │
                     Credentials Valid?
                     ├─── NO  ──────────────────────► Return 401 Unauthorized
                     └─── YES
                                      │ Attach `req.user`
                                      ▼
                        ┌───────────────────────────┐
                        │ Authorization Middleware  │
                        └───────────────────────────┘
                                      │
                     Has Permission?
                     ├─── NO  ──────────────────────► Return 403 Forbidden
                     └─── YES
                                      │ Proceed
                                      ▼
                        ┌───────────────────────────┐
                        │ Route Controller Handler  │
                        └───────────────────────────┘
                                      │ Scoped DB query
                                      ▼
                                Database / Store
```

### The Architectural Contract:
1. **Authentication Middleware**:
   * Reads credentials from headers (e.g., `Authorization: Bearer <token>`) or signed cookies.
   * Validates the integrity and expiration of the credential.
   * If valid, hydrates and attaches the authenticated principal to the request context (e.g., `req.user`).
   * If invalid, rejects immediately with `401 Unauthorized`.
2. **Authorization Middleware**:
   * Assumes `req.user` already exists.
   * Evaluates if `req.user` possesses the required roles, scopes, or ownership rights.
   * If unauthorized, halts with `403 Forbidden`.
   * Does **not** re-verify passwords or cryptographic signatures.

---

## 5. Express/Node.js Pseudocode: Dual Gatekeeper Implementation

The following complete Express/TypeScript implementation simulates a multi-tier note-taking service demonstrating strict separation between AuthN and AuthZ.

```typescript
// ==============================================================================
// Chapter 01: Dual Gatekeeper Simulation (AuthN vs AuthZ) in Express/Node.js
// ==============================================================================

import express, { Request, Response, NextFunction } from "express";

const app = express();
app.use(express.json());

// ------------------------------------------------------------------------------
// 1. Domain Types & In-Memory Storage
// ------------------------------------------------------------------------------
export interface UserPrincipal {
  id: string;
  username: string;
  role: "user" | "moderator" | "admin";
}

// Extend Express Request type to carry the authenticated principal
declare global {
  namespace Express {
    interface Request {
      user?: UserPrincipal;
    }
  }
}

interface Note {
  id: string;
  ownerId: string;
  title: string;
  content: string;
  isArchived: boolean;
}

// Mock database
const USERS_DB: Record<string, UserPrincipal> = {
  "token_user_101": { id: "u_101", username: "aminul", role: "user" },
  "token_mod_202":  { id: "u_202", username: "sarah_mod", role: "moderator" },
  "token_admin_999": { id: "u_999", username: "alex_admin", role: "admin" }
};

const NOTES_DB: Note[] = [
  { id: "n_1", ownerId: "u_101", title: "Aminul's Draft", content: "Secret notes", isArchived: false },
  { id: "n_2", ownerId: "u_202", title: "Community Guidelines", content: "Be kind", isArchived: false },
  { id: "n_3", ownerId: "u_101", title: "Archived Notes", content: "Old archives", isArchived: true }
];

// ------------------------------------------------------------------------------
// 2. Gatekeeper 1: Authentication Middleware (AuthN)
// "Who are you?" -> Returns 401 if missing or invalid
// ------------------------------------------------------------------------------
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Missing or malformed Authorization header. Expected Bearer token."
    });
    return;
  }

  const rawToken = authHeader.split(" ")[1];
  const principal = USERS_DB[rawToken];

  if (!principal) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Invalid or expired authentication credentials."
    });
    return;
  }

  // Attach verified identity to request context
  req.user = principal;
  next();
}

// ------------------------------------------------------------------------------
// 3. Gatekeeper 2: Authorization Middleware (AuthZ)
// "What can you do?" -> Returns 403 if authenticated identity lacks privileges
// ------------------------------------------------------------------------------
export function requireRole(...allowedRoles: Array<UserPrincipal["role"]>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Defensive check: AuthN must have executed first
    if (!req.user) {
      res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Authentication context missing. AuthN must precede AuthZ."
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: `Forbidden. Role '${req.user.role}' lacks permission for this action. Allowed: [${allowedRoles.join(", ")}]`
      });
      return;
    }

    next();
  };
}

// ------------------------------------------------------------------------------
// 4. Resource Ownership Authorization Check
// ------------------------------------------------------------------------------
export function authorizeNoteAccess(req: Request, res: Response, next: NextFunction): void {
  const noteId = req.params.noteId;
  const user = req.user!; // Ensured by authenticate middleware

  const note = NOTES_DB.find((n) => n.id === noteId);

  if (!note) {
    res.status(404).json({ error: "NOT_FOUND", message: `Note ${noteId} not found.` });
    return;
  }

  // Ownership Rule: User must be the owner OR an admin
  const isOwner = note.ownerId === user.id;
  const isAdmin = user.role === "admin";

  if (!isOwner && !isAdmin) {
    res.status(403).json({
      error: "FORBIDDEN",
      message: "Forbidden. You do not have ownership rights to access this resource."
    });
    return;
  }

  next();
}

// ------------------------------------------------------------------------------
// 5. Protected Routes Demonstrating AuthN + AuthZ Composition
// ------------------------------------------------------------------------------

// Public Route (No Gatekeepers)
app.get("/health", (_req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Authenticated Route: Any valid user can view their identity
app.get("/api/me", authenticate, (req: Request, res: Response) => {
  res.json({
    message: "Identity verified successfully",
    principal: req.user
  });
});

// Role-Gated Route: Only admins can view archived notes
app.get(
  "/api/admin/archived-notes",
  authenticate,
  requireRole("admin"),
  (_req: Request, res: Response) => {
    const archives = NOTES_DB.filter((n) => n.isArchived);
    res.json({ count: archives.length, data: archives });
  }
);

// Ownership-Gated Route: Only note owner or admin can read a specific note
app.get(
  "/api/notes/:noteId",
  authenticate,
  authorizeNoteAccess,
  (req: Request, res: Response) => {
    const note = NOTES_DB.find((n) => n.id === req.params.noteId);
    res.json({ data: note });
  }
);

export default app;
```

---

## 6. Key Takeaways & Architectural Rules

1. **AuthN and AuthZ are decoupled responsibilities**:
   * AuthN handles credential ingestion, token signature verification, and identity extraction.
   * AuthZ handles rule evaluation, role matrices, ownership validation, and organizational tenancy.
2. **Never blend AuthN and AuthZ into a single ad-hoc check**:
   * Mixing credential checks with resource permissions in controller logic leads to brittle code, duplicate DB lookups, and security bypasses.
3. **HTTP 401 vs. HTTP 403**:
   * **401 Unauthorized**: You are anonymous or your token is invalid. Provide valid credentials and retry.
   * **403 Forbidden**: We know who you are, but you are not allowed here. Retrying with the same credentials will fail.
