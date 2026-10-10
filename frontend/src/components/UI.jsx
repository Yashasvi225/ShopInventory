import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';
import { stockStatus } from '../config';

const TableTitle = createContext('');

export function Brand({ full = false }) {
  return <div className="brand"><div className="logo"><Icon name="store" /></div><span>Shop Inventory{full && <span className="brand-subtitle">Manager</span>}</span></div>;
}
export function PageHeading({ title, description, children }) {
  return <div className="head"><div><h1>{title}</h1><p>{description}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}
export function TablePanel({ title, children, actions, className = '' }) {
  const titleId = useId();
  return <section className={`panel card table-panel ${className}`.trim()} aria-labelledby={titleId}><div className="panel-heading"><h2 id={titleId}>{title}</h2>{actions}</div><TableTitle.Provider value={title}>{children}</TableTitle.Provider></section>;
}
export function Field({ label, as: Control = 'input', children, hint, validate = false, ...props }) {
  const generated = useId();
  const [validation, setValidation] = useState('');
  const id = props.id || generated;
  const description = [props['aria-describedby'], hint ? `${id}-hint` : '', validation ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return <div className="field"><label htmlFor={id}>{label}</label>
    <Control {...props} id={id} aria-describedby={description} aria-invalid={validation ? true : props['aria-invalid']}
      onInvalid={event => { if (validate) setValidation(event.currentTarget.validationMessage); props.onInvalid?.(event); }}
      onChange={event => { setValidation(''); props.onChange?.(event); }}>{children}</Control>
    {hint && <small className="field-hint" id={`${id}-hint`}>{hint}</small>}
    {validation && <small className="field-error" id={`${id}-error`}>{validation}</small>}
  </div>;
}
export function Table({ headings, loading, error, empty, emptyMessage, children, onRetry }) {
  const title = useContext(TableTitle);
  const scrollId = useId();
  const viewport = useRef(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const element = viewport.current;
    const measure = () => setScrollable(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element); observer.observe(element.querySelector('table')); measure();
    return () => observer.disconnect();
  }, []);
  const message = loading ? 'Loading...' : error || (empty ? emptyMessage : '');
  return <div className="table-shell"><p className="table-scroll-hint" id={scrollId} hidden={!scrollable}><Icon name="scroll" />Scroll horizontally to view all columns.</p>
    <div ref={viewport} className={`tablewrap${scrollable ? ' is-scrollable' : ''}`} tabIndex={scrollable ? 0 : undefined} role={scrollable ? 'region' : undefined} aria-label={title ? `${title} table` : 'Scrollable table'} aria-describedby={scrollable ? scrollId : undefined} aria-busy={loading}><table className="data-table">{title && <caption className="visually-hidden">{title}</caption>}<thead><tr>{headings.map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
    <tbody>{message ? <tr><td className={`empty-cell${loading ? ' is-loading' : ''}`} colSpan={headings.length} role={error ? 'alert' : 'status'}><Icon name={error ? 'warning' : loading ? 'clock' : 'products'} /><span>{message}</span>{error && !loading && onRetry && <button className="btn secondary state-retry" onClick={onRetry}>Try again</button>}</td></tr> : children}</tbody>
  </table></div></div>;
}
export function ErrorMessage({ message }) {
  return message ? <p className="error-message" role="alert"><Icon name="warning" /><span>{message}</span></p> : null;
}
export function SummaryCards({ items, reports = false, className = '' }) {
  const icon = label => /expir/i.test(label) ? 'clock' : /low|out/i.test(label) ? 'warning' : /sales|value|revenue/i.test(label) ? 'money' : /products/i.test(label) ? 'products' : /supplier/i.test(label) ? 'suppliers' : /email/i.test(label) ? 'mail' : /phone/i.test(label) ? 'phone' : 'inventory';
  return <section className={`${reports ? 'reports' : 'stats'} ${className}`.trim()} aria-label={reports ? 'Report summary' : 'Shop summary'}>{items.map(([label, value]) =>
    <div className={`${reports ? 'report' : 'stat'} card${/low|out|expir/i.test(label) ? ' caution' : ''}`} key={label}><div className="stat-heading"><small>{label}</small><span className="stat-icon"><Icon name={icon(label)} /></span></div>
      <strong className="stat-value">{value ?? '—'}</strong>
    </div>)}</section>;
}
export function Pagination({ pagination, label = 'records', loading, error }) {
  if (loading || error) return null;
  const { page, pageCount, pageSize, total, setPage, setPageSize } = pagination;
  return <div className="table-footer"><p className="table-meta" aria-live="polite">{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} ${label}` : `0 ${label}`}</p>
    {total > 20 && <div className="pagination-controls" role="group" aria-label={`${label} pagination`}>
      <label className="page-size">Rows <select aria-label={`${label} per page`} value={pageSize} onChange={event => setPageSize(event.target.value)}>{[20, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label>
      <button className="small" disabled={page <= 1} aria-label={`Previous ${label} page`} onClick={() => setPage(page - 1)}>Previous</button>
      <span className="page-number">{page} / {pageCount}</span>
      <button className="small" disabled={page >= pageCount} aria-label={`Next ${label} page`} onClick={() => setPage(page + 1)}>Next</button>
    </div>}
  </div>;
}
export function ResourceState({ loading, error, empty, emptyMessage, onRetry, children }) {
  if (loading) return <div className="resource-state" role="status"><Icon name="clock" /><p>Loading...</p></div>;
  if (error) return <div className="resource-state"><ErrorMessage message={error} />{onRetry && <button className="btn secondary" onClick={onRetry}>Try again</button>}</div>;
  if (empty) return <div className="resource-state"><Icon name="products" /><p>{emptyMessage}</p></div>;
  return children;
}
export function StockBadge({ product }) {
  const [label, badge] = stockStatus(product);
  return <span className={`badge ${badge}`}>{badge === 'warn' ? 'Low stock' : badge === 'out' ? 'Out of stock' : label}</span>;
}
