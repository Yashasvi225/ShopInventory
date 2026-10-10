import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../session';
import { Brand } from './UI';
import Icon from './Icon';
import { usePendingWrites } from '../storeRequests';
import { stores as storeTypes } from '../config';

const links = [['Dashboard', 'dashboard'], ['Products', 'products'], ['Suppliers', 'suppliers'],
  ['Inventory', 'inventory'], ['Sales', 'sales'], ['Reports', 'reports'], ['AI Recommendations', 'ai-recommendations']];
export default function Layout() {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width:820px)').matches);
  const sidebar = useRef(null);
  const menu = useRef(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width:820px)');
    const change = () => { setMobile(media.matches); setOpen(false); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    (sidebar.current?.querySelector('a.active') || sidebar.current?.querySelector('a'))?.focus();
    const escape = event => {
      if (event.key === 'Escape') { setOpen(false); menu.current?.focus(); }
      if (event.key === 'Tab') {
        const items = [menu.current, ...sidebar.current.querySelectorAll('a[href]')];
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, mobile]);
  const { shopLabel, shopType, user, logout, stores, activeStore, switchStore, switching } = useSession();
  const pending = usePendingWrites();
  const [switchError, setSwitchError] = useState('');
  async function selectStore(event) {
    setSwitchError('');
    try { await switchStore(event.target.value); window.dispatchEvent(new Event('inventory-store-changed')); }
    catch(error) { setSwitchError(error.message); }
  }
  const accountName = user?.name || 'Shop owner';
  const initials = accountName.trim().split(/\s+/).slice(0, 2).map(part => part.replace(/[^\p{L}\p{N}]/gu, '')[0]).join('').toUpperCase() || 'SO';
  if (!shopType) return <Navigate to="/shop-selection" replace />;
  return <div className="layout">
    <a className="skip-link" href="#main-content" inert={mobile && open ? '' : undefined}>Skip to main content</a>
    <aside ref={sidebar} inert={mobile && !open ? '' : undefined} className={`sidebar${open ? ' open' : ''}`} id="sidebar"><Brand full /><div className="shop"><Icon name="store" />{shopLabel}</div>
      <nav className="nav" aria-label="Main navigation"><span className="nav-label">Workspace</span>{links.map(([label, path]) =>
        <NavLink key={path} to={`/${path}`} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}><Icon name={path} /><span>{label}</span></NavLink>)}
        <Link className="nav-logout" to="/login" onClick={event => { event.preventDefault(); setOpen(false); logout(); }}><Icon name="logout" /><span>Logout</span></Link>
      </nav>
      <div className="sidebar-note"><span className="sidebar-note-label">Your store</span><span>{activeStore?.name || shopLabel}</span></div>
    </aside>
    <div className={`overlay${open ? ' show' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
    <main className="main"><header className="top"><button ref={menu} type="button" className="menu" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(!open)}><Icon name={open ? 'close' : 'menu'} /></button>
      <div className="workspace-label">{stores.length>1?<label className="store-switcher"><span>Active store</span>
        <select aria-label="Active store" value={activeStore._id} onChange={selectStore} disabled={pending||switching}>
          {stores.map(store=><option key={store._id} value={store._id}>{store.name?`${store.name} · `:''}{storeTypes[store.shopType].label}</option>)}
        </select></label>:<><span>Retail workspace</span><strong>{shopLabel}</strong></>}</div>
      <div className="account" role="group" aria-label={`Signed in as ${accountName}`} title={accountName}><div className="avatar" aria-hidden="true">{initials}</div><div className="account-details"><span className="account-name">{accountName}</span><span className="account-email">{user?.email}</span></div></div></header>
      {switchError && <p className="store-switch-error" role="alert">{switchError}</p>}
      <div id="main-content" tabIndex={-1} className="content" inert={mobile && open || switching ? '' : undefined}>
        {switching && <p role="status">Switching store…</p>}
        <Outlet key={`${user._id}:${activeStore._id}`} /></div>
    </main>
  </div>;
}
