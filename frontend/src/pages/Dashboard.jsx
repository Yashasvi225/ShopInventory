import { Link } from 'react-router-dom';
import { api } from '../api';
import { date, money, usesExpiry } from '../config';
import { useResource } from '../hooks/useResource';
import { useSession } from '../session';
import { formatSalesDay, salesByDay, summarizeStock } from '../utils/inventoryView';
import Chart from '../components/Chart';
import Icon from '../components/Icon';
import ExpiryAlerts from '../components/ExpiryAlerts';
import { ErrorMessage, PageHeading, ResourceState, StockBadge, SummaryCards, Table, TablePanel } from '../components/UI';

export default function Dashboard() {
  const { shopType, shopLabel, user, activeStore } = useSession();
  const { data, loading, error, reload } = useResource(() => api('/reports/dashboard'), null);
  const inventory = useResource(() => api('/reports/inventory'), null);
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0); from.setUTCDate(from.getUTCDate() - 29);
  const now = new Date();
  const sales = useResource(() => api(`/sales?from=${from.toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}&limit=500`), []);
  const recentSales = data?.recentSales || [];
  const movements = data?.recentTransactions || [];
  const products = inventory.data?.products || [];
  const stock = summarizeStock(products);
  const attention = products.filter(product => product.quantity <= product.minimumStock).sort((a, b) => a.quantity - b.quantity);
  const history = salesByDay(sales.data, from, now);
  const ready = Boolean(data && !loading && !error);
  const refresh = () => { reload(); inventory.reload(); sales.reload(); };

  return <div className="dashboard-page">
    <PageHeading title="Dashboard" description="Stock, sales, and the priorities for your store.">
      <button className="btn secondary" onClick={refresh} disabled={loading || inventory.loading || sales.loading}>Refresh overview</button>
      <Link className="btn primary" to="/products"><Icon name="plus" />Add Product</Link>
    </PageHeading>
    <section className="welcome-banner">
      <div><p className="eyebrow">{activeStore?.name || shopLabel}</p><h2>Welcome back, {user?.name || 'shop owner'}.</h2>
        <p>Keep your {shopLabel.toLowerCase()} running with a clear view of real stock and recorded sales.</p></div>
      <span className="welcome-store"><Icon name="store" />{shopLabel}</span>
    </section>
    {loading && <p className="muted" role="status">Loading dashboard...</p>}
    <ErrorMessage message={error} />{error && <button className="btn secondary section-spaced" onClick={reload}>Try dashboard again</button>}
    <SummaryCards className="page-summary" items={[
      ['Total Products', ready ? data.totalProducts : null], ['Total Stock', ready ? data.totalStock : null],
      ['Inventory Value', ready ? money(data.totalInventoryValue) : null], ["Today's Sales", ready ? money(data.todaySales) : null],
      ['Monthly Sales', ready ? money(data.monthlySales) : null], ['Low Stock', ready ? data.lowStockCount : null],
      ['Out of Stock', ready ? data.outOfStockCount : null], ...(usesExpiry(shopType) ? [['Expiring', ready ? data.expiringCount : null]] : []),
    ]} />

    <div className="dashboard-analytics">
      <section className="panel card"><div className="panel-heading"><h2>Sales Chart</h2><span className="period-label">Last 30 UTC days</span></div>
        <p className="panel-description">Daily totals from recorded sales. Up to 500 latest sales in this period are included; unrecorded dates are not filled in.</p>
        <ResourceState loading={sales.loading} error={sales.error} onRetry={sales.reload} empty={!history.length} emptyMessage="No recorded sales in this period.">
          <Chart type="line" label="Recent sales totals" valueFormat="money" xTitle="Recorded day (UTC)" yTitle="Revenue (₹)" data={{ labels: history.map(([day]) => formatSalesDay(day)), datasets: [{ label: 'Recorded sales', data: history.map(([, total]) => total), borderColor: '#c15b3a', backgroundColor: '#c15b3a20', fill: true, tension: .25 }] }} />
        </ResourceState>
        <Link className="text-link" to="/reports">View sales reports</Link>
      </section>
      <section className="panel card"><div className="panel-heading"><h2>Stock health</h2><Link className="text-link" to="/inventory">View inventory</Link></div>
        <p className="panel-description">Products grouped by their actual minimum-stock thresholds.</p>
        <ResourceState loading={inventory.loading} error={inventory.error} onRetry={inventory.reload} empty={!products.length} emptyMessage="Add products to see your stock overview.">
          <Chart type="doughnut" label="Current product stock health" data={{ labels: ['In Stock', 'Low Stock', 'Out of Stock'], datasets: [{ data: [stock.healthy, stock.low, stock.out], backgroundColor: ['#7a7c52', '#c15b3a', '#9c3b30'] }] }} />
        </ResourceState>
      </section>
    </div>

    <div className="dashboard-detail-grid">
      <section className="panel card"><div className="panel-heading"><h2>Stock to review</h2><Link className="text-link" to="/products?stock=warn">Review low stock</Link></div>
        <p className="panel-description">Items at or below their minimum, including those out of stock.</p>
        <ResourceState loading={inventory.loading} error={inventory.error} onRetry={inventory.reload} empty={!attention.length} emptyMessage="No products need a stock review.">
          <ul className="attention-list">{attention.slice(0, 4).map(product => <li key={product._id}><div><span className="record-name">{product.name}</span><small>{product.quantity} available · Minimum {product.minimumStock}</small></div><StockBadge product={product} /></li>)}</ul>
        </ResourceState>
        <div className="priority-links"><Link className="text-link" to="/products?stock=out">View out-of-stock products</Link><Link className="text-link" to="/inventory">Record a stock movement</Link></div>
      </section>
      <section className="panel card"><div className="panel-heading"><h2>{usesExpiry(shopType) ? 'Expiry overview' : 'Clothing organization'}</h2><Icon name={usesExpiry(shopType) ? 'clock' : 'products'} /></div>
        {usesExpiry(shopType) ? <>
          <p className="priority-number">{ready ? data.expiringCount : '—'}<span>products expiring within 30 days</span></p>
          <p className="panel-description">Detailed warnings below cover the next two UTC calendar days. Dates are optional; items without an expiry date are excluded.</p>
          <a className="btn secondary" href="#expiry-warnings-heading">View expiry warnings</a>
        </> : <>
          <p className="panel-description">Keep Old Fashion and New Fashion stock organized with the classifications already on your products.</p>
          <div className="priority-links"><Link className="btn secondary" to="/products?fashion=OLD_FASHION">Old Fashion products</Link><Link className="btn secondary" to="/products?fashion=NEW_FASHION">New Fashion products</Link></div>
        </>}
      </section>
    </div>

    <div className="dashboard-detail-grid">
      <TablePanel title="Recent Sales"><p className="panel-description">The latest recorded sales for your store.</p>
        <Table headings={['Product', 'Qty', 'Total', 'Date']} loading={loading} error={error} onRetry={reload} empty={!recentSales.length} emptyMessage="No sales yet.">
          {recentSales.map(sale => <tr key={sale._id}><td>{sale.product?.name || 'Deleted product'}</td><td>{sale.quantity}</td><td>{money(sale.totalAmount)}</td><td>{date(sale.date)}</td></tr>)}
        </Table><Link className="text-link" to="/sales">View all sales</Link>
      </TablePanel>
      <section className="panel card"><div className="panel-heading"><h2>Recent Stock Activity</h2><Link className="text-link" to="/inventory">View movements</Link></div>
        <ResourceState loading={loading} error={error} onRetry={reload} empty={!movements.length} emptyMessage="No stock activity yet.">
          <ul className="activity-list">{movements.map(transaction => <li key={transaction._id}><span className={`activity-icon ${transaction.type === 'STOCK_IN' ? 'incoming' : 'outgoing'}`}><Icon name={transaction.type === 'STOCK_IN' ? 'plus' : 'minus'} /></span>
            <div><span className="record-name">{transaction.product?.name || 'Deleted product'}</span><small>{transaction.type === 'STOCK_IN' ? 'Stock IN' : 'Stock OUT'} · {transaction.quantity} units · {date(transaction.date)}</small></div>
          </li>)}</ul>
        </ResourceState>
      </section>
    </div>
    {usesExpiry(shopType) && <ExpiryAlerts />}
  </div>;
}
