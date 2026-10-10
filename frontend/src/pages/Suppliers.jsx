import { useState } from 'react';
import { api, json } from '../api';
import { useResource } from '../hooks/useResource';
import { useSubmission } from '../hooks/useSubmission';
import { usePagination } from '../hooks/usePagination';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import Icon from '../components/Icon';
import { ErrorMessage, Field, PageHeading, Pagination, SummaryCards, Table, TablePanel } from '../components/UI';

function SupplierForm({ supplier, onClose, onSaved }) {
  const [form, setForm] = useState(() => Object.fromEntries(['name', 'company', 'phone', 'email', 'address'].map(key => [key, supplier?.[key] || ''])));
  const { saving, begin, end } = useSubmission();
  const [error, setError] = useState('');
  const toast = useToast();
  const change = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));
  const field = (name, label, extra = {}) => <Field name={name} label={label} value={form[name]} onChange={change} validate {...extra} />;
  async function submit(event) {
    event.preventDefault(); if (!begin()) return; setError('');
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]));
    try {
      await api(supplier ? `/suppliers/${supplier._id}` : '/suppliers', json(supplier ? 'PUT' : 'POST', payload));
      toast(supplier ? 'Supplier updated' : 'Supplier added'); onClose(); await onSaved();
    } catch (failure) { setError(failure.message); toast(failure.message, { tone: 'error' }); }
    finally { end(); }
  }
  return <form onSubmit={submit} aria-busy={saving}><p className="form-intro">Keep supplier and contact details together. Name is required; other details are optional.</p><ErrorMessage message={error} /><fieldset disabled={saving}><div className="row">
    {field('name', 'Name', { required: true })}{field('company', 'Company')}{field('phone', 'Phone')}{field('email', 'Email', { type: 'email' })}
  </div>{field('address', 'Address')}<button className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></fieldset></form>;
}
export default function Suppliers() {
  const { data, loading, error, reload } = useResource(() => api('/suppliers'), []);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const { saving: deleting, begin: beginDelete, end: endDelete } = useSubmission();
  const rows = data.filter(supplier => [supplier.name, supplier.company, supplier.email, supplier.phone].filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const pagination = usePagination(rows);
  const edit = supplier => { setEditing(supplier); setOpen(true); };
  async function remove(supplier) {
    if (!beginDelete()) return;
    try {
      if (!window.confirm(`Delete supplier "${supplier.name}"? Product records will remain; their supplier link will be cleared.`)) return;
      await api(`/suppliers/${supplier._id}`, { method: 'DELETE' }); toast('Supplier deleted'); await reload();
    } catch (failure) { toast(failure.message, { tone: 'error' }); }
    finally { endDelete(); }
  }
  const ready = !loading && !error;
  return <div className="suppliers-page"><PageHeading title="Suppliers" description="Your supplier directory and recorded contact details."><button className="btn primary" onClick={() => edit(null)}><Icon name="plus" />Add Supplier</button></PageHeading>
    <SummaryCards className="page-summary supplier-summary" items={[['Total Suppliers', ready ? data.length : null], ['With Email', ready ? data.filter(supplier => supplier.email?.trim()).length : null], ['With Phone', ready ? data.filter(supplier => supplier.phone?.trim()).length : null]]} />
    <TablePanel title="Supplier directory" className="suppliers-panel"><div className="toolbar"><input aria-label="Search supplier" placeholder="Search name, company, email or phone" value={search} onChange={event => { setSearch(event.target.value); pagination.reset(); }} />{search && <button className="small" onClick={() => { setSearch(''); pagination.reset(); }}>Clear search</button>}</div>
      <Table headings={['Name', 'Company', 'Phone', 'Email', 'Address', 'Actions']} loading={loading} error={error} onRetry={reload} empty={!rows.length} emptyMessage="No suppliers found.">
        {pagination.rows.map(supplier => <tr key={supplier._id}><td><span className="record-name">{supplier.name}</span></td><td>{supplier.company || '—'}</td><td>{supplier.phone ? <a className="contact-link" href={`tel:${supplier.phone.replace(/[^+\d(). -]/g, '')}`}>{supplier.phone}</a> : '—'}</td><td>{supplier.email ? <a className="contact-link" href={`mailto:${encodeURIComponent(supplier.email)}`}>{supplier.email}</a> : '—'}</td><td className="address-cell">{supplier.address || '—'}</td><td><div className="row-actions"><button className="small" onClick={() => edit(supplier)}>Edit</button><button className="small danger" disabled={deleting} onClick={() => remove(supplier)}>Delete</button></div></td></tr>)}
      </Table><Pagination pagination={pagination} label="suppliers" loading={loading} error={error} />
    </TablePanel>{open && <Modal title="Supplier" onClose={() => setOpen(false)}><SupplierForm supplier={editing} onClose={() => setOpen(false)} onSaved={reload} /></Modal>}
  </div>;
}
