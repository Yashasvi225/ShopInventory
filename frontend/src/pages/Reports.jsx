import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { date, money, today, usesExpiry } from '../config';
import { useSession } from '../session';
import { useResource } from '../hooks/useResource';
import { useSalesHistory } from '../hooks/useSalesHistory';
import { usePagination } from '../hooks/usePagination';
import { salesByDay, summarizeStock } from '../utils/inventoryView';
import { productPerformance, summarizeSales } from '../utils/salesView';
import Chart from '../components/Chart';
import SalesDateFilter from '../components/SalesDateFilter';
import { PageHeading, Pagination, ResourceState, StockBadge, SummaryCards, Table, TablePanel } from '../components/UI';

function recentRange() {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - 29);
  return { from: start.toISOString().slice(0, 10), to: today() };
}
export default function Reports() {
  const { shopType } = useSession();
  const showExpiry = usesExpiry(shopType);
  const overview = useResource(() => Promise.all(['daily', 'weekly', 'monthly', 'inventory', 'low-stock', 'expiry'].map(path => api('/reports/' + path))), null);
  const [defaultRange] = useState(recentRange);
  const history = useSalesHistory(defaultRange);
  const [daily, weekly, monthly, inventory, lowStock = [], expiry] = overview.data || [];
  const expiryRows = expiry ? [...expiry.expired.map(product => ({ ...product, status: 'Expired' })), ...expiry.expiringSoon.map(product => ({ ...product, status: 'Expiring soon' }))] : [];
  const stock = summarizeStock(inventory?.products || []);
  const performance = productPerformance(history.data);
  const pagination = usePagination(performance);
  const totals = summarizeSales(history.data);
  const dayTotals = salesByDay(history.data, new Date('1970-01-01'), new Date('9999-12-31'));
  const showTotals = !history.loading && !history.error;
  const overviewReady = overview.data && !overview.loading && !overview.error;
  return <div className="reports-page">
    <PageHeading title="Reports" description="A clear view of recorded sales, current stock, and products that need attention.">
      <Link className="btn secondary" to="/sales">Review sales</Link>
    </PageHeading>
    <p className="report-scope">Calendar-to-date overview · UTC today, Monday to today, and month to date. These summaries are independent of the history filters below.</p>
    <SummaryCards reports items={[
      ['Daily Sales', overviewReady ? money(daily.totalSales) : null], ['Weekly Sales', overviewReady ? money(weekly.totalSales) : null],
      ['Monthly Sales', overviewReady ? money(monthly.totalSales) : null], ['Inventory units', overviewReady ? inventory.totalStock : null],
      ['Low Stock', overviewReady ? lowStock.length : null], ...(showExpiry ? [['Expiry Alerts', overviewReady ? expiryRows.length : null]] : []),
    ]} />
    <div className="grid report-overview">
      <section className="panel card"><h2>Sales at a glance</h2>
        <p className="panel-description">Actual revenue for overlapping calendar periods; these bars are summaries, not a historical trend.</p>
        <ResourceState loading={overview.loading} error={overview.error} onRetry={overview.reload}>
          {overview.data && <Chart type="bar" label="Daily, weekly and monthly sales" valueFormat="money" xTitle="Calendar period" yTitle="Revenue (₹)"
            data={{ labels: ['Today', 'This week', 'This month'], datasets: [{ label: 'Recorded revenue', data: [daily.totalSales, weekly.totalSales, monthly.totalSales], backgroundColor: '#c15b3a', borderRadius: 6, maxBarThickness: 64 }] }} />}
        </ResourceState>
      </section>
      <section className="panel card"><h2>Current stock health</h2>
        <p className="panel-description">Product counts use each product's saved minimum stock threshold.</p>
        <ResourceState loading={overview.loading} error={overview.error} onRetry={overview.reload} empty={overview.data && !inventory.products.length} emptyMessage="Add products to see stock health.">
          {overview.data && <Chart type="doughnut" label="Healthy, low and out of stock" data={{ labels: ['Healthy', 'Low stock', 'Out of stock'], datasets: [{ data: [stock.healthy, stock.low, stock.out], backgroundColor: ['#7a7c52', '#c15b3a', '#9c3b30'], borderWidth: 3, borderColor: '#fffefb' }] }} />}
        </ResourceState><Link className="text-link" to="/inventory">Manage inventory</Link>
      </section>
    </div>
    <section className="panel card section-spaced historical-sales-panel" aria-labelledby="historical-sales-heading">
      <div className="panel-heading"><h2 id="historical-sales-heading">Historical sales</h2><span className="period-label">Recorded transactions</span></div>
      <SalesDateFilter range={history.range} resetRange={defaultRange} loading={history.loading} onChange={range => { pagination.reset(); history.setRange(range); }} />
      <SummaryCards className="page-summary supplier-summary" items={[
        ['Range revenue', showTotals ? money(totals.revenue) : null], ['Range units sold', showTotals ? totals.units : null], ['Range transactions', showTotals ? totals.transactions : null],
      ]} />
      <ResourceState loading={history.loading} error={history.error} onRetry={history.reload} empty={!dayTotals.length} emptyMessage="No dated sales in this range. Record sales or choose another date range to see a trend.">
        {!!dayTotals.length && <Chart type={dayTotals.length > 1 ? 'line' : 'bar'} label="Historical recorded sales revenue" valueFormat="money" xTitle="Recorded day (UTC)" yTitle="Revenue (₹)"
          data={{ labels: dayTotals.map(([day]) => day), datasets: [{ label: 'Recorded revenue', data: dayTotals.map(([, total]) => total),
            backgroundColor: '#c15b3a20', borderColor: '#c15b3a', borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0, fill: true, maxBarThickness: 64 }] }} />}
      </ResourceState>
      {!!dayTotals.length && !history.loading && !history.error && <p className="chart-note">{dayTotals.length} recorded sale day{dayTotals.length === 1 ? '' : 's'}. Days without returned records are omitted; dates are spaced as categories. {dayTotals.length === 1 ? 'More dated history is needed to show a trend.' : ''} {history.data.some(sale => !sale.date) ? 'Undated transactions contribute to range totals, but cannot be plotted.' : ''}</p>}
    </section>
    <TablePanel title="Product sales performance" className="section-spaced performance-panel">
      <p className="panel-description">Ranked by recorded revenue in the selected history range. Deleted product references are combined and cannot be attributed individually.</p>
      <Table headings={['Product', 'Units sold', 'Transactions', 'Revenue']} loading={history.loading} error={history.error} onRetry={history.reload} empty={!performance.length} emptyMessage="No product sales recorded in this range.">
        {pagination.rows.map(row => <tr key={row.id}><td><span className="record-name">{row.name}</span>{row.sku && <span className="sku-text">{row.sku}</span>}</td><td className="numeric-cell">{row.quantity}</td><td className="numeric-cell">{row.transactions}</td><td className="numeric-cell"><strong>{money(row.revenue)}</strong></td></tr>)}
      </Table><Pagination pagination={pagination} label="products" loading={history.loading} error={history.error} />
    </TablePanel>
    <div className="grid section-spaced">
      <TablePanel title="Low Stock"><p className="panel-description">Includes products at the minimum threshold and products with no stock.</p>
        <Table headings={['Product', 'Qty', 'Minimum', 'Status']} loading={overview.loading} error={overview.error} onRetry={overview.reload} empty={!lowStock.length} emptyMessage="No low-stock products.">
          {lowStock.map(product => <tr key={product._id}><td>{product.name}</td><td className="numeric-cell">{product.quantity}</td><td className="numeric-cell">{product.minimumStock}</td><td><StockBadge product={product} /></td></tr>)}
        </Table><Link className="text-link" to="/inventory">Review stock levels</Link>
      </TablePanel>
      {showExpiry && <TablePanel title="Expiry Alerts"><p className="panel-description">Expired products and products expiring within the next 30 UTC calendar days.</p>
        <Table headings={['Product', 'Expiry', 'Status']} loading={overview.loading} error={overview.error} onRetry={overview.reload} empty={!expiryRows.length} emptyMessage="No expiry alerts.">
          {expiryRows.map(product => <tr key={product._id}><td>{product.name}</td><td>{date(product.expiryDate)}</td><td><span className={'badge ' + (product.status === 'Expired' ? 'out' : 'warn')}>{product.status}</span></td></tr>)}
        </Table><Link className="text-link" to="/ai-recommendations">Review expiry replacement guidance</Link>
      </TablePanel>}
    </div>
  </div>;
}
