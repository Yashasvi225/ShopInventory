import { stockStatus } from '../config';

// Labels must use the same UTC day as the sales buckets, including in western timezones.
const salesDayFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const formatSalesDay = day => salesDayFormat.format(new Date(day));

// View summaries reuse the application's existing threshold classification.
export function summarizeStock(products) {
  const counts = { healthy: 0, low: 0, out: 0, units: 0 };
  for (const product of products) {
    const status = stockStatus(product)[1];
    counts[status === 'ok' ? 'healthy' : status === 'warn' ? 'low' : 'out']++;
    counts.units += product.quantity;
  }
  return counts;
}

// Aggregate only actual dated sales in the stated UTC window. Missing days are not fabricated.
export function salesByDay(sales, from, through) {
  const totals = new Map();
  for (const sale of sales) {
    if (!sale.date) continue;
    const time = Date.parse(sale.date);
    if (!Number.isFinite(time) || time < from.getTime() || time > through.getTime()) continue;
    const day = new Date(time).toISOString().slice(0, 10);
    totals.set(day, (totals.get(day) || 0) + sale.totalAmount);
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b));
}
