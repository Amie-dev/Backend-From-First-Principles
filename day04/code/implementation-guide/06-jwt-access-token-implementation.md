# Implementation Guide 06: Stateless JWT Access Tokens

## 1. Goal & First-Principles Context

A **JSON Web Token** is three base64url segments joined by dots:

```
header.payload.signature
  │       │        └── HMAC-SHA256(header + "." + payload, secret)
  │       └── the claims: who, what role, which session, when it expires
  └── {"alg":"HS256","typ":"JWT"}
```

Two properties make JWTs the right tool for *access* tokens:

* **Self-contained** — every fact the API needs to authorise a request travels with it, so the
  hot path needs **no database lookup** and scales by adding replicas (Ch03).
* **Tamper-evident, not secret** — the signature guarantees integrity, but the payload is
  readable by anyone holding the token. Therefore: no PII, no secrets (Ch02).

That second property is also why the lifetime must be short: **you cannot un-issue a stateless
token.** The 15-minute TTL is the damage bound; the refresh token (Guide 07) is the revocation
lever.

---

## 2. Files Involved

| File | Role |
| :--- | :--- |
| `src/services/token.service.js` | `signAccessToken`, `verifyAccessToken`, `decodeUnsafe`, `issueTokenPair` |
| `src/config/env.js` | secrets, algorithm, issuer, audience, TTL (Guide 02) |
| `src/middlewares/authenticate.middleware.js` | the verification gate (Guide 09) |
| `src/controllers/auth.controller.js` | returns the token in the login response |

---

## 3. Source: Signing & Verification

```javascript
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config, logger } from "../config/env.js";
import { userStore } from "../db/user.store.js";

/** Access-token lifetime in seconds (what the client puts in its refresh timer). */
export const ACCESS_TOKEN_TTL_SECONDS = Math.max(1, Math.floor(config.jwt.accessTtlMs / 1000));

export class TokenService {
  /**
   * Sign a short-lived stateless access token with HS256.
   *
   * Claims:
   *   sub  → user id (the only identity claim anything should trust)
   *   role → RBAC role, so the AuthZ gate needs no database read
   *   sid  → refresh-token family id, letting logs correlate a call to a session
   *   jti  → unique token id, ready for a future deny-list
   *   iss/aud → strongest defence against token confusion between services
   *
   * NOTE: no PII (email, name) is embedded — JWTs are signed, NOT encrypted.
   */
  static signAccessToken(user, sessionId) {
    return jwt.sign(
      {
        sub: user.id,
        role: user.role,
        ...(sessionId ? { sid: sessionId } : {}),
      },
      config.jwt.accessSecret,
      {
        algorithm: config.jwt.algorithm,       // "HS256"
        expiresIn: config.jwt.accessTtl,       // "900s"
        issuer:   config.jwt.issuer,           // "day04-auth-api"
        audience: config.jwt.audience,         // "day04-client"
        jwtid: crypto.randomUUID(),            // jti
      }
    );
  }

  /**
   * Verify signature, expiry, issuer and audience.
   *
   * The `algorithms` allow-list is mandatory: without it a library that trusts the
   * header can be tricked into accepting `alg: none` or an RS256 token verified as
   * HMAC (algorithm confusion).
   */
  static verifyAccessToken(token) {
    const claims = jwt.verify(token, config.jwt.accessSecret, {
      algorithms: [config.jwt.algorithm],
      issuer:   config.jwt.issuer,
      audience: config.jwt.audience,
    });

    if (typeof claims === "string" || !claims.sub) {
      throw new jwt.JsonWebTokenError("Malformed token payload");
    }
    return claims;
  }

  /** Decode WITHOUT verifying — for logging/telemetry only. Never gate access on this. */
  static decodeUnsafe(token) {
    try {
      return jwt.decode(token);
    } catch {
      return null;
    }
  }
}
```

### Deep explanation

1. **`algorithms: ["HS256"]` is the single most important line in the file.** Without it, a
   token whose header says `{"alg":"none"}` is accepted by naive verifiers, and a token signed
   with the server's *public* RSA key can be replayed as an HMAC token. An allow-list makes
   both impossible.
2. **`iss` and `aud` stop token confusion.** A token minted by (or for) another service is
   rejected here even if the secret were somehow shared. In multi-service systems this is how
   you keep "auth-api tokens" from being accepted as "billing-api tokens".
3. **`sub` is an opaque surrogate key (`usr_…`), not an email.** The token is readable, so it
   must not carry anything you would not print on a postcard. Controllers fetch PII from the
   store when they need it.
4. **`sid` links the token to its refresh family** (Guide 07). It is what makes
   "which session is this request from?" answerable — needed for the sessions list and for
   correlating an ingestion spike with a specific session in logs.
5. **`jti` is minted but unused today** — deliberately. Adding a deny-list later ("revoke this
   exact token") requires *every* issued token to already carry an id; retrofitting it means
   two token formats in the wild.
6. **`expiresIn` comes from config, in canonical seconds**, so the number the client is told
   (Guide 05's `expiresIn` field) and the number the token enforces can never drift.
7. **`decodeUnsafe` is named to be un-missable.** There is exactly one legitimate use (logging
   what was presented before verification) and the name makes a reviewer stop and check.

---

## 4. Source: Issuing the Pair

```javascript
  /**
   * Issue an access + refresh pair for a fresh login (starts a new token family).
   */
  static issueTokenPair(user, context = {}) {
    const refresh = refreshStore.create(user.id, user.role, undefined, context);
    const accessToken = TokenService.signAccessToken(user, refresh.familyId);

    return {
      accessToken,
      refreshTokenId: refresh.tokenId,
      familyId: refresh.familyId,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }
```

Because this is the only place a login session is created, there is exactly **one** code path
that mints tokens — audited once, tested once, fixed once.

---

## 5. Verification

### 5.1 Decode the token you were issued

```bash
BASE=http://localhost:4000

TOKEN=$(curl -s -X POST $BASE/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"bob@example.com","password":"User$Passw0rd"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')

# header
echo "$TOKEN" | cut -d. -f1 | base64 -d 2>/dev/null; echo
# payload
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null; echo
```

Expected:

```json
{"alg":"HS256","typ":"JWT"}
{"sub":"usr_20dc2c542146","role":"user","sid":"b53e5717-…","iat":1791961515,"exp":1791962415,
 "aud":"day04-client","iss":"day04-auth-api","jti":"b041ca95-…"}
```

Reading it proves the point: **the payload is visible to anyone holding the token.** No email,
no name, no permissions beyond the role.

### 5.2 The token is accepted

```bash
curl -s $BASE/api/v1/auth/me -H "authorization: Bearer $TOKEN"
# → 200 {"status":"success","data":{"id":"usr_…","email":"bob@example.com","role":"user", …}}
```

### 5.3 Tampering, `alg: none` and foreign signatures are rejected

```bash
# 1. Flip the signature
TAMPERED="$(echo "$TOKEN" | cut -d. -f1).$(echo "$TOKEN" | cut -d. -f2).AAAA"
curl -s $BASE/api/v1/auth/me -H "authorization: Bearer $TAMPERED"
# → 401 {"error":{"code":"UNAUTHORIZED","message":"Invalid access token", …}}

# 2. Forge an unsecured token (alg:none) — must NOT be accepted
HEADER=$(printf '{"alg":"none","typ":"JWT"}' | base64 -w0 | tr '+/' '-_' | tr -d '=')
PAYLOAD=$(printf '{"sub":"usr_forged","role":"admin","iss":"day04-auth-api","aud":"day04-client"}' \
  | base64 -w0 | tr '+/' '-_' | tr -d '=')
curl -s $BASE/api/v1/auth/me -H "authorization: Bearer $HEADER.$PAYLOAD."
# → 401

# 3. No header at all
curl -s $BASE/api/v1/auth/me
# → 401 "Missing or malformed Authorization header — expected: Bearer <access_token>"

# 4. Expiry: set ACCESS_TOKEN_TTL=5s in .env, restart, log in, wait 6 s, call /me
#    → 401 "Access token has expired — call POST /api/v1/auth/refresh to renew it"
```

The suite covers all of these:

```bash
npm test   # "GET /auth/me rejects missing, malformed and tampered tokens with 401 (Ch01)"
           # "tokens signed with a different secret are rejected (Ch02)"
           # "a token with alg=none is rejected — algorithm confusion (Ch08)"
```

---

## 6. Why This Matters

* **Statelessness is a scaling decision with a security bill.** No session lookup on the hot
  path is why this service can run 50 replicas behind a load balancer; the bill is that
  revocation must be carried by the refresh token plus a short TTL.
* **The `algorithms` allow-list is non-negotiable.** Historical JWT bypasses (CVE-class
  `alg: none`, RS256→HS256 confusion) all live in the gap between "the library verifies" and
  "the library verifies *what you meant*".
* **Claims are an API contract.** `sub`, `role`, `sid`, `jti`, `iss`, `aud`, `iat`, `exp` are
  what downstream services will depend on for years; adding a claim later is easy, removing one
  is a migration.
* **15 minutes is a deliberate, measured compromise** between token-revocation latency and
  database load. Making it 24 hours would feel convenient and would turn any leaked token into
  a day-long incident.

