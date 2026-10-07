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
