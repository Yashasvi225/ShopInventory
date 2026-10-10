const { SHOP_TYPES } = require("../domain/storeTypes");
const { utcDay } = require("../domain/expiryAlerts");
const DAY_MS = 86_400_000;

const DEFAULT_NAMESPACE = "local";
const PRESENTATION_NAMESPACE = "presentation";
const VERSION = 1;
const names = {
  MEDICAL: [
    "Paracetamol Tablets",
    "Cough Syrup",
    "Antacid Tablets",
    "Vitamin Supplements",
    "Bandages",
    "Antiseptic Solution",
    "Oral Rehydration Salts",
    "Digital Thermometers",
    "Cotton Rolls",
    "Disposable Gloves",
    "Saline Nasal Spray",
    "Expired First Aid Ointment",
  ],
  RESTAURANT: [
    "Milk",
    "Vegetables",
    "Cheese",
    "Bread",
    "Fresh Sauce",
    "Yogurt",
    "Rice",
    "Wheat Flour",
    "Spices",
    "Cooking Oil",
    "Tomato Sauce",
    "Expired Cream",
  ],
  GROCERY: [
    "Milk",
    "Packaged Snacks",
    "Juice",
    "Biscuits",
    "Fresh Paneer",
    "Yogurt",
    "Rice",
    "Wheat Flour",
    "Sugar",
    "Detergent",
    "Cooking Oil",
    "Expired Fruit Drink",
  ],
  CLOTHING: [
    "T-shirts",
    "Jeans",
    "Shirts",
    "Dresses",
    "Jackets",
    "Trousers",
    "Polo Shirts",
    "Sweatshirts",
    "Scarves",
    "Formal Shirts",
    "Leggings",
    "Shorts",
  ],
};
const scenarios = [
  ["FAST", 0, 4, 15],
  ["RISING", 1, 6, 10],
  ["STABLE", 2, 18, 8],
  ["SLOW", 1, 40, 5],
  ["NONE", 2, 12, 4],
  ["LIMITED", 2, 15, 4],
  ["FAST", 30, 3, 12],
  ["STABLE", 60, 160, 10],
  ["SLOW", 90, 35, 4],
  ["NONE", null, 20, 0],
  ["RISING", 120, 8, 5],
  ["STABLE", -1, 10, 3],
];
const categories = {
  MEDICAL: [
    "Tablets",
    "Syrups",
    "Tablets",
    "Capsules",
    "First Aid",
    "Medical Supplies",
    "Medical Supplies",
    "Medical Supplies",
    "First Aid",
    "Medical Supplies",
    "Medical Supplies",
    "First Aid",
  ],
  GROCERY: [
    "Beverages",
    "Food Products",
    "Beverages",
    "Food Products",
    "Food Products",
    "Food Products",
    "Food Products",
    "Food Products",
    "Food Products",
    "Household Products",
    "Food Products",
    "Beverages",
  ],
};

function datasetKey(namespace) {
  if (!/^[a-z][a-z0-9-]{0,49}$/.test(namespace))
    throw new Error("Invalid demo namespace");
  return `sim-p2-demo-v${VERSION}:${namespace}`;
}
function identity(shopType, namespace = DEFAULT_NAMESPACE) {
  datasetKey(namespace);
  if (!SHOP_TYPES.includes(shopType))
    throw new Error("Invalid demo store type");
  if (namespace === PRESENTATION_NAMESPACE) {
    const label = {
      MEDICAL: "Medical Store",
      RESTAURANT: "Restaurant",
      GROCERY: "Grocery Store",
      CLOTHING: "Clothing Store",
    }[shopType];
    return {
      shopType,
      email: `demo.${shopType.toLowerCase()}@example.com`,
      name: `[DEMO] ${label} Owner`,
      shopName: `[DEMO] ${label}`,
    };
  }
  return {
    shopType,
    email: `sim-demo-${namespace}-${shopType.toLowerCase()}@example.invalid`,
    name: `[DEMO ${namespace}] ${shopType} Retailer`,
    shopName: `[DEMO] ${shopType} Shop`,
  };
}
function dateAt(offset, now) {
  return new Date(Date.parse(utcDay(now)) + offset * DAY_MS);
}
function quantityAt(pattern, offset) {
  if (pattern === "FAST") return 8;
  if (pattern === "STABLE") return 3;
  if (pattern === "RISING") return offset >= -6 ? 6 : offset >= -13 ? 2 : 1;
  if (pattern === "SLOW") return [-24, -12, -4].includes(offset) ? 1 : 0;
  if (pattern === "LIMITED") return offset === -1 ? 2 : 0;
  return 0;
}
function buildStore(shopType, now = new Date()) {
  if (!SHOP_TYPES.includes(shopType) || !utcDay(now))
    throw new Error("Invalid demo store/date");
  return names[shopType].map((name, index) => {
    const [pattern, expiryOffset, remaining, minimumStock] = scenarios[index];
    const clothing = shopType === "CLOTHING";
    const expiryDate =
      clothing || expiryOffset == null ? null : dateAt(expiryOffset, now);
    const sales = [];
    for (let offset = -29; offset <= 0; offset++) {
      const date = dateAt(offset, now),
        quantity = quantityAt(pattern, offset);
      // Historical sales must precede the batch's expiry, including UTC midnight.
      if (quantity && (!expiryDate || date < expiryDate))
        sales.push({ date, quantity });
    }
    const sellingPrice = clothing
      ? 499 + index * 50
      : shopType === "MEDICAL"
        ? 30 + index * 15
        : 40 + index * 10;
    return {
      name: `[DEMO] ${name}`,
      sku: `DEMO-${shopType}-${String(index + 1).padStart(2, "0")}`,
      category:
        categories[shopType]?.[index] ||
        (clothing ? "Clothing" : "Ingredients"),
      description: `DEMO only. Sales pattern: ${pattern}. ${clothing ? `Variant: size ${["S", "M", "L"][index % 3]}, ${["navy", "black", "cream"][index % 3]}. ` : ""}Synthetic history for the existing application calculations.`,
      purchasePrice: Math.round(sellingPrice * 0.65),
      sellingPrice,
      quantity: clothing && index === 11 ? 0 : remaining,
      minimumStock,
      expiryDate,
      fashionType: clothing
        ? index % 2
          ? "NEW_FASHION"
          : "OLD_FASHION"
        : null,
      shopType,
      createdAt: dateAt(-30, now),
      sales,
      pattern,
      supplierIndex: index % 3,
      openingDate: dateAt(-30, now),
    };
  });
}
module.exports = {
  DEFAULT_NAMESPACE,
  PRESENTATION_NAMESPACE,
  VERSION,
  datasetKey,
  identity,
  buildStore,
};
