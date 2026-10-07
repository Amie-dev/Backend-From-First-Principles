# Implementation Guide - Chapter 03: Query Parameters, Filtering & Pagination

## 1. Overview & Goal

In this chapter, we implement query parameter parsing (`?key=val`), search filtering, pagination, and sorting in `GET` requests.

Because `GET` requests do not carry a request payload body, query strings are the standard mechanism to pass search terms (`query`), filters (`category`), pagination offsets (`page=1&limit=10`), and sorting sequences (`sort=price:desc`).

---

## 2. Terminal Test Commands

```bash
# 1. Search catalog with filtering, sorting, and pagination
curl -v "http://localhost:3000/api/v1/search?category=backend&query=express&page=1&limit=2&sort=price:desc"

# 2. Test default fallback query parameters (No query string provided)
curl -v "http://localhost:3000/api/v1/search"
```

---

## 3. Complete Source Code

### File 1: `src/controllers/search.controller.js`

```javascript
// Mock Dataset for Search and Query Filtering
const mockCatalog = [
  { id: 1, title: "Node.js Design Patterns", category: "backend", price: 45, rating: 4.8 },
  { id: 2, title: "Express.js in Action", category: "backend", price: 35, rating: 4.5 },
  { id: 3, title: "React Up and Running", category: "frontend", price: 40, rating: 4.6 },
  { id: 4, title: "Designing Data-Intensive Applications", category: "architecture", price: 55, rating: 4.9 },
  { id: 5, title: "Go Programming Language", category: "backend", price: 50, rating: 4.7 }
];

/**
 * GET /api/v1/search?query=val&category=backend&page=1&limit=2&sort=price:asc
 * Demonstrates query parameter parsing, filtering, pagination, and sorting.
 */
export function searchCatalog(req, res) {
  // Extract query parameters from req.query
  const { query, category, page = "1", limit = "10", sort = "id:asc" } = req.query;

  let results = [...mockCatalog];

  // 1. Apply Filtering by Category if provided
  if (category) {
    results = results.filter((item) => item.category.toLowerCase() === category.toLowerCase());
  }

  // 2. Apply Text Search Query if provided
  if (query) {
    results = results.filter((item) =>
      item.title.toLowerCase().includes(query.toLowerCase())
    );
  }

  // 3. Apply Sorting
  const [sortField, sortOrder] = sort.split(":");
  results.sort((a, b) => {
    const valA = a[sortField] || a.id;
    const valB = b[sortField] || b.id;
    if (sortOrder === "desc") {
      return valA < valB ? 1 : -1;
    }
    return valA > valB ? 1 : -1;
  });

  // 4. Apply Pagination
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const totalItems = results.length;
  const offset = (pageNum - 1) * limitNum;

  const paginatedResults = results.slice(offset, offset + limitNum);

  res.status(200).json({
    status: "success",
    routeType: "Query Parameter Search & Filtering Route (?query=...)",
    parsedQueryParams: req.query,
    meta: {
      totalItems,
      currentPage: pageNum,
      pageSize: limitNum,
      totalPages: Math.ceil(totalItems / limitNum)
    },
    data: paginatedResults
  });
}
```

### File 2: `src/routes/v1/search.routes.js`

```javascript
import express from "express";
import { searchCatalog } from "../../controllers/search.controller.js";

const router = express.Router();

// Route: /api/v1/search?query=val&category=backend&page=1&limit=10
router.get("/", searchCatalog);

export default router;
```

---

## 4. Deep Code Explanation

1. **`req.query`**: Express automatically parses incoming URL query strings (everything after `?`) into a key-value JavaScript object.
2. **Default Fallback Values**: Destructuring with defaults (`const { page = "1", limit = "10" } = req.query`) ensures the server operates predictably even if the client provides zero query parameters.
3. **Calculating Offset for Pagination**:
   - `offset = (pageNum - 1) * limitNum`
   - Page 1 with limit 10: `(1 - 1) * 10 = offset 0` (items 0 to 10).
   - Page 2 with limit 10: `(2 - 1) * 10 = offset 10` (items 10 to 20).
4. **`results.slice(offset, offset + limitNum)`**: Extracts the exact slice of dataset matching the requested page window.
5. **Metadata Response Envelope**: Returning `meta: { totalItems, totalPages }` provides frontends with the metadata required to render pagination controls.
