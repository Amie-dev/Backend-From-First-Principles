// Mock In-Memory User Database
const mockUsers = new Map([
  [1, { id: 1, name: "Alice Smith", email: "alice@example.com", role: "admin" }],
  [2, { id: 2, name: "Bob Jones", email: "bob@example.com", role: "developer" }],
  [3, { id: 3, name: "Charlie Brown", email: "charlie@example.com", role: "designer" }]
]);

/**
 * GET /api/v1/users (Static Route: Collection List)
 */
export function getAllUsers(req, res) {
  const users = Array.from(mockUsers.values());
  res.status(200).json({
    status: "success",
    routeType: "Static Collection Route",
    count: users.length,
    data: users
  });
}

/**
 * GET /api/v1/users/info (Static Route: Hardcoded System Info)
 */
export function getUserSystemInfo(req, res) {
  res.status(200).json({
    status: "success",
    routeType: "Static Metadata Route",
    info: "User Management Module v1.0.0",
    maxLimit: 100
  });
}

/**
 * GET /api/v1/users/:userId (Dynamic Route: Path Parameter Extraction)
 */
export function getUserById(req, res) {
  // Extract path parameter from req.params
  const { userId } = req.params;
  const numericId = parseInt(userId, 10);

  const user = mockUsers.get(numericId);

  if (!user) {
    return res.status(404).json({
      error: {
        code: "USER_NOT_FOUND",
        message: `User with ID '${userId}' was not found`,
        status: 404
      }
    });
  }

  res.status(200).json({
    status: "success",
    routeType: "Dynamic Route with Path Parameter (:userId)",
    extractedParams: req.params,
    data: user
  });
}
