# Chapter 05: HTTP Methods & Idempotency

## 1. What are HTTP Methods?

HTTP Methods (also known as HTTP Verbs) define the **semantic intent** of a request. They inform the server of the desired action to be performed on a target resource identified by a Request-URI.

---

## 2. Safety and Idempotency Defined

Designing reliable backend APIs in Node.js requires understanding two mathematical properties: **Safety** and **Idempotency**.

### 2.1 Safe Methods
A method is considered **Safe** if executing it causes **zero side effects on server state**. Safe methods are strictly read-only retrieval operations.
$$\text{State}_{\text{after}} = \text{State}_{\text{before}}$$

### 2.2 Idempotent Methods
A method is considered **Idempotent** if executing it multiple times sequentially yields the **exact same final server state** as executing it a single time.
$$f(x) = f(f(x)) = f(f(f(x)))$$

> **Why Idempotency Matters in Distributed Backend Systems**:
> If a client sends a request across a flaky network connection and encounters a network timeout, the client doesn't know if the request failed before reaching the server or while returning the response. If the operation is **idempotent** (like `PUT` or `DELETE`), the client can safely **retry the request** without creating duplicate records or corrupting data.

---

## 3. Comprehensive Methods & Idempotency Matrix

| Method | Semantic Action | Safe? | Idempotent? | Request Body | Response Body | Typical Status Codes |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **`GET`** | Retrieve resource representation | **Yes** | **Yes** | No | Yes | `200 OK`, `404 Not Found` |
| **`POST`** | Create new resource or submit data | No | **No** | Yes | Yes | `201 Created`, `400 Bad Request` |
| **`PUT`** | Completely replace resource at target URI | No | **Yes** | Yes | Yes / No | `200 OK`, `201 Created`, `204 No Content` |
| **`PATCH`** | Partially modify existing resource | No | No* | Yes | Yes | `200 OK`, `400 Bad Request` |
| **`DELETE`**| Remove target resource | No | **Yes** | Optional | Yes / No | `200 OK`, `204 No Content`, `404 Not Found` |
| **`OPTIONS`**| Query allowed capabilities / CORS preflight | **Yes** | **Yes** | Optional | Yes | `200 OK`, `204 No Content` |

*\*Note: `PATCH` can be designed to be idempotent (e.g., `SET status = 'ACTIVE'`), but mathematically it is categorized as non-idempotent by default because operations like `INCREMENT age BY 1` yield different results on repeated calls.*

---

## 4. PUT vs. POST vs. PATCH Breakdown

```
+-----------------------------------------------------------------------------------+
|  POST /users        --> Creates a NEW user record (ID assigned by server)          |
|                         Repeated POST calls create User #1, User #2, User #3.     |
+-----------------------------------------------------------------------------------+
|  PUT /users/42      --> Replaces User #42 ENTIRELY with the payload provided.      |
|                         Repeated PUT calls overwrite User #42 with identical state.|
+-----------------------------------------------------------------------------------+
|  PATCH /users/42    --> Updates ONLY specified fields (e.g., email) of User #42.   |
+-----------------------------------------------------------------------------------+
```

---

## 5. JavaScript Pseudocode: Idempotent vs. Non-Idempotent API Handlers

```javascript
// ==============================================================================
// JavaScript / Node.js Backend API Handlers demonstrating Idempotency differences
// ==============================================================================

class UserDatabase {
  constructor() {
    this.users = new Map(); // Key: userId, Value: userObj
    this.autoIncrementId = 1;
  }
}

const db = new UserDatabase();

// ------------------------------------------------------------------------------
// 1. NON-IDEMPOTENT CREATION (POST)
// Repeated calls create duplicate records with new auto-incremented IDs
// ------------------------------------------------------------------------------
function handlePostUser(reqBody) {
  const userId = db.autoIncrementId++;
  const newUser = {
    id: userId,
    name: reqBody.name,
    email: reqBody.email
  };

  db.users.set(userId, newUser);

  return {
    statusCode: 201,
    body: { message: "User created", user: newUser }
  };
}

// ------------------------------------------------------------------------------
// 2. IDEMPOTENT COMPLETE REPLACEMENT (PUT)
// Repeated calls produce identical server database state for targetUserId
// ------------------------------------------------------------------------------
function handlePutUser(targetUserId, reqBody) {
  const replacedUser = {
    id: targetUserId,
    name: reqBody.name,
    email: reqBody.email
  };

  // Completely overwrites entity state at specific target identity key
  db.users.set(targetUserId, replacedUser);

  return {
    statusCode: 200,
    body: { message: "User state replaced", user: replacedUser }
  };
}

// ------------------------------------------------------------------------------
// 3. IDEMPOTENT DELETION (DELETE)
// Repeated calls result in user being absent from DB state
// ------------------------------------------------------------------------------
function handleDeleteUser(targetUserId) {
  db.users.delete(targetUserId);
  return { statusCode: 204, body: null };
}

// Execution Test
const payload = { name: "Charlie", email: "charlie@example.com" };

console.log("=== Running POST twice (Non-Idempotent) ===");
const res1 = handlePostUser(payload);
const res2 = handlePostUser(payload);
console.log(`POST Call 1 Created ID: ${res1.body.user.id}`);
console.log(`POST Call 2 Created ID: ${res2.body.user.id}`); // New ID created!

console.log("\n=== Running PUT twice for ID 99 (Idempotent) ===");
const res3 = handlePutUser(99, payload);
const res4 = handlePutUser(99, payload);
console.log(`PUT Call 1 DB Entry 99:`, db.users.get(99));
console.log(`PUT Call 2 DB Entry 99:`, db.users.get(99)); // Exact same state!
```

---

## 6. Key Takeaways

1. **Safe methods** (`GET`, `OPTIONS`) never mutate server data.
2. **Idempotent methods** (`GET`, `PUT`, `DELETE`) produce identical server state regardless of how many times they are retried.
3. `POST` is **non-idempotent** and creates new resource entities on repeated invocations.
4. Designing APIs with proper method semantics enables **safe automatic network retries** in distributed backend systems.
