1. What is Routing?
Routing expresses the "where" of a request, indicating which resource or location on the server an action or intent is directed towards (0:35). It maps URL paths and HTTP methods (like GET, POST, PUT, DELETE) to specific server-side logic or handlers (1:31).

For example, a GET request to /users (1:00) with the intent of fetching data will be mapped to a handler that returns an array of users. The combination of the HTTP method (your "what") and the route path (your "where") forms a unique key that the server uses to direct the request to the appropriate set of instructions (4:01).

2. Static Routes
Static routes are defined by a fixed, unchanging URL path (4:40). They do not contain any variable parameters within the route itself (4:47).

For instance, /api/books for a GET or POST request is considered a static route (4:35). The path /api/books will always remain constant, and it typically returns a consistent type of response (5:09).

3. Dynamic Routes and Path Parameters
Dynamic routes incorporate variable parameters directly within the URL path (5:23). These variables allow for fetching or performing actions on specific resources based on an identifier.

Path Parameters: These are dynamic values that are part of the URL path, often coming directly after a forward slash (8:48). They semantically express what specific entity or resource the request is about (11:04).
Example: /api/users/123 (5:35) where 123 is a path parameter representing the user's ID. The server can extract this ID to fetch details of that particular user (5:52).
Conventionally, dynamic parts in the route matching are often denoted with a colon, e.g., /api/users/:ID (6:49), signifying that any string in that position should be treated as a dynamic parameter (7:07).
4. Query Parameters
Query parameters are used to send additional, non-semantic key-value pairs with a request, typically for filtering, sorting, or pagination, especially with GET requests which do not have a request body (10:15).

They are appended to the URL after a question mark ? (10:18).
Example: /api/search?query=some+value (9:37) where query is the key and some+value is the value.
Application in GET requests: Since GET requests don't have a body to send data, query parameters provide a mechanism to pass user-defined values or metadata to the server (10:47).
Useful for pagination, e.g., /api/books?page=2 (14:20), to request a specific page of data, or for filtering and sorting results (14:46).
5. Nested Routes
Nested routes involve embedding different resource identifiers within a single URL path to express complex semantic relationships (15:09). This practice is common in REST APIs for better organization and readability.

Example: /api/users/123/posts/456 (18:00)
api/users is a static part (16:35).
123 is a dynamic path parameter for a user ID (16:08).
posts is a static part representing a collection of posts (17:30).
456 is a dynamic path parameter for a specific post ID (18:11).
This structure allows for semantically clear requests, such as "fetch post with ID 456 belonging to user with ID 123" (18:15). Each level of nesting can correspond to a different handler and return different granular information (16:45).
6. Route Versioning and Deprecation
Route versioning is a common practice to manage changes in API endpoints over time without breaking existing client applications (19:26).

Versions are typically included in the URL path, e.g., /api/v1/products and /api/v2/products (19:13).
Allows for introducing breaking changes (e.g., changes in response format or field names) in new versions (v2) while maintaining older versions (v1) for existing clients (20:25).
This provides a migration window for front-end engineers to update their applications to the new API structure (21:42). Eventually, older versions can be deprecated and removed (21:27).
7. Catch-All Routes
A catch-all route is a fallback mechanism on the server that handles requests for routes that do not have a specific handler defined (22:18).

Typically represented by a wildcard, such as /* (23:00).
If a request doesn't match any specific route, it is directed to the catch-all handler (23:07).
This handler usually sends a user-friendly message, such as "route not found" or "this route does not exist" (23:13), instead of a default null response, improving the user experience (23:26).