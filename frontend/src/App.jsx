import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './session';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ShopSelection from './pages/ShopSelection';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Suppliers from './pages/Suppliers';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import AIRecommendations from './pages/AIRecommendations';
import { ErrorMessage } from './components/UI';
import { legacyRoutes } from './routes';

function ProtectedRoute() {
  const { token, loading, error, retrySession } = useSession();
  if (!token) return <Navigate to="/login" replace />;
  if (loading) return <p className="content muted" role="status">Loading your shop...</p>;
  if (error) return <div className="content"><ErrorMessage message={error} /><button className="btn primary" onClick={retrySession}>Retry</button></div>;
  return <Outlet />;
}
const titles = { '/login': 'Login', '/register': 'Register', '/shop-selection': 'Shop Selection',
  '/dashboard': 'Dashboard', '/products': 'Products', '/suppliers': 'Suppliers',
  '/inventory': 'Inventory', '/sales': 'Sales', '/reports': 'Reports', '/ai-recommendations': 'AI Recommendations' };
function LegacyRedirect({ target }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${target}${search}${hash}`} replace />;
}
export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title = titles[pathname];
    document.title = title ? `${title} | Shop Inventory Manager` : 'Shop Inventory Manager';
  }, [pathname]);
  return <Routes>
    {Object.entries(legacyRoutes).map(([path, target]) => <Route key={path} path={path} element={<LegacyRedirect target={target} />} />)}
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/shop-selection" element={<ShopSelection />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} /><Route path="/products" element={<Products />} />
        <Route path="/suppliers" element={<Suppliers />} /><Route path="/inventory" element={<Inventory />} />
        <Route path="/sales" element={<Sales />} /><Route path="/reports" element={<Reports />} />
        <Route path="/ai-recommendations" element={<AIRecommendations />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
