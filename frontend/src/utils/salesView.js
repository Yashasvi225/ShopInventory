export function summarizeSales(sales) {
  return sales.reduce((summary, sale) => ({ transactions: summary.transactions + 1,
    revenue: summary.revenue + sale.totalAmount, units: summary.units + sale.quantity }), { transactions: 0, revenue: 0, units: 0 });
}
export function productPerformance(sales) {
  const grouped = new Map();
  for (const sale of sales) {
    // Deleted references can no longer be attributed to an individual product.
    const key = sale.product?._id || 'deleted-products';
    const row = grouped.get(key) || { id: key, name: sale.product?.name || 'Deleted products (combined)', sku: sale.product?.sku,
      quantity: 0, revenue: 0, transactions: 0 };
    row.quantity += sale.quantity; row.revenue += sale.totalAmount; row.transactions++;
    grouped.set(key, row);
  }
  return [...grouped.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
}
export function sortSales(rows, sort) {
  return [...rows].sort((a, b) => {
    if (sort === 'total-desc') return b.totalAmount - a.totalAmount;
    if (sort === 'quantity-desc') return b.quantity - a.quantity;
    if (sort === 'product') return (a.product?.name || 'Deleted product').localeCompare(b.product?.name || 'Deleted product');
    const time = sale => sale.date ? new Date(sale.date).getTime() : 0;
    return sort === 'oldest' ? time(a) - time(b) : time(b) - time(a);
  });
}
