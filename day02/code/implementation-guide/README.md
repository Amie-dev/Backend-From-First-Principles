# Day 02: Express Routing Implementation Guide (From First Principles)

This directory contains step-by-step implementation guides for the Day 02 Express.js routing codebase.

Every chapter in this guide contains:
* 🛠️ **Exact Terminal Commands**: Setup and testing commands (`npm`, `curl`).
* 💻 **Complete, Copy-Pasteable Source Code**: 100% functional ES Module JavaScript code.
* 📖 **Deep Line-by-Line Code Explanations**: First-principles breakdown of routing mechanics.

---

## 📚 Guide Table of Contents

| Chapter Guide | Topic Covered | Implementation File |
| :--- | :--- | :--- |
| **[Chapter 01](./01-routing-fundamentals.md)** | First-Principles Custom Router Dispatcher | `src/raw-router-dispatcher.js` |
| **[Chapter 02](./02-static-and-dynamic-routes.md)** | Static & Dynamic Path Parameters Routes | `src/controllers/user.controller.js` & `src/routes/v1/user.routes.js` |
| **[Chapter 03](./03-query-parameters-and-pagination.md)** | Query Parameters, Filtering, & Pagination | `src/controllers/search.controller.js` & `src/routes/v1/search.routes.js` |
| **[Chapter 04](./04-nested-routes.md)** | Nested Routes & Relational Hierarchy | `src/controllers/post.controller.js` & `src/routes/v1/post.routes.js` |
| **[Chapter 05](./05-route-versioning.md)** | API Route Versioning & Sunset Headers | `src/routes/v1/index.js` & `src/routes/v2/index.js` |
| **[Chapter 06](./06-catch-all-routes.md)** | Catch-All Fallback & Express Server Assembly | `src/app.js` & `src/server.js` |
