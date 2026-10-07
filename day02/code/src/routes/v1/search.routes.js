import express from "express";
import { searchCatalog } from "../../controllers/search.controller.js";

const router = express.Router();

// Route: /api/v1/search?query=val&category=backend&page=1&limit=10
router.get("/", searchCatalog);

export default router;
