/**
 * GET /api/v2/products (Version 2 API endpoint with updated schema)
 */
export function getV2Products(req, res) {
  res.status(200).json({
    status: "success",
    apiVersion: "v2 (Current Active Version)",
    schemaChanges: "Price transformed into structured currency object",
    data: [
      {
        id: 1,
        title: "Mechanical Keyboard Pro",
        price: { amount: 149.99, currency: "USD" },
        inStock: true
      },
      {
        id: 2,
        title: "UltraWide 34-inch Monitor",
        price: { amount: 699.00, currency: "USD" },
        inStock: false
      }
    ]
  });
}
