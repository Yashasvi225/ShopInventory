import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, json } from '../api';
import { categories, fashionTypes, productAttribute, money, stockStatus } from '../config';
import { useSession } from '../session';
import { useResource } from '../hooks/useResource';
import { useSubmission } from '../hooks/useSubmission';
import { usePagination } from '../hooks/usePagination';
import { summarizeStock } from '../utils/inventoryView';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import Icon from '../components/Icon';
import { ErrorMessage, Field, PageHeading, Pagination, StockBadge, SummaryCards, Table, TablePanel } from '../components/UI';

function ProductForm({ product, suppliers, shopType, onSaved, onClose }) {
  const clothing = shopType === 'CLOTHING';
  const categoryChoices = categories[shopType];
  const [form, setForm] = useState(() => ({
    name: product?.name || '', sku: product?.sku || '',
    category: product?.category ?? categoryChoices?.[0] ?? '', description: product?.description || '',
    purchasePrice: product?.purchasePrice ?? '', sellingPrice: product?.sellingPrice ?? '', quantity: product?.quantity ?? '',
    minimumStock: product?.minimumStock ?? '', supplier: product?.supplier?._id || '',
    ...(clothing ? { fashionType: product?.fashionType || '' } : { expiryDate: product?.expiryDate?.slice(0, 10) || '' }),
  }));
  const { saving, begin, end } = useSubmission();
  const [error, setError] = useState('');
  const toast = useToast();
  const change = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));
  const props = name => ({ name, value: form[name], onChange: change, validate: true });
  async function submit(event) {
    event.preventDefault(); if (!begin()) return; setError('');
    const payload = { ...form, name: form.name.trim(), sku: form.sku.trim(), description: form.description.trim(),
      purchasePrice: +form.purchasePrice, sellingPrice: +form.sellingPrice, quantity: +form.quantity,
      minimumStock: +form.minimumStock, supplier: form.supplier || null };
    if (!clothing) payload.expiryDate = form.expiryDate || null;
    if (product) payload.expectedQuantity = product.quantity;
    try {
      await api(product ? `/products/${product._id}` : '/products', json(product ? 'PUT' : 'POST', payload));
      toast(product ? 'Product updated' : 'Product added'); onClose(); await onSaved();
    } catch (failure) { setError(failure.message); toast(failure.message, { tone: 'error' }); if (failure.status === 409) await onSaved(); }
    finally { end(); }
  }
  return <form onSubmit={submit} aria-busy={saving}><p className="form-intro">{product ? 'Update the existing product details.' : 'Add a product to your store inventory.'}</p><ErrorMessage message={error} /><fieldset disabled={saving}><div className="row">
    <Field label="Name" {...props('name')} required /><Field label="SKU" {...props('sku')} required />
    {categoryChoices ? <Field label="Category" as="select" {...props('category')} required>
      {form.category && !categoryChoices.includes(form.category) && <option>{form.category}</option>}
      {categoryChoices.map(value => <option key={value}>{value}</option>)}
    </Field> : <Field label="Category" {...props('category')} />}
    <Field label="Purchase Price" {...props('purchasePrice')} type="number" min={0} max={Number.MAX_SAFE_INTEGER} step="any" required />
    <Field label="Selling Price" {...props('sellingPrice')} type="number" min={0} max={Number.MAX_SAFE_INTEGER} step="any" required />
    <Field label="Quantity" {...props('quantity')} type="number" min={0} required />
    <Field label="Minimum Stock" {...props('minimumStock')} type="number" min={0} max={Number.MAX_SAFE_INTEGER} hint="Items at or below this threshold need a stock review." required />
    <Field label="Supplier" as="select" {...props('supplier')}><option value="">No supplier</option>{suppliers.map(supplier => <option value={supplier._id} key={supplier._id}>{supplier.name}</option>)}</Field>
    {clothing ? <Field label="Fashion" as="select" {...props('fashionType')} hint="Required for clothing; expiry dates do not apply." required>
      <option value="">Select Old Fashion or New Fashion</option>
      {Object.entries(fashionTypes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
    </Field> : <Field label="Expiry Date" {...props('expiryDate')} type="date" hint="Optional for this store type." />}
  </div><Field label="Description" {...props('description')} /><button className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></fieldset></form>;
}

export default function Products() {
  const { data: [products, suppliers], loading, error, reload } = useResource(() => Promise.all([api('/products'), api('/suppliers')]), [[], []]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('recent');
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [parameters, setParameters] = useSearchParams();
  const { shopType } = useSession();
  const clothing = shopType === 'CLOTHING';
  const stockFilter = ['ok', 'warn', 'out'].includes(parameters.get('stock')) ? parameters.get('stock') : '';
  const fashion = clothing && Object.hasOwn(fashionTypes, parameters.get('fashion')) ? parameters.get('fashion') : '';
  const categoryChoices = [...new Set([...(categories[shopType] || []), ...products.map(product => product.category).filter(Boolean)])];
  const toast = useToast();
  const { saving: deleting, begin: beginDelete, end: endDelete } = useSubmission();
  const stock = summarizeStock(products);
  const rows = products.filter(product => (product.name.toLowerCase().includes(search.trim().toLowerCase()) || product.sku.toLowerCase().includes(search.trim().toLowerCase()))
    && (!category || product.category === category) && (!fashion || product.fashionType === fashion) && (!stockFilter || stockStatus(product)[1] === stockFilter)).sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true });
      if (sort === 'name-desc') return b.name.localeCompare(a.name, undefined, { numeric: true });
      if (sort === 'quantity') return a.quantity - b.quantity;
      if (sort === 'quantity-desc') return b.quantity - a.quantity;
      if (sort === 'price') return a.sellingPrice - b.sellingPrice;
      if (sort === 'price-desc') return b.sellingPrice - a.sellingPrice;
      if (sort === 'expiry' && !clothing) { const left = a.expiryDate ? Date.parse(a.expiryDate) : Infinity; const right = b.expiryDate ? Date.parse(b.expiryDate) : Infinity; return left === right ? 0 : left < right ? -1 : 1; }
      return 0;
    });
  const pagination = usePagination(rows);
  const change = setter => event => { setter(event.target.value); pagination.reset(); };
  const parameter = key => event => {
    const next = new URLSearchParams(parameters);
    if (event.target.value) next.set(key, event.target.value); else next.delete(key);
    setParameters(next, { replace: true }); pagination.reset();
  };
  const clear = () => { setSearch(''); setCategory(''); setSort('recent'); const next = new URLSearchParams(parameters); next.delete('stock'); next.delete('fashion'); setParameters(next, { replace: true }); pagination.reset(); };
  const edit = product => { setEditing(product); setOpen(true); };
  async function remove(product) {
    if (!beginDelete()) return;
    try {
      if (!window.confirm(`Delete product "${product.name}"? This removes it from your product list.`)) return;
      await api(`/products/${product._id}`, { method: 'DELETE' }); toast('Product deleted'); await reload();
    } catch (failure) { toast(failure.message, { tone: 'error' }); }
    finally { endDelete(); }
  }
  const ready = !loading && !error;
  return <div className="products-page"><PageHeading title="Products" description={clothing ? 'Manage clothing stock by Old Fashion and New Fashion.' : 'Search, filter and maintain stock items.'}><button className="btn primary" onClick={() => edit(null)}><Icon name="plus" />Add Product</button></PageHeading>
    <SummaryCards className="page-summary" items={[['Total Products', ready ? products.length : null], ['In Stock', ready ? stock.healthy : null], ['Low Stock', ready ? stock.low : null], ['Out of Stock', ready ? stock.out : null]]} />
    <TablePanel title="Product inventory" className="products-panel"><div className="toolbar">
      <input aria-label="Search product or SKU" placeholder="Search product or SKU" value={search} onChange={change(setSearch)} />
      <select aria-label="Filter category" value={category} onChange={change(setCategory)}><option value="">All categories</option>{categoryChoices.map(value => <option key={value}>{value}</option>)}</select>
      {clothing && <select aria-label="Filter fashion" value={fashion} onChange={parameter('fashion')}><option value="">All fashion</option>{Object.entries(fashionTypes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>}
      <select aria-label="Filter stock status" value={stockFilter} onChange={parameter('stock')}><option value="">All stock</option><option value="ok">In Stock</option><option value="warn">Low Stock</option><option value="out">Out of Stock</option></select>
      <select aria-label="Sort products" value={sort} onChange={change(setSort)}><option value="recent">Recently added</option><option value="name">Name: A–Z</option><option value="name-desc">Name: Z–A</option><option value="quantity">Stock: low to high</option><option value="quantity-desc">Stock: high to low</option><option value="price">Price: low to high</option><option value="price-desc">Price: high to low</option>{!clothing && <option value="expiry">Expiry: soonest first</option>}</select>
      {(search || category || fashion || stockFilter || sort !== 'recent') && <button className="small" onClick={clear}>Clear filters</button>}
    </div><Table headings={['Product', 'SKU', 'Category', 'Price', 'Qty', 'Min', 'Supplier', clothing ? 'Fashion' : 'Expiry', 'Status', 'Actions']} loading={loading} error={error} onRetry={reload} empty={!rows.length} emptyMessage="No products found.">
      {pagination.rows.map(product => <tr key={product._id}><td><span className="record-name" title={product.description || undefined}>{product.name}</span></td><td><span className="sku-text">{product.sku}</span></td><td>{product.category || '—'}</td><td className="numeric-cell">{money(product.sellingPrice)}</td><td className="numeric-cell">{product.quantity}</td><td className="numeric-cell">{product.minimumStock}</td><td>{product.supplier?.name || '—'}</td><td>{clothing ? <span className={`badge ${product.fashionType === 'NEW_FASHION' ? 'ok' : 'warn'}`}>{productAttribute(product, shopType)}</span> : productAttribute(product, shopType)}</td><td><StockBadge product={product} /></td><td><div className="row-actions"><button className="small" onClick={() => edit(product)}>Edit</button><button className="small danger" disabled={deleting} onClick={() => remove(product)}>Delete</button></div></td></tr>)}
    </Table><Pagination pagination={pagination} label="products" loading={loading} error={error} /></TablePanel>
    {open && <Modal title="Product" onClose={() => setOpen(false)}><ProductForm product={editing} suppliers={suppliers} shopType={shopType} onClose={() => setOpen(false)} onSaved={reload} /></Modal>}
  </div>;
}
