import { useState } from 'react';
import { api, json } from '../api';
import { date, today, productAttribute, stockStatus } from '../config';
import { useSession } from '../session';
import { useResource } from '../hooks/useResource';
import { useSubmission } from '../hooks/useSubmission';
import { usePagination } from '../hooks/usePagination';
import { summarizeStock } from '../utils/inventoryView';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import Icon from '../components/Icon';
import { ErrorMessage, Field, PageHeading, Pagination, StockBadge, SummaryCards, Table, TablePanel } from '../components/UI';

function TransactionForm({ products, initialType = 'STOCK_IN', initialProduct = '', onSaved, onClose }) {
  const [form, setForm] = useState({ product: initialProduct, type: initialType, quantity: '', date: today(), reason: '' });
  const { saving, begin, end } = useSubmission();
  const [error, setError] = useState('');
  const toast = useToast();
  const change = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));
  const props = name => ({ name, value: form[name], onChange: change, validate: true });
  const selected = products.find(product => product._id === form.product);
  async function submit(event) {
    event.preventDefault(); if (!begin()) return; setError('');
    try {
      await api(form.type === 'STOCK_IN' ? '/inventory/stock-in' : '/inventory/stock-out', json('POST', {
        product: form.product, quantity: +form.quantity, reason: form.reason.trim(), date: form.date,
      }));
      toast('Stock updated'); onClose(); await onSaved();
    } catch (failure) { setError(failure.message); toast(failure.message, { tone: 'error' }); }
    finally { end(); }
  }
  return <form onSubmit={submit} aria-busy={saving}><p className="form-intro">{form.type === 'STOCK_IN' ? 'Record units arriving into your store.' : 'Record units leaving your store.'} Changes are recorded in the stock history.</p><ErrorMessage message={error} /><fieldset disabled={saving}><div className="row">
    <div><Field label="Product" as="select" {...props('product')} required><option value="">Select product</option>{products.map(product => <option key={product._id} value={product._id}>{product.name} ({product.quantity} available)</option>)}</Field>
      {selected && <small className="muted">{selected.shopType === 'CLOTHING' ? 'Fashion' : 'Expiry'}: {productAttribute(selected)}</small>}
    </div>
    <Field label="Type" as="select" {...props('type')}><option value="STOCK_IN">Stock IN</option><option value="STOCK_OUT">Stock OUT</option></Field>
    <Field label="Quantity" type="number" min={1} max={Number.MAX_SAFE_INTEGER} {...props('quantity')} hint={selected ? `Available stock: ${selected.quantity} units. Stock Out cannot exceed available stock.` : 'Choose a product to see available stock.'} required />
    <Field label="Date" type="date" {...props('date')} required />
  </div><Field label="Reason" {...props('reason')} required /><button className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></fieldset></form>;
}
export default function Inventory() {
  const { shopType } = useSession();
  const { data: [transactions, products], loading, error, reload } = useResource(() => Promise.all([api('/inventory/transactions'), api('/products')]), [[], []]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState({ type: 'STOCK_IN', product: '' });
  const stock = summarizeStock(products);
  const byId = new Map(products.map(product => [product._id, product]));
  const needle = search.trim().toLowerCase();
  const overviewRows = products.filter(product => (product.name.toLowerCase().includes(needle) || product.sku.toLowerCase().includes(needle))
    && (!productFilter || product._id === productFilter) && (!stockFilter || stockStatus(product)[1] === stockFilter));
  const rows = transactions.filter(transaction => {
    const id = typeof transaction.product === 'string' ? transaction.product : transaction.product?._id;
    const current = byId.get(id);
    return ([transaction.product?.name, transaction.product?.sku].filter(Boolean).join(' ').toLowerCase().includes(needle))
      && (!filter || transaction.type === filter) && (!productFilter || id === productFilter)
      && (!stockFilter || (current && stockStatus(current)[1] === stockFilter));
  });
  const overview = usePagination(overviewRows);
  const movements = usePagination(rows);
  const change = setter => event => { setter(event.target.value); overview.reset(); movements.reset(); };
  const clear = () => { setSearch(''); setFilter(''); setProductFilter(''); setStockFilter(''); overview.reset(); movements.reset(); };
  const openTransaction = (type = 'STOCK_IN', product = '') => { setInitial({ type, product }); setOpen(true); };
  const ready = !loading && !error;
  return <div className="inventory-page"><PageHeading title="Inventory" description="See available stock and record every Stock IN or Stock OUT movement.">
      <button className="btn secondary" onClick={() => openTransaction('STOCK_OUT')}><Icon name="minus" />Stock Out</button>
      <button className="btn primary" onClick={() => openTransaction('STOCK_IN')}><Icon name="plus" />Stock In</button>
    </PageHeading>
    <SummaryCards className="page-summary" items={[['Total Products', ready ? products.length : null], ['Total Stock', ready ? stock.units : null], ['Low Stock', ready ? stock.low : null], ['Out of Stock', ready ? stock.out : null]]} />
    <TablePanel title="Stock overview" className="stock-overview"><div className="toolbar">
      <input aria-label="Search product" placeholder="Search product name or SKU" value={search} onChange={change(setSearch)} />
      <select aria-label="Filter inventory product" value={productFilter} onChange={change(setProductFilter)}><option value="">All products</option>{products.map(product => <option value={product._id} key={product._id}>{product.name}</option>)}</select>
      <select aria-label="Filter inventory stock status" value={stockFilter} onChange={change(setStockFilter)}><option value="">All stock</option><option value="ok">In Stock</option><option value="warn">Low Stock</option><option value="out">Out of Stock</option></select>
      {(search || filter || productFilter || stockFilter) && <button className="small" onClick={clear}>Clear filters</button>}
    </div><Table headings={['Product', 'SKU', 'Available', 'Minimum', 'Status', 'Actions']} loading={loading} error={error} onRetry={reload} empty={!overviewRows.length} emptyMessage="No stock items match your filters.">
      {overview.rows.map(product => <tr key={product._id}><td><span className="record-name">{product.name}</span></td><td><span className="sku-text">{product.sku}</span></td><td className="numeric-cell">{product.quantity}</td><td className="numeric-cell">{product.minimumStock}</td><td><StockBadge product={product} /></td><td><button className="small" onClick={() => openTransaction('STOCK_IN', product._id)}>Adjust stock</button></td></tr>)}
    </Table><Pagination pagination={overview} label="stock items" loading={loading} error={error} /></TablePanel>

    <TablePanel title="Stock movement" className="movement-panel" actions={<button className="small" onClick={() => openTransaction()}>Stock Transaction</button>}>
      <p className="panel-description">Up to 200 latest movements. Product details reflect current records; deleted products remain in history.</p>
      <div className="toolbar"><select aria-label="Filter transaction type" value={filter} onChange={change(setFilter)}><option value="">All movements</option><option value="STOCK_IN">Stock IN</option><option value="STOCK_OUT">Stock OUT</option></select><span className="filter-context">The product and stock filters above apply to this history.</span></div>
      <Table headings={['Product', 'Type', 'Quantity', 'Reason', 'Date', shopType === 'CLOTHING' ? 'Fashion' : 'Expiry']} loading={loading} error={error} onRetry={reload} empty={!rows.length} emptyMessage="No inventory transactions found.">
        {movements.rows.map(transaction => <tr key={transaction._id}><td>{transaction.product?.name || 'Deleted product'}</td><td><span className={`badge ${transaction.type === 'STOCK_IN' ? 'ok' : 'warn'}`}>{transaction.type === 'STOCK_IN' ? 'Stock IN' : 'Stock OUT'}</span></td><td><span className={`movement-quantity ${transaction.type === 'STOCK_IN' ? 'incoming' : 'outgoing'}`}>{transaction.type === 'STOCK_IN' ? '+' : '−'}{transaction.quantity}</span></td><td className="reason-cell">{transaction.reason || '—'}</td><td>{date(transaction.date)}</td><td>{productAttribute(transaction.product, shopType)}</td></tr>)}
      </Table><Pagination pagination={movements} label="movements" loading={loading} error={error} />
    </TablePanel>{open && <Modal title="Stock Transaction" onClose={() => setOpen(false)}><TransactionForm products={products} initialType={initial.type} initialProduct={initial.product} onSaved={reload} onClose={() => setOpen(false)} /></Modal>}
  </div>;
}
