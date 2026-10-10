import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, json } from '../api';
import { useSession } from '../session';
import { useToast } from '../components/Toast';
import { Brand, Field, ErrorMessage } from '../components/UI';
import { stores } from '../config';
import { useSubmission } from '../hooks/useSubmission';

export default function ShopSelection() {
  const [chosen, setChosen] = useState('');
  const [shopName, setShopName] = useState('');
  const { saving, begin, end } = useSubmission();
  const [error, setError] = useState('');
  const { update } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  async function submit(event) {
    event.preventDefault();
    if (!chosen) { toast('Select a shop type', { tone: 'warning' }); return; }
    if (!begin()) return; setError('');
    try {
      const data = await api('/auth/shop-type', json('PUT', { shopType: chosen, shopName: shopName.trim() }));
      update({ user: data.user });
      localStorage.setItem('shopName', data.user.shopName || '');
      navigate('/dashboard');
    } catch (failure) { setError(failure.message); toast(failure.message, { tone: 'error' }); }
    finally { end(); }
  }
  return <main className="page"><section className="wrap"><Brand /><h1>Select your shop</h1>
    <div className="choices">
      {Object.entries(stores).map(([type, { label, description }]) =>
        <button type="button" key={type} className={`choice card${chosen === type ? ' selected' : ''}`} aria-pressed={chosen === type} onClick={() => setChosen(type)}><h2>{label}</h2><p>{description}</p></button>)}
    </div><form className="shop-name" onSubmit={submit}><ErrorMessage message={error} />
      <Field label="Shop Name" autoComplete="organization" placeholder="Enter shop name" value={shopName} onChange={event => setShopName(event.target.value)} />
      <button className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Continue'}</button>
    </form>
  </section></main>;
}
