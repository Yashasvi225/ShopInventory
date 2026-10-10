import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, json } from '../api';
import { useSession } from '../session';
import { useToast } from './Toast';
import { Brand, ErrorMessage, Field } from './UI';
import { useSubmission } from '../hooks/useSubmission';
import { emailError, normalizeEmail, registrationPasswordError, loginPasswordError, PASSWORD_MESSAGE } from '../utils/authValidation';
import { stores } from '../config';

export default function AuthForm({ register = false }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const { saving, begin, end } = useSubmission();
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const { update } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const change = event => {
    const { name, value } = event.target;
    if (name === 'email') event.target.setCustomValidity(emailError(value));
    if (name === 'password') event.target.setCustomValidity(register ? registrationPasswordError(value) : loginPasswordError(value));
    setForm(previous => ({ ...previous, [name]: value }));
  };
  async function submit(event) {
    event.preventDefault();
    setError('');
    const validation = emailError(form.email) || (register ? registrationPasswordError(form.password) : loginPasswordError(form.password));
    if (validation) { setError(validation); toast(validation, { tone: 'error' }); return; }
    if (register && form.password !== form.confirmPassword) {
      setError('Passwords do not match'); toast('Passwords do not match', { tone: 'error' }); return;
    }
    if (register && !selected.length) { setError('Select at least one store.'); return; }
    if (!begin()) return;
    try {
      const payload = { email: normalizeEmail(form.email), password: form.password };
      if (register) { payload.name = form.name.trim(); payload.shopTypes = selected; }
      const data = await api(register ? '/auth/register' : '/auth/login', json('POST', payload));
      update(data);
      if (register) toast('Account created');
      navigate(!data.user.shopType ? '/shop-selection' : '/dashboard');
    } catch (failure) { setError(failure.message); toast(failure.message, { tone: 'error' }); }
    finally { end(); }
  }
  return <main className="auth"><section className="aside"><Brand /><div>
    <h1>{register ? 'Start managing smarter.' : 'Welcome back.'}</h1><p>For Medical, Restaurant, Grocery and Clothing Stores.</p>
  </div></section><section className="mainauth"><div className="authcard card">
    <h2>{register ? 'Create account' : 'Login'}</h2><p className="muted">Continue to your retail workspace.</p>
    <form onSubmit={submit} aria-busy={saving}><ErrorMessage message={error} /><fieldset disabled={saving}>
      {register && <Field label="Name" name="name" autoComplete="name" value={form.name} onChange={change} validate required />}
      <Field label="Email" name="email" type="email" autoComplete={register ? 'email' : 'username'} value={form.email} onChange={change} validate required />
      <Field label="Password" name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : undefined} hint={register ? PASSWORD_MESSAGE : undefined} value={form.password} onChange={change} validate required />
      {register && <Field label="Confirm Password" name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={change} validate required />}
      {register && <fieldset className="registration-stores"><legend>Your store types</legend><p className="muted">Choose one or more. Each store keeps its own inventory and sales.</p>
        <div className="store-options">{Object.entries(stores).map(([type,store])=><label key={type} className={`store-option${selected.includes(type)?' selected':''}`}>
          <input type="checkbox" checked={selected.includes(type)} onChange={()=>setSelected(previous=>previous.includes(type)?previous.filter(item=>item!==type):[...previous,type])} />
          <span>{store.label}</span></label>)}</div></fieldset>}
      <button className="btn primary" disabled={saving}>{saving ? register ? 'Creating...' : 'Logging in...' : register ? 'Register' : 'Login'}</button>
    </fieldset></form><p className="foot">{register ? 'Already registered? ' : 'New user? '}
      <Link to={register ? '/login' : '/register'}>{register ? 'Login' : 'Register'}</Link>
    </p>
  </div></section></main>;
}
