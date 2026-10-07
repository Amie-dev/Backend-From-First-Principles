// Mock In-Memory Posts Database mapped by userId
const mockPosts = new Map([
  [1, [
    { id: 101, title: "Understanding REST Routing", content: "Routing maps HTTP method and URI to code handlers." },
    { id: 102, title: "Mastering Node.js Streams", content: "Streams save memory during large file transfers." }
  ]],
  [2, [
    { id: 201, title: "Building Scalable Architecture", content: "Decouple services to achieve fault tolerance." }
  ]]
]);

/**
 * GET /api/v1/users/:userId/posts (Nested Route: Sub-collection List)
 */
export function getPostsByUser(req, res) {
  // Access parent parameter merged from parent router
  const { userId } = req.params;
  const numericUserId = parseInt(userId, 10);

  const posts = mockPosts.get(numericUserId) || [];

  res.status(200).json({
    status: "success",
    routeType: "Nested Sub-Collection Route (/users/:userId/posts)",
    parentUserId: userId,
    count: posts.length,
    data: posts
  });
}

/**
 * GET /api/v1/users/:userId/posts/:postId (Nested Route: Child Entity Lookup)
 */
export function getSinglePostByUser(req, res) {
  const { userId, postId } = req.params;
  const numericUserId = parseInt(userId, 10);
  const numericPostId = parseInt(postId, 10);

  const userPosts = mockPosts.get(numericUserId) || [];
  const post = userPosts.find((p) => p.id === numericPostId);

  if (!post) {
    return res.status(404).json({
      error: {
        code: "POST_NOT_FOUND",
        message: `Post ${postId} for User ${userId} was not found`,
        status: 404
      }
    });
  }

  res.status(200).json({
    status: "success",
    routeType: "Nested Child Entity Route (/users/:userId/posts/:postId)",
    extractedParams: { userId, postId },
    data: post
  });
}
