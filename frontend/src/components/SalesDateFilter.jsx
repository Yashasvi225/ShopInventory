import { useEffect, useId, useState } from 'react';
import { ErrorMessage, Field } from './UI';

export default function SalesDateFilter({ range, onChange, loading, resetRange = { from: '', to: '' } }) {
  const [draft, setDraft] = useState(range);
  const [error, setError] = useState('');
  const id = useId();
  useEffect(() => { setDraft(range); setError(''); }, [range]);
  function apply(event) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) { setError('Start date must be on or before the end date.'); return; }
    setError(''); onChange(draft);
  }
  return <form className="sales-date-filter" onSubmit={apply} aria-label="Sales date filters" aria-describedby={id}>
    <div className="date-filter-fields">
      <Field label="From date" type="date" value={draft.from} onChange={event => setDraft(value => ({ ...value, from: event.target.value }))} />
      <Field label="To date" type="date" value={draft.to} onChange={event => setDraft(value => ({ ...value, to: event.target.value }))} />
      <button className="btn secondary" disabled={loading}>Apply dates</button>
      <button className="btn small" type="button" disabled={loading} onClick={() => onChange({ ...resetRange })}>Reset dates</button>
    </div><ErrorMessage message={error} />
    <p className="table-meta" id={id}>Inclusive UTC calendar dates. Up to 500 most recent matching sales; search and sorting apply to the loaded records.</p>
  </form>;
}
