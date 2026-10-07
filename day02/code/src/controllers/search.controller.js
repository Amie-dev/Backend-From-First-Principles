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
