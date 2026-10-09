# Implementation Guide 01: Universal Wire Formats & Data Boundaries

## 1. Architectural Concept

Modern web systems connect heterogeneous client and server environments (e.g., JavaScript in browsers, Rust or Node.js on servers). Because memory layouts, pointer addresses, and type systems differ across programming runtimes, data cannot cross network boundaries in its raw RAM representation.

Instead, systems convert native data structures into a **Universal Wire Format** (such as JSON text) before network transmission:

```
[ Native Client Object ] ===( Serialization )===> [ Standard Wire Payload ] ===( Deserialization )===> [ Native Server Object ]
```

---

## 2. Code Implementation Walkthrough

In `src/controllers/serialization.controller.js`, the `/users/register` endpoint demonstrates how incoming wire payloads are processed:

```javascript
import { Router } from "express";
import { SerializationController } from "../controllers/serialization.controller.js";

// Endpoint accepting universal JSON wire format
router.post("/users/register", SerializationController.registerUser);
```

### Controller Processing Logic:
```javascript
export class SerializationController {
  static registerUser(req, res) {
    // req.body has been deserialized from UTF-8 string into native JS object
    const { username, email, role } = req.body;

    if (!username || !email) {
      return res.status(422).json({
        error: "Unprocessable Entity",
        message: "Fields 'username' and 'email' are required."
      });
    }

    const newUser = {
      id: Math.floor(Math.random() * 9000) + 1000,
      username,
      email,
      role: role || "USER",
      createdAt: new Date().toISOString()
    };

    // Serializes native object back into JSON response wire string
    return res.status(201).json({
      status: "SUCCESS",
      message: "User successfully registered via custom body parser.",
      user: newUser
    });
  }
}
```

---

## 3. Testing with cURL

Execute the following cURL command to send a JSON wire payload to the server:

```bash
curl -X POST http://localhost:3000/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{"username": "alex_dev", "email": "alex@example.com", "role": "ADMIN"}'
```

### Expected Output:
```json
{
  "status": "SUCCESS",
  "message": "User successfully registered via custom body parser.",
  "user": {
    "id": 4821,
    "username": "alex_dev",
    "email": "alex@example.com",
    "role": "ADMIN",
    "createdAt": "2026-10-09T14:15:00.000Z"
  }
}
```
