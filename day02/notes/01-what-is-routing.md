# Chapter 01: What is Routing?

## 1. Defining Web Routing

**Routing** expresses the **"where"** of an HTTP request. It indicates which server-side resource, location, or business logic handler an action is directed towards.

In backend systems, routing maps incoming request URIs and HTTP methods to specific server functions:

$$\text{Unique Route Dispatch Key} = \text{HTTP Method ("What")} + \text{URL Path ("Where")}$$

```
Incoming Request: [GET] /users
                         |
                         v
        +----------------------------------+
        |        Routing Dispatcher        |
        +----------------------------------+
                         |
      Matches Key: "GET /users"
                         |
                         v
        +----------------------------------+
        |   getUsersHandler(req, res)     |
        |   --> Returns Array of Users     |
        +----------------------------------+
```

---

## 2. The Relationship Between "What" and "Where"

| Component | Role | Example | Description |
| :--- | :--- | :--- | :--- |
| **HTTP Method ("What")** | Semantic Intent | `GET`, `POST`, `PUT`, `DELETE` | Specifies the action to be taken on the resource. |
| **URL Path ("Where")** | Resource Identifier | `/api/v1/products`, `/users` | Specifies the target entity or collection on the server. |
| **Route Handler** | Business Logic | `(req, res) => { ... }` | The controller function executed when Method + Path match. |

### Routing Dispatch Table Example

```text
Key: "GET /api/books"     --> Execute fetchAllBooksHandler()
Key: "POST /api/books"    --> Execute createNewBookHandler()
Key: "DELETE /api/books"  --> Execute deleteAllBooksHandler()
```

---

## 3. JavaScript Pseudocode: Low-Level Express/Node.js Router Dispatcher

```javascript
// ==============================================================================
// JavaScript / Node.js First-Principles Router Implementation
// Demonstrates how HTTP routers map (Method + Path) keys to handler functions
// ==============================================================================

class SimpleRouter {
  constructor() {
    // Map storing key: "METHOD /path", value: handler function
    this.routes = new Map();
  }

  // Register a route
  register(method, path, handler) {
    const routeKey = `${method.toUpperCase()} ${path}`;
    this.routes.set(routeKey, handler);
  }

  // Dispatch incoming HTTP request to matching handler
  dispatch(req, res) {
    const routeKey = `${req.method.toUpperCase()} ${req.path}`;
    
    if (this.routes.has(routeKey)) {
      const handler = this.routes.get(routeKey);
      return handler(req, res);
    }

    // Default 404 handler when route key does not exist
    res.statusCode = 404;
    res.end(JSON.stringify({ error: `Route ${routeKey} not found` }));
  }
}

// Instantiate router
const router = new SimpleRouter();

// Define route handlers
router.register("GET", "/users", (req, res) => {
  return { status: 200, data: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] };
});

router.register("POST", "/users", (req, res) => {
  return { status: 201, message: "User created" };
});

// Test dispatching
console.log(router.dispatch({ method: "GET", path: "/users" }, {}));
console.log(router.dispatch({ method: "POST", path: "/users" }, {}));
```

---

## 4. Key Takeaways

1. **Routing** connects client requests to server-side code execution.
2. The combination of **HTTP Method** + **URL Path** forms the unique key used by framework routers.
3. Decoupling routes into explicit paths allows backend servers to organize logic cleanly and predictably.
