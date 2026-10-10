const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const number = (value) => typeof value === "number" && Number.isFinite(value);
const optionalString = (value) => value == null || typeof value === "string";
const optionalNumber = (value) => value == null || number(value);
const optionalDate = (value) =>
  value == null ||
  value === "" ||
  (typeof value === "string" && Number.isFinite(Date.parse(value)));
const record = (value) => object(value) && typeof value._id === "string";
const list = (value, check = record) =>
  Array.isArray(value) && value.every(check);
const namedReference = (value) =>
  value == null ||
  typeof value === "string" ||
  (object(value) &&
    ["_id", "name", "sku", "shopType", "fashionType"].every((key) =>
      optionalString(value[key]),
    ) &&
    optionalDate(value.expiryDate));
const product = (value) =>
  record(value) &&
  typeof value.name === "string" &&
  typeof value.sku === "string" &&
  number(value.quantity) &&
  number(value.minimumStock) &&
  number(value.sellingPrice) &&
  ["category", "description", "shopType", "fashionType"].every((key) =>
    optionalString(value[key]),
  ) &&
  optionalNumber(value.purchasePrice) &&
  optionalDate(value.expiryDate) &&
  namedReference(value.supplier);
const supplier = (value) =>
  record(value) &&
  typeof value.name === "string" &&
  ["company", "phone", "email", "address"].every((key) =>
    optionalString(value[key]),
  );
const sale = (value) =>
  record(value) &&
  number(value.quantity) &&
  number(value.totalAmount) &&
  optionalNumber(value.sellingPrice) &&
  optionalDate(value.date) &&
  namedReference(value.product);
const transaction = (value) =>
  record(value) &&
  number(value.quantity) &&
  typeof value.type === "string" &&
  optionalString(value.reason) &&
  optionalDate(value.date) &&
  namedReference(value.product);
const user = (value) =>
  record(value) &&
  typeof value.name === "string" &&
  typeof value.email === "string" &&
  optionalString(value.shopType) &&
  optionalString(value.shopName);

// Validate the portions of each existing contract that the React views read.
// A successful HTTP status alone does not make a response safe to render.
export function validApiData(path, data, method = "GET") {
  path = path.split("?")[0];
  if (path === "/auth/login" || path === "/auth/register")
    return object(data) && typeof data.token === "string" && user(data.user);
  if (path === "/auth/shop-type") return object(data) && user(data.user);
  if (path === "/stores")
    return (
      object(data) &&
      list(
        data.stores,
        (value) =>
          record(value) &&
          ["MEDICAL", "RESTAURANT", "GROCERY", "CLOTHING"].includes(
            value.shopType,
          ) &&
          typeof value.createdBy === "string" &&
          typeof value.name === "string",
      )
    );
  if (method === "DELETE" || path.endsWith("/dismiss"))
    return object(data) && typeof data.message === "string";
  if (path === "/products" || path.startsWith("/products/"))
    return method === "GET" && path === "/products"
      ? list(data, product)
      : product(data);
  if (path === "/suppliers" || path.startsWith("/suppliers/")) {
    return method === "GET" && path === "/suppliers"
      ? list(data, supplier)
      : supplier(data);
  }
  if (path === "/sales")
    return method === "GET" ? list(data, sale) : sale(data);
  if (path === "/inventory/transactions") return list(data, transaction);
  if (path.startsWith("/inventory/stock-"))
    return (
      object(data) && product(data.product) && transaction(data.transaction)
    );
  if (path === "/reports/dashboard")
    return (
      object(data) &&
      [
        "totalProducts",
        "totalStock",
        "totalInventoryValue",
        "todaySales",
        "monthlySales",
        "lowStockCount",
        "outOfStockCount",
        "expiringCount",
      ].every((key) => number(data[key])) &&
      list(data.recentSales, sale) &&
      list(data.recentTransactions, transaction)
    );
  if (["/reports/daily", "/reports/weekly", "/reports/monthly"].includes(path))
    return (
      object(data) &&
      ["totalSales", "totalTransactions", "unitsSold"].every((key) =>
        number(data[key]),
      )
    );
  if (path === "/reports/inventory")
    return (
      object(data) && number(data.totalStock) && list(data.products, product)
    );
  if (path === "/reports/low-stock") return list(data, product);
  if (path === "/reports/expiry")
    return (
      object(data) &&
      list(data.expired, product) &&
      list(data.expiringSoon, product)
    );
  if (path === "/ai/reorder-suggestions")
    return (
      object(data) &&
      ["GEMINI", "RULE_BASED", "NO_DATA"].includes(data.source) &&
      optionalDate(data.generatedAt) &&
      Array.isArray(data.suggestions) &&
      data.suggestions.every(
        (row) =>
          object(row) &&
          typeof row.productName === "string" &&
          number(row.suggestedReorderQuantity) &&
          typeof row.reason === "string" &&
          optionalNumber(row.currentStock) &&
          optionalNumber(row.averageDailySales) &&
          optionalString(row.urgency),
      )
    );
  if (path === "/ai/expiry-alerts")
    return (
      object(data) &&
      list(
        data.alerts,
        (alert) =>
          record(alert) &&
          typeof alert.productName === "string" &&
          typeof alert.expiryDay === "string" &&
          number(alert.currentStock) &&
          number(alert.daysRemaining) &&
          ["MEDICAL", "RESTAURANT", "GROCERY"].includes(alert.shopType) &&
          ["PENDING", "GENERATING", "READY", "UNAVAILABLE", "NO_DATA"].includes(
            alert.recommendationStatus,
          ) &&
          (alert.recommendation == null ||
            (object(alert.recommendation) &&
              object(alert.recommendation.salesBasis) &&
              typeof alert.recommendation.explanation === "string" &&
              typeof alert.recommendation.salesBasis.limitation === "string" &&
              optionalNumber(alert.recommendation.suggestedPurchaseQuantity) &&
              optionalDate(alert.recommendation.generatedAt) &&
              [
                "unitsSold",
                "observationDays",
                "saleDays",
                "currentStockAtAnalysis",
              ].every((key) => number(alert.recommendation.salesBasis[key])) &&
              optionalNumber(
                alert.recommendation.salesBasis.estimatedUnsoldAtExpiry,
              ) &&
              optionalString(alert.recommendation.salesBasis.confidence))),
      )
    );
  return object(data) || Array.isArray(data);
}
