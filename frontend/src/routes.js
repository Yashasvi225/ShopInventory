// Old bookmarks redirect to the same React pages at their canonical URLs.
// Shared by React and Vite's development/preview redirect middleware.
export const legacyRoutes = Object.freeze({
  '/index.html': '/',
  '/login.html': '/login',
  '/register.html': '/register',
  '/shop-selection.html': '/shop-selection',
  '/dashboard.html': '/dashboard',
  '/products.html': '/products',
  '/suppliers.html': '/suppliers',
  '/inventory.html': '/inventory',
  '/sales.html': '/sales',
  '/reports.html': '/reports',
  '/ai-recommendations.html': '/ai-recommendations',
});
