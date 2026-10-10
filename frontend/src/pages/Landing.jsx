import { Link } from 'react-router-dom';
import { Brand } from '../components/UI';

export default function Landing() {
  return <main className="hero"><div className="inside"><section><Brand full />
    <h1>Run your shop with <span>clarity.</span></h1>
    <p>Inventory and sales management for Medical, Restaurant, Grocery and Clothing Stores.</p>
    <Link className="btn primary" to="/register">Create Account</Link>
    <Link className="btn secondary" to="/login">Login</Link>
  </section><aside className="pitch card"><h2>One warm, modern workspace</h2>
    <p>Products · Suppliers · Stock IN/OUT · Sales · Expiry · Reports · AI Reordering</p>
  </aside></div></main>;
}
