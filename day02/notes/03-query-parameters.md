# Chapter 03: Query Parameters & Search Filtering

## 1. What are Query Parameters?

**Query Parameters** are optional key-value pairs appended to the end of a URL string following a question mark (`?`). Multiple query parameters are separated using ampersands (`&`).

```http
GET /api/books?category=programming&page=2&limit=10&sort=asc
```

```
Base Path: /api/books
Delimiter: ?
Key 1:     category = programming
Delimiter: &
Key 2:     page     = 2
Key 3:     limit    = 10
Key 4:     sort     = asc
```

---

## 2. Why Use Query Parameters?

Because **`GET` requests do not contain a request body**, query parameters serve as the primary mechanism for passing client options, filters, and metadata to the server.

### Primary Use Cases
1. **Pagination**: Requesting specific subsets of dataset pages (`?page=3&limit=20`).
2. **Filtering**: Filtering results by attributes (`?status=active&role=admin`).
3. **Searching**: Transmitting keyword search strings (`?q=distributed+systems`).
4. **Sorting**: Specifying order sequence (`?sort=created_at:desc`).

---

## 3. Path Parameters vs. Query Parameters

| Feature | Path Parameters (`:id`) | Query Parameters (`?key=val`) |
| :--- | :--- | :--- |
| **Location** | Integrated into URL path (`/users/42`) | Appended after question mark (`/users?role=admin`) |
| **Semantic Role** | Identifies a **specific entity** | **Filters, sorts, or paginates** a collection |
| **Required/Optional** | Mandatory for matching route path | Usually optional with default fallback values |
| **Express Object** | Accessible via `req.params` | Accessible via `req.query` |

---

## 4. JavaScript Pseudocode: Express Query Parameter Parsing & Pagination

```javascript
// ==============================================================================
// JavaScript / Express Implementation of Query Parameters & Pagination
// ==============================================================================

import express from "express";

const app = express();

/**
 * GET /api/search?query=express&category=backend&page=1&limit=5
 */
app.get("/api/search", (req, res) => {
  // Express automatically parses query strings into req.query
  const { query, category, page = 1, limit = 10 } = req.query;

  // Convert string pagination values to integers
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  // Compute offset for database queries
  const offset = (pageNum - 1) * limitNum;

  res.status(200).json({
    status: "success",
    filters: {
      searchTerm: query || null,
      selectedCategory: category || "all"
    },
    pagination: {
      currentPage: pageNum,
      pageSize: limitNum,
      calculatedOffset: offset
    }
  });
});
```

---

## 5. Key Takeaways

1. **Query Parameters** append key-value options after a `?` delimiter in the URL.
2. They are used in `GET` requests for **filtering, sorting, searching, and pagination**.
3. In Express, query string parameters are automatically parsed into **`req.query`**.
