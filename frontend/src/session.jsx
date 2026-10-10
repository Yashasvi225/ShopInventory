import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession, getToken, getUser, saveSession } from './storage';
import { api } from './api';
import { stores as storeTypes } from './config';
import { getActiveStoreId, setActiveStoreId, hasPendingWrites } from './storeRequests';

const SessionContext = createContext(null);
export function SessionProvider({ children }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => ({ token: getToken(), user: getUser() }));
  const [stores, setStores] = useState([]);
  const [activeStore, setActiveStore] = useState(null);
  const [switching, setSwitching] = useState(false);
  const switchingRef = useRef(false);
  const generation = useRef(0);
  const preferenceKey = user => `inventory-active-store:${user._id}`;
  const [loading, setLoading] = useState(() => Boolean(getToken()));
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const update = data => {
    saveSession(data);
    setLoading(true); setActiveStore(null); setActiveStoreId('');
    setSession({ token: getToken(), user: getUser() });
    setRetry(value => value + 1);
  };
  const logout = () => {
    if (session.user) localStorage.removeItem(preferenceKey(session.user));
    generation.current++; setStores([]); setActiveStore(null); setActiveStoreId('');
    clearSession();
    setSession({ token: '', user: null });
    navigate('/login', { replace: true });
  };
  // Restore the retailer from the authenticated backend, not a guessed type or
  // stale localStorage. This also handles sessions created before Stage 2.
  useEffect(() => {
    let active = true;
    const current = ++generation.current;
    if (!session.token) { setLoading(false); setError(''); return; }
    setLoading(true); setError('');
    Promise.all([api('/auth/shop-type'), api('/stores')]).then(([data, owned]) => {
      if (!active || current !== generation.current) return;
      if (owned.stores.some(store => store.createdBy !== data.user._id)) throw new Error('Invalid store ownership response.');
      const preferred = localStorage.getItem(preferenceKey(data.user));
      const selected = owned.stores.find(store => store._id === preferred) || owned.stores.find(store => store.shopType === data.user.shopType) || owned.stores[0] || null;
      setStores(owned.stores); setActiveStore(selected); setActiveStoreId(selected?._id);
      if (selected) localStorage.setItem(preferenceKey(data.user), selected._id);
      saveSession(data);
      setSession(previous => ({ ...previous, user: data.user }));
    }).catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session.token, retry]);
  useEffect(() => {
    const expired = () => {
      generation.current++; setActiveStoreId(''); setStores([]); setActiveStore(null);
      setSession({ token: '', user: null });
      navigate('/login', { replace: true });
    };
    window.addEventListener('inventory-session-expired', expired);
    return () => window.removeEventListener('inventory-session-expired', expired);
  }, [navigate]);
  async function switchStore(id) {
    if (switchingRef.current || hasPendingWrites()) throw new Error('Wait for the current request to finish before switching stores.');
    const selected = stores.find(store => store._id === id);
    if (!selected) throw new Error('Select an authorized store.');
    if (id === getActiveStoreId()) return;
    const current = generation.current; switchingRef.current = true; setSwitching(true);
    try {
      await api('/reports/dashboard', { headers: { 'X-Store-Id': id } });
      if (current !== generation.current || getToken() !== session.token) return;
      if (hasPendingWrites()) throw new Error('Finish the current request before switching stores.');
      setActiveStoreId(id); setActiveStore(selected); localStorage.setItem(preferenceKey(session.user), id);
    } finally { switchingRef.current = false; setSwitching(false); }
  }
  const shopType = activeStore?.shopType || null;
  return <SessionContext.Provider value={{ ...session, update, logout, shopType, stores, activeStore, switchStore, switching, loading, error,
    retrySession: () => setRetry(value => value + 1), shopLabel: storeTypes[shopType]?.label || '' }}>
    {children}
  </SessionContext.Provider>;
}
export const useSession = () => useContext(SessionContext);
