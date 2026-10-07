# Day 02: Routing & URL Architecture - Complete Notes

Welcome to the comprehensive notes for **Day 02: Routing & URL Architecture**. These notes break down the raw class concepts into 6 modular, deeply structured chapters with first-principles explanations, architectural flow diagrams, and JavaScript/Node.js Express pseudocode.

---

## 📚 Table of Contents

| Chapter | Title | Key Topics Covered |
| :--- | :--- | :--- |
| **[Chapter 01](./01-what-is-routing.md)** | What is Routing? | HTTP Verbs ("What") vs Paths ("Where"), Route Key dispatching, Handler mapping |
| **[Chapter 02](./02-static-and-dynamic-routes.md)** | Static & Dynamic Routes | Fixed URL paths, Dynamic Path Parameters (`:id`), Entity identification |
| **[Chapter 03](./03-query-parameters.md)** | Query Parameters & Search Filtering | URL query strings (`?key=val`), Pagination (`page=2`), Sorting, Filtering in GET requests |
| **[Chapter 04](./04-nested-routes.md)** | Nested Routes & Hierarchy | Parent-child resource relationships (`/users/:userId/posts/:postId`), REST semantics |
| **[Chapter 05](./05-route-versioning-and-deprecation.md)** | Route Versioning & Deprecation | `/api/v1` vs `/api/v2`, Breaking change isolation, Sunset deprecation strategies |
| **[Chapter 06](./06-catch-all-routes.md)** | Catch-All Routes & Fallbacks | Wildcard handlers (`*`), Route matching precedence, Graceful 404 responses |

---

## 🎯 Learning Objectives

By studying these chapter notes and reading the included JavaScript pseudocode, you will understand:
1. **How web frameworks resolve incoming HTTP requests** by combining HTTP methods and URL paths into unique dispatch keys.
2. **How to design clean, RESTful URL parameters** using path parameters for resource identification and query parameters for filtering/pagination.
3. **How to express complex domain relationships** using nested route hierarchies.
4. **How to manage API lifecycles** through URL versioning (`/v1/`, `/v2/`) and deprecation policies without breaking active client applications.
