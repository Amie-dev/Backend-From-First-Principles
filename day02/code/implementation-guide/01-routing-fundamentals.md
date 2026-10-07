# Implementation Guide - Chapter 01: Low-Level Custom Router Dispatcher

## 1. Overview & Goal

Before relying on Express's internal router, we build a **custom HTTP router dispatcher** from first principles using Node.js's native `http` module.

We convert parameter syntax like `:userId` into regular expressions (`Regex`), match incoming request paths, extract dynamic parameters, and dispatch requests to matching handler functions.

---

## 2. Terminal Test Commands

```bash
# Start custom router server
npm run raw-router

# Test dynamic path parameter extraction in separate terminal
curl http://localhost:8081/api/users/99
```

---

## 3. Complete Source Code: `src/raw-router-dispatcher.js`

Create `day02/code/src/raw-router-dispatcher.js`:

```javascript
/**
 * First-Principles Custom Router Dispatcher (No Frameworks)
 * Demonstrates low-level route matching, dynamic parameter extraction via Regex,
 * and Method + Path dispatching.
 */

import http from "http";

const PORT = 8081;

class CustomRouter {
  constructor() {
    this.routes = [];
  }

  // Register a route with method, path pattern, and handler
  addRoute(method, pathPattern, handler) {
    // Convert parameter syntax like /users/:id to Regex pattern
    const paramNames = [];
    const regexPath = pathPattern.replace(/:([a-zA-Z0-9_]+)/g, (_, paramName) => {
      paramNames.push(paramName);
      return "([^/]+)";
    });

    const regex = new RegExp(`^${regexPath}$`);
    this.routes.push({ method: method.toUpperCase(), regex, paramNames, handler });
  }

  get(path, handler) { this.addRoute("GET", path, handler); }
  post(path, handler) { this.addRoute("POST", path, handler); }

  // Match and dispatch incoming HTTP request
  dispatch(req, res) {
    const reqMethod = req.method.toUpperCase();
    const [reqPath] = req.url.split("?");

    console.log(`[Raw Custom Router] Dispatching ${reqMethod} ${reqPath}...`);

    for (const route of this.routes) {
      if (route.method !== reqMethod) continue;

      const match = reqPath.match(route.regex);
      if (match) {
        // Extract dynamic path parameters
        const params = {};
        route.paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });

        req.params = params;
        return route.handler(req, res);
      }
    }

    // Fallback Catch-All 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Route '${reqMethod} ${reqPath}' not found` }));
  }
}

// Instantiate custom router
const router = new CustomRouter();

// 1. Static Route
router.get("/api/static/info", (req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ type: "First-Principles Static Route", status: "OK" }));
});

// 2. Dynamic Route with Regex Path Parameter extraction
router.get("/api/users/:userId", (req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    type: "First-Principles Dynamic Route",
    extractedParams: req.params
  }));
});

// Create HTTP server
const server = http.createServer((req, res) => {
  router.dispatch(req, res);
});

server.listen(PORT, () => {
  console.log(`🚀 First-Principles Custom Router running on http://localhost:${PORT}`);
  console.log(`Test with: curl http://localhost:${PORT}/api/users/99`);
});
```

---

## 4. Deep Code Explanation

1. **`pathPattern.replace(/:([a-zA-Z0-9_]+)/g, ...)`**: Matches colon parameter definitions (e.g. `:userId`) and captures parameter keys into an array (`paramNames`). It replaces `:userId` with the regex wildcard group `([^/]+)` (matching any characters except a slash).
2. **`new RegExp('^' + regexPath + '$')`**: Constructs a compiled regular expression enforcing an exact start-to-end path match.
3. **`reqPath.match(route.regex)`**: Evaluates whether an incoming request URL matches the route pattern.
4. **`params[name] = match[index + 1]`**: Maps captured regex capture groups back to named parameters, attaching them to `req.params`.
