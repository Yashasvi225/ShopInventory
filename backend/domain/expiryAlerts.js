const DAY_MS = 86_400_000;
const EXPIRY_STORES = ["MEDICAL", "RESTAURANT", "GROCERY"];
const LOOKBACK_DAYS = 30;
const PLANNING_DAYS = 7;

function utcDay(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : null;
}

// Product forms persist date-only ISO values as UTC midnight. Compare calendar
// days, including all of today, without depending on the server's timezone.
function expiryEvent(product, now = new Date()) {
  if (!EXPIRY_STORES.includes(product.shopType)) return null;
  const expiryDay = utcDay(product.expiryDate);
  const today = utcDay(now);
  if (!expiryDay || !today) return null;
  const daysRemaining = (Date.parse(expiryDay) - Date.parse(today)) / DAY_MS;
  return daysRemaining >= 0 && daysRemaining <= 2
    ? { expiryDay, daysRemaining }
    : null;
}

function salesWindow(now = new Date()) {
  return new Date(Date.parse(utcDay(now)) - (LOOKBACK_DAYS - 1) * DAY_MS);
}

function salesBasis(product, sales, now = new Date()) {
  const since = salesWindow(now);
  const owner = String(product.createdBy);
  const productId = String(product._id);
  // Defence in depth: callers also scope the database query by owner/product.
  const valid = sales.filter(
    (sale) =>
      String(sale.createdBy) === owner &&
      String(sale.product) === productId &&
      new Date(sale.date) >= since &&
      new Date(sale.date) <= now &&
      Number.isFinite(sale.quantity) &&
      sale.quantity > 0,
  );
  const unitsSold = valid.reduce((sum, sale) => sum + sale.quantity, 0);
  const saleDays = new Set(valid.map((sale) => utcDay(sale.date))).size;
  // Backdated sales are supported by the existing API. The earliest observed
  // sale may therefore predate product creation; do not discard that evidence.
  const firstObserved = valid.reduce(
    (earliest, sale) => Math.min(earliest, new Date(sale.date).getTime()),
    new Date(product.createdAt || since).getTime(),
  );
  const start = new Date(
    Math.max(since.getTime(), Date.parse(utcDay(firstObserved))),
  );
  const observationDays = Math.max(
    1,
    Math.min(
      LOOKBACK_DAYS,
      (Date.parse(utcDay(now)) - start.getTime()) / DAY_MS + 1,
    ),
  );
  const daily = unitsSold / observationDays;
  const confidence = !valid.length
    ? "NO_DATA"
    : observationDays >= 7 && saleDays >= 3
      ? "MODERATE"
      : "LIMITED";
  const rawQuantity = Math.ceil(daily * PLANNING_DAYS);
  // Unrepresentable values must never become purchase advice.
  const quantity =
    valid.length && Number.isSafeInteger(rawQuantity) && rawQuantity >= 0
      ? rawQuantity
      : null;
  const event = expiryEvent(product, now);
  return {
    windowStart: start.toISOString(),
    windowEnd: now.toISOString(),
    observationDays,
    unitsSold,
    saleCount: valid.length,
    saleDays,
    averageDailySales: Number(daily.toFixed(4)),
    planningDays: PLANNING_DAYS,
    confidence,
    suggestedPurchaseQuantity: quantity,
    currentStockAtAnalysis: product.quantity,
    estimatedUnsoldAtExpiry: event
      ? Math.max(
          0,
          Number(
            (product.quantity - daily * (event.daysRemaining + 1)).toFixed(2),
          ),
        )
      : null,
    limitation: !valid.length
      ? "No recorded sales in the observation window; no purchase quantity can be estimated."
      : confidence === "LIMITED"
        ? "Limited history: fewer than seven observation days or three distinct sale days. Recorded sales may not represent demand."
        : "Recorded sales only; stockouts, supplier lead time and replacement shelf life are unknown. This is not a statistical confidence estimate.",
  };
}

function basisExplanation(basis) {
  return (
    `${basis.unitsSold} units recorded over ${basis.observationDays} calendar day(s), across ${basis.saleDays} sale day(s). ` +
    (basis.suggestedPurchaseQuantity == null
      ? "No reliable numerical estimate is available."
      : `Seven-day replacement estimate: ceil(units sold / observation days × 7) = ${basis.suggestedPurchaseQuantity}. ` +
        "This plans stock after the current batch expires; expiring stock is not counted as usable afterwards.")
  );
}

module.exports = {
  EXPIRY_STORES,
  expiryEvent,
  utcDay,
  salesWindow,
  salesBasis,
  basisExplanation,
};
