require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const aiRoutes = require("./routes/aiRoutes");
const productRoutes = require("./routes/productRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const saleRoutes = require("./routes/saleRoutes");
const reportRoutes = require("./routes/reportRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
  console.error(
    "MONGO_URI and JWT_SECRET are required. Copy .env.example to .env and configure them.",
  );
  process.exit(1);
}
const app = express();
const origins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);
app.disable("x-powered-by");
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.path.startsWith("/api/") && req.path !== "/api/health")
    res.setHeader("Cache-Control", "no-store");
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    if (req.body === undefined) req.body = {};
    if (!req.body || Array.isArray(req.body) || typeof req.body !== "object")
      return res
        .status(400)
        .json({ message: "Request body must be a JSON object" });
  }
  next();
});
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", service: "Shop Inventory Manager API" }),
);
app.use("/api/stores", require("./routes/storeRoutes"));
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/ai", aiRoutes);
app.use(notFound);
app.use(errorHandler);
const ExpiryAlert = require("./models/ExpiryAlert");
const { startExpiryScanner } = require("./services/expiryAlertService");
function mongooseClient() {
  return require("mongoose").connection.getClient();
}
const PORT = process.env.PORT || 5000;
connectDB()
  .then(async () => {
    // The unique event index must exist before any scan or request can insert.
    await ExpiryAlert.init();
    await require("./models/Store").init();
    await require("./migrations/stores").assertReady(mongooseClient());
    const server = app.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`);
      const stop = startExpiryScanner();
      server.on("close", stop);
    });
  })
  .catch((err) => {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  });
