# Authentication & Authorization — Backend Engineering Notes

Based on your pasted YouTube transcript · First-principles learning notes

These notes reorganize the video into a structured learning resource for backend developers. The focus is on understanding why authentication and authorization exist, how they work internally, how the major approaches differ, and when to use each one.

## 1. The fundamental concepts

Imagine you're building a note-taking application. Users can sign up, log in, create notes, edit them, and delete them. Administrators can also access deleted notes and manage other users.

Two fundamental questions arise:

* Who is making this request?

* What is this person allowed to do?

## Authentication (AuthN)

Who are you?

The process of verifying a user's claimed identity.

Example: verifying an email and password, or validating a sign-in through Google.

## Authorization (AuthZ)

What can you do?

The process of determining whether an authenticated identity has permission to perform an action on a resource.

Example: a regular user can read their notes, while an admin can inspect archived notes.

### A simple example

Suppose Aminul logs into a note-taking app.

1. The server verifies his credentials. This is authentication.

2. The server identifies his account and role.

3. Aminul requests `/admin/archived-notes`.

4. The server checks his permissions.

5. If he lacks the required permission, the server denies the request.

Important: A successful login does not mean a user has permission to perform every action.

## 2. Why do we need both?

Without authentication, a server may not know which user is making a request. Without authorization, the server may allow users to access resources they should not control.

| Scenario                      | Authentication                | Authorization                    |
| ----------------------------- | ----------------------------- | -------------------------------- |
| Logging in with a password    | Verify identity               | Not the main decision            |
| Viewing your own notes        | Identify the user             | Check ownership                  |
| Deleting another user's notes | Identify the user             | Deny unless permitted            |
| Accessing an admin dashboard  | Identify the user             | Check administrative permissions |
| Calling a protected API       | Validate credentials or token | Check access rights              |

A secure backend must make both decisions at the appropriate points in the request lifecycle.

## 3. Authentication: how we arrived at modern systems

The transcript explains authentication through a historical progression. The main idea is that as communication and computing scaled, identity verification needed to become more reliable, portable, and secure.

![hindi classic Panch Parmeshwar by munshi premchand](https://images.openai.com/static-rsc-4/33tCG4cMBux3iJLY_xpGHU8OuOtoYrqxPiGtmK-HJp37x881aTZzb9g-8T_4zDJ0QUeYeUlU-GfCo7fUxCkk8XN8Lul74-hx4_XDaFKSaKWQWn_LaDPfT0cnlcKUsJs29kQTWuvOgu2mTUJVSGMk4v7kenZpIqnOKedhfbbasSQ?purpose=inline)

Add to Favorites

1. Human trust and recognition

In small communities, people relied on personal recognition and trusted individuals to vouch for someone.

Limitation: personal trust does not scale across unfamiliar communities.

![Lot - Henry V of England (1386-1422) Unsigned Document with the King's Great Seal.](https://images.openai.com/static-rsc-4/YQ-OEoHAwuLB7RHBWklEwAQjD0guRtFVXearJTMouJ_N2acYIaZXD2oihgojtygV3aJ_RxRqvAZspy221NJW5LqAnROPzrBfZpn0-of7OcIMG97XxGunB4oCyWMFATGFNtMJVDXsacptxLNmDn8l0c037lp4JmO6AF2DUFZHA78?purpose=inline)

Add to Favorites

2. Physical proof of identity

Wax seals and other identifying marks helped verify documents and agreements.

Limitation: seals could be stolen or forged.

![Telegraphiste](https://images.openai.com/static-rsc-4/UaVzA17YRRMK-6fnKh2MNzdrEFKy0r9yWq3XNC0Yp3GfdmOOY7Npvj_mamPJtFifm6SmqlKXIXgpCfJwsF7KhZnrM5NJS8JsQwWxZHyy89mXnnTP7ZvJZd2DQiXnxHXubkZhJILCCsfm61HGfF5JBv3Pd_ZnZb5O2ImRMwBkQA0?purpose=inline)

Add to Favorites

3. Shared secrets and passphrases

Communication systems used pre-agreed secrets to validate messages or operators.

Core idea: something you know.

![IBM System/360 - CHM Revolution](https://images.openai.com/static-rsc-4/M6IjH3JW5NVYfq1ZFs5RhdX2GGDo7VF1iJs5ow-4XLdkQu4ldEJ_uxVGhcryn5OhAg-AwkeCtnrLLQkwY7sS7Skdv3vgbktQ8PFMQR8OX2-nk_rEICEE0PDCZdc4NXqmW-iYlKHbqeHy16o3JxQDSeVXIUkj8csUUFnMbOGJ9iU?purpose=inline)

Add to Favorites

4. Computer passwords

Multi-user computers needed to distinguish one user's account and data from another's.

Lesson: plaintext password storage creates serious security risks.

![ETRI Develops Telehaptic Sensor Stickers for the Metaverse - Hackster.io](https://images.openai.com/static-rsc-4/NBjr5yBpPwJ-zlMhEIZr0-Za1Qqmt1KaHFg_ZmecTSogdB6FqI9NzLUbTWmVzgLlb8nz00FbGVE4Z_FgLRkLA7jbuaNyE9Rn3DtZ2cnRjLUxVZIZuajpIMW2uGeZdW4OrBqfX0gFdzYPYtg2W1K9Sd34iej2il7LjPeWwIk2QQ8?purpose=inline)

Add to Favorites

5. Modern authentication

Cryptography, multi-factor authentication, tokens, federated login and passwordless methods address different security and usability requirements.

The goal: trustworthy identity verification across web, mobile and distributed systems.

### The major milestones to remember

* 1960s: Multi-user computing made password protection and secure password storage important.

* 1970s: Cryptographic research, including Diffie–Hellman key exchange, advanced secure communication.

* 1990s onward: Internet growth increased the need for stronger authentication, including multi-factor methods.

* 2000s onward: Web APIs, mobile apps and distributed systems expanded token-based authentication and delegated access.

* Modern era: OAuth 2.0, OpenID Connect, WebAuthn and passkeys address different identity and access challenges.

The transcript also mentions decentralized identity, behavioral biometrics and post-quantum cryptography as areas of ongoing development. These are not interchangeable solutions; each addresses different problems.

## 4. Three building blocks: sessions, JWTs and cookies

These concepts frequently appear together, but they solve different problems.

### 4.1 HTTP is stateless

HTTP does not automatically remember previous requests. If a browser sends two requests, the server does not inherently know that both requests came from the same logged-in user.

For example:

```
Request 1: GET /notes
Request 2: POST /notes
Request 3: DELETE /notes/123
```

Each request needs a way to establish the relevant identity and permissions.

This is where sessions, tokens and cookies become useful.

### 4.2 Sessions

A session is server-side state associated with a client or user. A session-based authentication system typically stores a session identifier in the browser and the corresponding session information on the server.

### Session-based authentication flow

1. Browser

Sends email and password

2. Backend server

Verifies credentials and creates a random session ID

3. Session store

Stores session ID, user association, expiry and other needed state

4. Browser receives a cookie

Sends the session cookie on subsequent matching requests

5. Backend validates the session

Looks up the session, checks its validity and identifies the user

Where is session data stored?

* A database can persist session records.

* Redis can store sessions for fast access and shared use across multiple application instances.

* Other storage implementations are possible.

A session usually has an expiry. The server can invalidate it when the user logs out or when access needs to be revoked.

### 4.3 JWT (JSON Web Token)

A JWT is a compact token format that can carry claims about a subject, such as a user ID, and can be digitally signed or otherwise integrity-protected.

JWT is often used for stateless authentication, but JWT and stateless authentication are not synonyms. A JWT can also be used in a system that maintains server-side state.

A typical signed JWT contains three Base64URL-encoded sections:

Header

.

Payload

.

Signature

header.payload.signature

| Component | Purpose                                           | Example                      |
| --------- | ------------------------------------------------- | ---------------------------- |
| Header    | Describes the token type and signing algorithm    | `alg`, `typ`                 |
| Payload   | Contains claims                                   | `sub`, `iat`, `exp`, `role`  |
| Signature | Allows verification of integrity and authenticity | Computed using a signing key |

Example of a decoded payload:

JSON

```
{
  "sub": "user_123",
  "role": "user",
  "iat": 1791820800,
  "exp": 1791824400
}
```

* `sub`: the subject, commonly a user ID.

* `iat`: when the token was issued.

* `exp`: when the token expires.

* `role`: an application-specific claim, if included.

Security rules to remember

* A signed JWT is not automatically encrypted. Its payload is generally readable by anyone who possesses the token.

* Do not put passwords, API secrets or other sensitive information in a readable payload.

* The server must verify the signature, permitted algorithm, issuer and audience where applicable, expiry and other relevant claims.

* A signature detects unauthorized modification; it does not prevent a stolen token from being used.

* A JWT should not be accepted just because it is syntactically valid.

### 4.4 Cookies

A cookie is a browser mechanism for storing small pieces of data and sending them with matching HTTP requests according to its scope and attributes.

Cookies are not authentication methods by themselves. They can transport a session ID or a token.

Important cookie attributes:

| Attribute             | Purpose                                               |
| --------------------- | ----------------------------------------------------- |
| `HttpOnly`            | Prevents JavaScript from reading the cookie           |
| `Secure`              | Sends the cookie only over HTTPS                      |
| `SameSite`            | Controls when cookies are sent in cross-site contexts |
| `Expires` / `Max-Age` | Controls the cookie's lifetime                        |
| `Path` / `Domain`     | Limits where the cookie is applicable                 |

Example:

http

```
Set-Cookie: session_id=random_value; HttpOnly; Secure; SameSite=Lax; Path=/
```

This is an illustrative header, not a complete configuration for every application.

`HttpOnly` reduces the risk of JavaScript stealing the cookie, but it does not eliminate cross-site scripting risks. Cookie-based authentication also requires consideration of cross-site request forgery (CSRF), depending on the application and request design.

### 4.5 How the three concepts relate

Session

The server-side record representing a login or related state.

JWT

A token format that can carry claims and be cryptographically verified.

Cookie

A browser mechanism that can store and send a session ID or token.

The distinction matters: a session ID is normally a reference to server-side state, a JWT is a token containing claims, and a cookie is one way of transporting either.

## 5. Stateful vs. stateless authentication

### 5.1 Stateful authentication

The server keeps authentication-related state and checks that state when handling requests.

Typical flow:

1. User submits credentials.

2. Server verifies them.

3. Server creates a session record.

4. Client receives a session ID, often in a cookie.

5. Client sends the cookie with subsequent requests.

6. Server looks up the session and checks whether it remains valid.

Advantages

* Centralized control over active sessions.

* Straightforward logout and session revocation.

* Easier to invalidate an individual session.

* Session state can be updated without issuing a new token for every change.

Trade-offs

* Requires session storage and lookups.

* Shared session storage or coordination may be needed across server instances.

* Session infrastructure adds operational complexity.

### 5.2 Stateless authentication

In a common stateless JWT design, the server issues a signed token after login. The client sends it with subsequent requests, and the server verifies it without consulting a session store for every request.

Typical request:

http

```
GET /api/notes
Authorization: Bearer <access_token>
```

The backend verifies the token and extracts the relevant identity claims before applying authorization rules.

Advantages

* Can reduce per-request dependence on a session store.

* Convenient for distributed APIs and service architectures.

* Useful for mobile clients and non-browser clients.

* Claims can travel with the token between compatible services.

Trade-offs

* Revoking an individual token before expiry is harder without additional mechanisms.

* Stolen bearer tokens can be used until they expire or are otherwise rejected.

* Key management, claim validation and token lifecycle management remain necessary.

* Large tokens and stale claims can create practical problems.

### 5.3 Comparison

| Factor                           | Stateful sessions                          | Stateless JWT design                                                    |
| -------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Server-side session record       | Usually yes                                | Not required on every request                                           |
| Per-request store lookup         | Common                                     | Can be avoided                                                          |
| Individual session revocation    | Straightforward                            | Requires additional design or waiting for expiry                        |
| Scaling across instances         | Needs shared state or coordination         | Can simplify verification across instances                              |
| Immediate changes to permissions | Easy to reflect through server-side checks | Old claims may remain until expiry unless checked against current state |
| Main complexity                  | Session storage and operations             | Token security, expiry and revocation                                   |

### 5.4 What is a hybrid approach?

A hybrid design combines signed access tokens with selected server-side state.

For example:

* A short-lived access token is verified locally.

* A refresh token or token family is tracked server-side.

* Logout or account compromise revokes refresh capability.

* Sensitive operations may check current permissions or a revocation record.

This can balance scalability with control. However, adding a server-side lookup to every access-token request reduces the stateless advantage, so the lookup strategy should match the security requirements.

Practical takeaway: Do not choose JWT merely because it is popular. Stateful sessions are an excellent default for many browser applications. Short-lived JWT access tokens can suit API-oriented systems, while mobile and distributed architectures require choices based on their actual threat model.

## 6. API-key-based authentication

API keys are primarily useful for identifying and controlling programmatic access to an API, especially machine-to-machine integrations.

Consider this workflow:

```
Your frontend
     |
     v
Your backend
     |
     | API key
     v
External AI provider
     |
     v
AI response
     |
     v
Your backend -> Your frontend
```

Your backend uses a provider-issued API key to make requests on behalf of your application.

### Why API keys exist

* They provide a simple way to identify an application or integration.

* They can be associated with quotas, billing and permitted operations.

* They support automation without requiring a human to log in for every request.

* They can be rotated or revoked independently of a user's password.

### API keys vs. user authentication

An API key usually identifies a client, project or integration. It does not necessarily prove which human user initiated a request.

For user-specific operations, the backend may need both:

1. User authentication to identify the user.

2. Authorization to check what the user may do.

3. A server-held API key to call an external service.

Security rules

* Never expose a privileged provider API key in frontend JavaScript, a public repository or a mobile application's bundled code.

* Store secrets in environment configuration or an appropriate secret manager.

* Use least-privilege keys where supported.

* Apply quotas, rotation and revocation procedures.

* Do not treat an API key alone as sufficient authorization for every action on behalf of an end user.

## 7. OAuth 2.0 and OpenID Connect

These protocols address a different problem from ordinary login: how can one application access another system's resources without asking the user to share their password?

### 7.1 The problem: delegated access

Imagine a travel application wants to read your calendar to organize a trip.

An insecure design might ask for your account password. That could give the application far more access than it needs.

Delegated authorization allows the user to grant limited access without handing over the account password.

### 7.2 OAuth 2.0

OAuth 2.0 is an authorization framework. It allows a client application to obtain limited access to protected resources with the appropriate authorization.

Four core roles:

| Role                 | Meaning                                 | Example                                 |
| -------------------- | --------------------------------------- | --------------------------------------- |
| Resource owner       | The person or entity controlling access | You                                     |
| Client               | The application requesting access       | Travel app                              |
| Authorization server | Issues authorization grants and tokens  | Identity/provider authorization service |
| Resource server      | Hosts the protected resource            | Calendar API                            |

A simplified modern flow:

1. Client application

The user selects “Connect calendar.”

2. Authorization server

The user signs in if necessary and grants the requested permissions.

3. Client obtains an authorization code

In the Authorization Code flow, the code is exchanged for tokens using the defined protocol.

4. Resource server

The client uses an access token to request only the permitted resources.

A common modern implementation uses the Authorization Code flow with PKCE. Redirect handling, client authentication where applicable, state validation and secure token storage are important parts of the implementation.

OAuth 2.0 has multiple flows, but the old Implicit flow is generally not recommended for modern applications.

### 7.3 OpenID Connect (OIDC)

OAuth 2.0 alone does not define a standard way to authenticate a user and communicate their identity to the client.

OpenID Connect builds an identity layer on top of OAuth 2.0. It introduces an ID token and standardized identity information.

For example, when you choose “Sign in with Google”:

1. Your application redirects you to Google's authorization service.

2. You authenticate with Google.

3. You authorize the requested information.

4. Your application completes the appropriate OIDC flow.

5. Your application validates the ID token and establishes its own login session.

The application can then associate the validated external identity with a local account.

### OAuth 2.0 vs. OIDC

| Question                             | OAuth 2.0               | OpenID Connect                          |
| ------------------------------------ | ----------------------- | --------------------------------------- |
| Primary purpose                      | Delegated authorization | Authentication and identity             |
| Main token used for API access       | Access token            | Access token, when API access is needed |
| Standard ID token                    | No                      | Yes                                     |
| “Sign in with Google” identity layer | Not by itself           | Yes                                     |

### Critical distinction between tokens

* Access token: Used to access a protected API. Its format is provider-dependent; it may be opaque or a JWT.

* ID token: Communicates authentication-related claims to the OIDC client.

* Refresh token: Can be used to obtain new access tokens under the provider's rules.

An ID token should not be used as an API access token unless the system explicitly defines and supports that behavior.

## 8. Choosing the right authentication method

Use the following as starting points rather than absolute rules.

| Use case                                        | Reasonable starting point                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Traditional browser-based SaaS                  | Server-side sessions with secure cookies                                               |
| Public or mobile-facing API                     | Short-lived access tokens, often JWTs, or another well-designed token/session approach |
| Backend calling an external AI API              | Server-held API key                                                                    |
| “Sign in with Google”                           | OpenID Connect                                                                         |
| An app accessing a user's third-party resources | OAuth 2.0                                                                              |
| Distributed services                            | Service identity and credentials designed for service-to-service access                |

A useful principle is to separate the questions:

* How does a client establish identity?

* How does the client prove that identity on subsequent requests?

* How does the server determine access rights?

* How is access revoked?

* How are credentials protected and rotated?

One technology rarely answers all five questions by itself.

## 9. Authorization: how a backend decides what users can do

Authentication identifies the caller. Authorization decides whether the caller can perform a specific action on a specific resource.

Let's continue with the note-taking app.

### 9.1 The problem

Suppose the platform has these requirements:

* Regular users can create, read, update and delete their own notes.

* Administrators can access archived notes.

* Moderators can review content but cannot permanently delete archived data.

* Organization admins can manage members of their own organization.

Giving every logged-in user unrestricted access would be a serious security flaw.

### 9.2 RBAC — Role-Based Access Control

RBAC associates permissions with roles, then assigns roles to users.

For example:

| Role      | Read own notes | Edit own notes | Read archived notes | Manage users |
| --------- | -------------- | -------------- | ------------------- | ------------ |
| User      | Yes            | Yes            | No                  | No           |
| Moderator | Yes            | Yes            | Limited             | No           |
| Admin     | Yes            | Yes            | Yes                 | Yes          |

The exact permission matrix depends on the application's requirements.

The flow is:

1. A user signs up or is provisioned an account.

2. The system assigns the user an appropriate role.

3. The user authenticates.

4. The backend identifies the user and obtains their role or permissions.

5. The authorization layer checks the required permission for the requested operation.

6. The backend either continues or rejects the request.

### 9.3 Authorization middleware

A typical backend might separate authentication and authorization middleware.

```
Incoming request
       |
       v
Authentication middleware
       |
       | Identify user
       v
Authorization middleware
       |
       | Check required permission
       v
Route handler
       |
       v
Database operation
```

Illustrative Express-style code:

TypeScript

```
function requireRole(...allowedRoles: string[]) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    next();
  };
}
```

Usage:

TypeScript

```
app.get(
  "/admin/archived-notes",
  authenticate,
  requireRole("admin"),
  getArchivedNotes
);
```

This is illustrative code: it assumes `authenticate` securely validates the request and attaches a trusted `req.user` object.

Never trust a role supplied directly by the client. A user should not be able to make themselves an admin by changing a request body or an unsigned token.

### 9.4 Roles are not always enough

A user may have permission to edit notes but only their own notes. Checking the role alone is insufficient.

For example:

TypeScript

```
const note = await db.note.findUnique({
  where: { id: noteId },
});

if (!note) {
  return res.status(404).json({ error: "Not found" });
}

if (note.ownerId !== req.user.id) {
  return res.status(403).json({ error: "Forbidden" });
}
```

This demonstrates an ownership check. In production, database queries and policy checks should be designed to avoid race conditions and unauthorized information disclosure.

Other useful authorization models include:

* ABAC (Attribute-Based Access Control): Decisions depend on attributes of the user, resource, action or environment.

* ReBAC (Relationship-Based Access Control): Decisions depend on relationships, such as whether a user belongs to a project or organization.

For a small application, RBAC may be enough. For multi-tenant SaaS applications, ownership and organization boundaries are also essential.

## 10. HTTP status codes: 401 vs. 403

These two errors are related but mean different things.

## 401

Unauthorized

The request lacks valid authentication credentials, or the supplied credentials are invalid.

Example: an expired access token or missing credentials for a protected endpoint.

## 403

Forbidden

The server understands the request but refuses to authorize it.

Example: an authenticated regular user attempts to access an admin-only endpoint.

Remember: HTTP 401 is named “Unauthorized,” but in everyday backend terminology, it usually refers to an authentication problem. HTTP 403 usually indicates an authorization denial.

## 11. Secure password storage

A backend must never store user passwords as plaintext.

### Why not plaintext?

If an attacker gains access to a database containing plaintext passwords, they immediately obtain those credentials. Password reuse can then put other accounts at risk.

### Hashing vs. encryption

These concepts should not be confused:

* Encryption is designed to be reversible with the appropriate key.

* Hashing is a one-way transformation used for verification.

* Password hashing uses a password-specific scheme designed to make guessing expensive.

A secure password-verification workflow:

Registration

User submits password

Password hashing algorithm

Argon2id, scrypt or an appropriately configured bcrypt implementation

Database

Stores the password hash and required parameters

During login

Verify the submitted password against the stored hash

Valid → continue authentication

Invalid → reject the login

### Important details

* Use a modern, established password-hashing library.

* Use a unique salt per password; modern password-hashing libraries generally handle this for you.

* Choose appropriate work factors for the deployment environment.

* Never store plaintext passwords or log them.

* Do not use a fast general-purpose hash such as SHA-256 alone for password storage.

* A password hash does not need to be decrypted; the submitted password is verified against it.

A salt is a per-password random value that helps prevent identical passwords from producing identical stored hashes and makes precomputed attacks less useful.

## 12. Authentication security: common attacks and defenses

### 12.1 Brute-force and credential-stuffing attacks

An attacker repeatedly tries passwords or uses leaked username-password combinations.

Defenses include:

* Rate limiting and throttling login attempts.

* Monitoring suspicious login patterns.

* Multi-factor authentication where appropriate.

* Credential-stuffing detection.

* Secure password hashing.

* Carefully designed temporary lockouts and recovery flows.

Avoid permanent account lockouts that attackers can abuse to deny service to legitimate users.

### 12.2 User enumeration

User enumeration happens when an attacker can determine whether a particular account exists.

Consider two login responses:

```
Email not found
Incorrect password
```

These responses reveal different information. An attacker can use the first response to narrow down which accounts exist.

A safer public response is:

JSON

```
{
  "error": "Invalid email or password"
}
```

Use generic responses for relevant login and account-recovery failures, while keeping internal logs useful for debugging and security monitoring.

### 12.3 Timing attacks

A timing attack uses differences in response time to infer information about a system.

For example, imagine an authentication process that:

1. Looks up an account.

2. Checks account status.

3. Verifies the password hash.

If an unknown account is rejected immediately, but a known account triggers an expensive password verification, the difference in timing may reveal whether the account exists.

Possible defenses:

* Use established password-verification functions.

* Perform a dummy password-hash verification when an account does not exist, where appropriate.

* Keep response behavior and timing reasonably consistent across failure paths.

* Apply rate limits and monitoring.

Avoid relying only on an arbitrary fixed delay. It can be insufficient against repeated measurements and may introduce unnecessary latency.

### 12.4 Token theft and replay

If an attacker steals a valid bearer token, they may be able to use it as the legitimate user.

Mitigations include:

* Use HTTPS.

* Keep access tokens short-lived where appropriate.

* Protect tokens in storage and in transit.

* Revoke refresh tokens or sessions when necessary.

* Rotate credentials after suspected compromise.

* Validate token claims correctly.

* Consider sender-constrained tokens for higher-risk environments where supported.

### 12.5 Broken authorization

A user may change a resource ID and access someone else's data, even though they logged in successfully.

For example:

```
GET /api/users/1001/notes
GET /api/users/1002/notes
```

If the backend checks only that the caller is logged in, it may expose another user's notes.

The server must verify that the requested resource belongs to the caller or that the caller has an explicit permission to access it. Never rely solely on hidden buttons or frontend route protection.

## 13. A secure backend request lifecycle

Put all the concepts together:

1. Receive HTTP request

Check request structure and required inputs.

2. Authenticate

Validate the session, token or other credential.

3. Authorize

Check roles, permissions, resource ownership and tenant boundaries.

4. Execute business logic

Perform the permitted operation.

5. Return response

Return appropriate status codes without leaking secrets or sensitive data.

This is a simplified model. Real backends may also include rate limiting, CSRF protection, input validation, audit logging and other middleware.

## 14. Backend implementation checklist

Use this checklist when building an authentication system.

### Implementation tracker

0 / 18 completed

Identity and credentials

Validate and normalize identity inputs appropriately

Hash passwords with an established password-hashing algorithm

Implement secure registration, login, logout and account recovery

Add rate limits and monitoring for authentication attempts

Sessions and tokens

Choose a session or token strategy based on the application

Set expiry and rotation rules

Protect browser cookies with appropriate security attributes

Plan revocation and account-compromise handling

Keep secrets out of frontend bundles and repositories

Authorization

Check permissions on the backend for every protected operation

Enforce resource ownership and tenant boundaries

Use least-privilege roles and permissions

Never trust client-supplied roles or permissions

Operational security

Use HTTPS in production

Return appropriate 401 and 403 responses

Prevent unnecessary account enumeration and sensitive error leakage

Test unauthorized access, token expiry and revoked sessions

Log security events without recording passwords or raw secrets

Reset checklist

## 15. Practical projects to turn these notes into skills

Build these in order. Each project teaches a different part of the authentication and authorization lifecycle.

![Font Store: Responsive Ecommerce Website Template by Dean — Framer Marketplace](https://images.openai.com/static-rsc-4/5-Qu2R5cJnEMVlZG52sYfQJIMzpwaaSH5uSALuFeqGQyBQPW0E5KvpiKjIF_y4KWsVYeKzNeGR_jbcIplQiGU5xqx__GQg1Knbb2qrAlXH23RjBSSild_6nRQ5oiCA0NzuWNNLwABNRstmcykMrgn3rFsdU6K3cd7hxNSzY1lwI?purpose=inline)

Add to Favorites

Project 1 — Authentication API

Beginner

Build a Node.js + Express + TypeScript API with registration, login, password hashing, logout and protected endpoints.

Learn: HTTP status codes, password verification, sessions, cookies and middleware.

![Role-Based Access Control (RBAC): The Complete Guide | QuantumByte Success Story](https://images.openai.com/static-rsc-4/aQNEorNGNa_oqpF3HH6ecYvGVRHOAIRXpJPVvNhprWYGRwdv8qKmylzrRCvn_WThaiIhLMVU9lsswFKxBG9gnm38q5iiuWZfpb432mE8GysUDRePow8xbXeY-HrRQZxE9U7VaO0J6sP09e7ejDe841IhEKe6M5yooSmvpiC0x3M?purpose=inline)

Add to Favorites

Project 2 — RBAC and permissions

Intermediate

Add user, moderator and admin roles. Protect endpoints and enforce ownership checks on notes and users.

Learn: authorization middleware, RBAC, resource-level permissions and access-control testing.

![Developer Tools – 7shifts](https://images.openai.com/static-rsc-4/gdmxQvLEn1MAuznv-bFwOzqKWDC4Y7qKK6cW7uf6emQUKdffK5XFqs7stJoGywm50JMoG3EZ5jwzEB0YiT8i-vldq6JWaaHol01T0f8YNw2s5MF90OZ8HI5qhmvIRYASswbakaXtLugei6PTW6GWtKJYxdC2H9hJYmO4Ja7U3ik?purpose=inline)

Add to Favorites

Project 3 — Token-based API

Intermediate

Implement short-lived JWT access tokens, refresh-token rotation and revocation.

Learn: token claims, signing, verification, expiry, key management and token lifecycle design.

![HOWTO Oauth Configuration | Bicom Systems Wiki](https://images.openai.com/static-rsc-4/VjFWuEwIzlFZklwg9cvfTp7P89GN-z1kHJldxfdQCS5YPJF6y2-qM5ks_nvILVB2MsRgSPIhLWaJ-UaUhl-PQrmgapaQgwQA2w-lt3GQz_RYCeG1LwrJbnO8vYmLEHynWOQfrUngMaE3EV-CrC6uosGB06keTqqSLtHtLz0pGHE?purpose=inline)

Add to Favorites

Project 4 — Social login and integrations

Advanced

Add OIDC sign-in and an OAuth integration that accesses a third-party API with limited permissions.

Learn: authorization codes, PKCE, ID tokens, access tokens, consent and delegated access.

### Suggested learning sequence

1. Understand HTTP, requests, responses, headers and cookies.

2. Build registration and login using secure password hashing.

3. Add authentication middleware and protected routes.

4. Implement sessions, then compare them with JWT-based authentication.

5. Add RBAC, ownership checks and tenant isolation.

6. Integrate OAuth 2.0 and OpenID Connect using a trusted provider.

7. Test attack scenarios, revocation, expiry and unauthorized access.

## 16. Self-assessment questions

Try answering these without looking at the notes.

### Knowledge check

0 / 8 answered

1. What is the fundamental difference between authentication and authorization?

Authentication verifies identity; authorization checks permission.

Authentication checks roles; authorization hashes passwords.

They are two names for the same process.

2. What does HTTP being stateless mean?

Every request automatically shares the previous request's state.

HTTP does not inherently remember previous requests.

HTTP cannot use cookies.

3. What is a cookie?

A password-hashing algorithm.

A server database.

A browser mechanism for storing and sending data with matching requests.

4. What is a major advantage of server-side sessions?

Individual sessions can be revoked centrally.

They never require server storage.

They eliminate all security risks.

5. Does a signed JWT hide its payload?

Yes, always.

No, signing protects integrity but does not inherently encrypt the payload.

Only if it contains a user ID.

6. What is OAuth 2.0 primarily designed for?

Password hashing.

Delegated authorization to access protected resources.

Replacing HTTPS.

7. An authenticated user tries to access an admin-only route. Which response is commonly appropriate?

401 in every case.

200 because the user logged in.

403 Forbidden.

8. A user changes a note ID in an API request. What must the backend check?

Only whether the user is logged in.

Whether the user owns the note or has permission to access it.

Only whether the note ID is numeric.

Check answers

## 17. Final revision sheet

| Concept          | Remember this                                               |
| ---------------- | ----------------------------------------------------------- |
| Authentication   | Who are you?                                                |
| Authorization    | What are you allowed to do?                                 |
| Session          | Server-side state associated with a login                   |
| JWT              | A token format that carries claims and can be signed        |
| Cookie           | A browser mechanism for storing and sending data            |
| Stateful auth    | Authentication relies on server-side state                  |
| Stateless auth   | Can verify a request without a per-request session lookup   |
| API key          | Identifies or grants access to an API client or integration |
| OAuth 2.0        | Delegated authorization                                     |
| OpenID Connect   | Standardized identity layer built on OAuth 2.0              |
| RBAC             | Permissions associated with roles                           |
| Password hashing | Secure one-way password verification                        |
| HTTP 401         | Authentication credentials are missing or invalid           |
| HTTP 403         | Access is forbidden                                         |
| User enumeration | Revealing whether an account exists                         |
| Timing attack    | Inferring information from execution-time differences       |

The most important backend engineering lesson: authentication is not just a login form, and authorization is not just checking whether someone is an admin. A secure system validates credentials, establishes identity, checks permission for every protected operation, protects credentials and tokens, and provides a way to revoke access.

These notes retain the transcript's main structure and examples while clarifying technical distinctions where the spoken explanation was simplified.
