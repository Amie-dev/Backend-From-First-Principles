import express from "express";
import userRouter from "./user.routes.js";
import searchRouter from "./search.routes.js";

const v1Router = express.Router();

// Middleware adding Sunset & Deprecation headers to all V1 endpoints
v1Router.use((req, res, next) => {
  res.setHeader("Deprecation", "true");
  res.setHeader("Sunset", "Wed, 11 Nov 2026 00:00:00 GMT");
  res.setHeader("Link", '<https://api.example.com/docs/v2-migration>; rel="deprecation"');
  next();
});

// Mount V1 Sub-Routers
v1Router.use("/users", userRouter);
v1Router.use("/search", searchRouter);

export default v1Router;
