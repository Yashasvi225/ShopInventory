import { useState } from 'react';
import { api, json } from '../api';
import { date, money, today, productAttribute } from '../config';
import { useResource } from '../hooks/useResource';
import { useSalesHistory } from '../hooks/useSalesHistory';
import { usePagination } from '../hooks/usePagination';
import { useSubmission } from '../hooks/useSubmission';
import { sortSales, summarizeSales } from '../utils/salesView';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import Icon from '../components/Icon';
import SalesDateFilter from '../components/SalesDateFilter';
import { ErrorMessage, Field, PageHeading, Pagination, StockBadge, SummaryCards, Table, TablePanel } from '../components/UI';

function SaleForm({ products, onClose, onSaved }) {
  const [form, setForm] = useState({ product: '', quantity: '', date: today() });
  const { saving, begin, end } = useSubmission();
  const [error, setError] = useState('');
  const toast = useToast();
  const product = products.find(item => item._id === form.product);
  const change = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));
  const total = product && form.quantity !== '' ? +form.quantity * product.sellingPrice : null;
  async function submit(event) {
    event.preventDefault();
    if (!product) { setError('Select a product'); return; }
    if (!begin()) return; setError('');
    try {
      await api('/sales', json('POST', { product: product._id, quantity: +form.quantity, sellingPrice: product.sellingPrice, date: form.date }));
      toast('Sale recorded'); await onSaved(); onClose();
    } catch (failure) { setError(failure.message); toast(failure.message, { tone: 'error' }); }
    finally { end(); }
  }
  return <form className="sale-form" onSubmit={submit} aria-busy={saving}>
    <p className="form-intro">Recording a sale deducts stock and creates the existing stock-out transaction.</p>
    <ErrorMessage message={error} /><fieldset disabled={saving}>
      <Field label="Product" name="product" as="select" required validate value={form.product} onChange={change}>
        <option value="">Select product</option>{products.map(item => <option key={item._id} value={item._id}>{item.name} · {item.sku}</option>)}
      </Field>
      <div className="sale-availability" aria-live="polite">{product ? <>
        <div><span className="muted">Available stock</span><strong>{product.quantity} units</strong></div><StockBadge product={product} />
        <p>{product.shopType === 'CLOTHING' ? 'Fashion: ' + productAttribute(product) : product.expiryDate ? 'Expiry: ' + date(product.expiryDate) : 'No expiry date recorded.'}</p>
      </> : <p>Select a product to check availability and its current selling price.</p>}</div>
      <div className="row">
        <Field label="Quantity" name="quantity" type="number" min={1} step={1} required validate value={form.quantity} onChange={change} hint="The server checks stock availability before recording the sale." />
        <Field label="Price" type="number" min={0} step="any" required readOnly value={product?.sellingPrice ?? ''} hint="Current selling price per unit (₹)." />
        <Field label="Total" readOnly value={total == null ? '—' : money(total)} hint="Sale value based on the selected quantity." />
        <Field label="Date" name="date" type="date" required validate value={form.date} onChange={change} hint="Transaction date stored by the existing sales system." />
      </div><button className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Save Sale'}</button>
    </fieldset></form>;
}
export default function Sales() {
  const history = useSalesHistory();
  const products = useResource(() => api('/products'), []);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [open, setOpen] = useState(false);
  const rows = sortSales(history.data.filter(sale => ((sale.product?.name || 'Deleted product') + ' ' + (sale.product?.sku || '')).toLowerCase().includes(search.trim().toLowerCase())), sort);
  const pagination = usePagination(rows);
  const totals = summarizeSales(rows);
  const visibleTotals = !history.loading && !history.error;
  async function saved() { await Promise.all([history.reload(), products.reload()]); }
  return <div className="sales-page"><PageHeading title="Sales" description="Record sales with confidence. Review recorded revenue and stock movement.">
    <button className="btn primary" disabled={products.loading || !!products.error} onClick={() => setOpen(true)}><Icon name="plus" />Record Sale</button>
  </PageHeading>
    {products.error && <div className="inline-resource-error"><ErrorMessage message={products.error} /><button className="btn small" onClick={products.reload}>Retry products</button></div>}
    <SummaryCards className="page-summary supplier-summary" items={[
      ['Recorded revenue', visibleTotals ? money(totals.revenue) : null], ['Units sold', visibleTotals ? totals.units : null], ['Transactions', visibleTotals ? totals.transactions : null],
    ]} />
    <TablePanel title="Sales history" className="sales-history-panel">
      <p className="panel-description">Summary cards reflect the dates and search below. Recording a new sale also refreshes product availability.</p>
      <SalesDateFilter range={history.range} loading={history.loading} onChange={range => { pagination.reset(); history.setRange(range); }} />
      <div className="toolbar"><input aria-label="Search sales" placeholder="Search product or SKU" value={search} onChange={event => { setSearch(event.target.value); pagination.reset(); }} />
        <select aria-label="Sort sales" value={sort} onChange={event => { setSort(event.target.value); pagination.reset(); }}>
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="total-desc">Highest sale value</option><option value="quantity-desc">Most units sold</option><option value="product">Product A–Z</option>
        </select>{search && <button className="btn small" onClick={() => { setSearch(''); pagination.reset(); }}>Clear search</button>}
      </div>
      <Table headings={['Product', 'Quantity', 'Price', 'Total', 'Date']} loading={history.loading} error={history.error} onRetry={history.reload} empty={!rows.length} emptyMessage="No sales found.">
        {pagination.rows.map(sale => <tr key={sale._id}><td><span className="record-name">{sale.product?.name || 'Deleted product'}</span>{sale.product?.sku && <span className="sku-text">{sale.product.sku}</span>}</td>
          <td className="numeric-cell">{sale.quantity}</td><td className="numeric-cell">{sale.sellingPrice == null ? '—' : money(sale.sellingPrice)}</td><td className="numeric-cell"><strong>{money(sale.totalAmount)}</strong></td><td>{sale.date ? date(sale.date) : 'Not recorded'}</td></tr>)}
      </Table><Pagination pagination={pagination} label="sales" loading={history.loading} error={history.error} />
    </TablePanel>{open && <Modal title="Record Sale" onClose={() => setOpen(false)}><SaleForm products={products.data} onSaved={saved} onClose={() => setOpen(false)} /></Modal>}
  </div>;
}
