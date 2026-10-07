import express from "express";
import { getV2Products } from "../../controllers/product.controller.js";

const v2Router = express.Router();

// Route: /api/v2/products
v2Router.get("/products", getV2Products);

export default v2Router;
