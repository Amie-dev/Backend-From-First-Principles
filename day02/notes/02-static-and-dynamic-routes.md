# Chapter 02: Static & Dynamic Routes

## 1. Static Routes

A **Static Route** is defined by a fixed, unchanging URL path. It contains zero variable parameters within the route definition.

```http
GET /api/books
POST /api/books
GET /api/v1/health
```

* **Characteristics**: The URL path remains constant regardless of which user calls it or what dataset is returned.
* **Use Case**: Used for collection endpoints, public status checks, or fixed administrative actions.

---

## 2. Dynamic Routes & Path Parameters

A **Dynamic Route** incorporates variable placeholders directly within the URL path string. These dynamic variables are called **Path Parameters**.

```http
GET /api/users/:id
DELETE /api/products/:sku
```

```
URL Requested:  /api/users/123
Route Template: /api/users/:id
                           |
                           v
              Extracted Param: id = "123"
```

---

## 3. Path Parameters Semantics

Path Parameters represent **primary entity identifiers**. They express what specific entity the client is acting upon.

| URL Example | Route Pattern | Extracted Parameter | Semantic Meaning |
| :--- | :--- | :--- | :--- |
| `/api/users/42` | `/api/users/:id` | `req.params.id = "42"` | Fetch details for user with ID 42 |
| `/api/books/9780131103627` | `/api/books/:isbn` | `req.params.isbn = "9780131103627"` | Fetch book matching ISBN |
| `/api/orders/ord_9988` | `/api/orders/:orderId` | `req.params.orderId = "ord_9988"` | Delete order with ID `ord_9988` |

---

## 4. JavaScript Pseudocode: Express Static & Dynamic Route Handlers

```javascript
// ==============================================================================
// JavaScript / Express Implementation of Static and Dynamic Routes
// ==============================================================================

import express from "express";

const app = express();

// ------------------------------------------------------------------------------
// 1. STATIC ROUTE (Collection Resource Endpoint)
// Path is fixed and unchanging
// ------------------------------------------------------------------------------
app.get("/api/books", (req, res) => {
  res.status(200).json({
    type: "Static Route Response",
    books: [
      { id: 1, title: "Clean Code" },
      { id: 2, title: "Designing Data-Intensive Applications" }
    ]
  });
});

// ------------------------------------------------------------------------------
// 2. DYNAMIC ROUTE (Single Entity Identifier Endpoint)
// Express uses ':paramName' syntax to extract variables into req.params
// ------------------------------------------------------------------------------
app.get("/api/users/:userId", (req, res) => {
  // Extract path parameter from req.params object
  const { userId } = req.params;

  res.status(200).json({
    type: "Dynamic Route Response",
    extractedUserId: userId,
    user: { id: userId, name: `User_${userId}`, email: `user${userId}@example.com` }
  });
});

// Multiple Path Parameters in a single route
app.get("/api/departments/:deptId/employees/:empId", (req, res) => {
  const { deptId, empId } = req.params;

  res.status(200).json({
    departmentId: deptId,
    employeeId: empId
  });
});
```

---

## 5. Key Takeaways

1. **Static routes** have fixed, hardcoded URL paths (`/api/books`).
2. **Dynamic routes** use colon parameter syntax (`:id`) to accept dynamic resource identifiers.
3. In Express, path parameters are automatically parsed into the **`req.params`** object.
