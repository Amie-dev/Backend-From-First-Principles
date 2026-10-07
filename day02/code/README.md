# Day 02: Express Routing & URL Architecture Codebase

This directory contains the production-grade **Express.js code implementation** demonstrating all core concepts of routing, path parameters, query strings, nested resources, versioning, and catch-all fallbacks covered in Day 02.

---

## 🛠️ Project Structure

```
day02/code/
├── package.json                   # Node.js dependencies & execution scripts ("type": "module")
├── README.md                      # Instructions & testing guide
└── src/
    ├── server.js                  # Main HTTP server launcher (Port 3000)
    ├── app.js                     # Express app assembly & catch-all handler
    ├── raw-router-dispatcher.js   # Low-level custom router dispatcher (No framework, Port 8081)
    ├── controllers/
    │   ├── user.controller.js     # Static & Dynamic route handlers
    │   ├── post.controller.js     # Nested route handlers
    │   ├── search.controller.js   # Query parameter search & pagination handlers
    │   └── product.controller.js  # V2 versioned API route handlers
    └── routes/
        ├── v1/                    # Version 1 Router Pipeline (Includes Sunset/Deprecation headers)
        │   ├── index.js           # Master V1 router wrapper
        │   ├── user.routes.js     # Static & Dynamic path routes
        │   ├── post.routes.js     # Nested child router ({ mergeParams: true })
        │   └── search.routes.js   # Query parameter search routes
        └── v2/                    # Version 2 Active Router Pipeline
            └── index.js           # V2 product routes
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
cd day02/code
npm install
```

### 2. Run the Main Express Server
```bash
npm start
```
*Server runs on `http://localhost:3000`*

### 3. Run the Low-Level First-Principles Router
```bash
npm run raw-router
```
*Raw custom router runs on `http://localhost:8081`*

---

## 🧪 Testing All Routing Concepts with `cURL`

### 1. Static Routes
```bash
# Test static metadata route
curl -v http://localhost:3000/api/v1/users/info

# Test static collection route
curl -v http://localhost:3000/api/v1/users
```

### 2. Dynamic Routes & Path Parameters (`:userId`)
```bash
# Extract path parameter ID 2
curl -v http://localhost:3000/api/v1/users/2
```

### 3. Query Parameters, Search & Pagination (`?key=val`)
```bash
# Query with search, category filtering, pagination, and sorting
curl -v "http://localhost:3000/api/v1/search?category=backend&query=express&page=1&limit=2&sort=price:desc"
```

### 4. Nested Routes (`/users/:userId/posts/:postId`)
```bash
# List nested post sub-collection for User 1
curl -v http://localhost:3000/api/v1/users/1/posts

# Fetch single nested child entity (Post 102 belonging to User 1)
curl -v http://localhost:3000/api/v1/users/1/posts/102
```

### 5. Route Versioning & Deprecation Headers (`v1` vs `v2`)
```bash
# V1 Request (Check output headers for 'Deprecation: true' and 'Sunset' RFC 8594 headers)
curl -v http://localhost:3000/api/v1/users

# V2 Request (Active modern version with updated price schema)
curl -v http://localhost:3000/api/v2/products
```

### 6. Catch-All Route Fallback (`404 Not Found`)
```bash
# Request unmatched URL path
curl -v http://localhost:3000/api/v1/invalid-route-name
```
