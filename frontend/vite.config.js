import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { legacyRoutes } from './src/routes.js';

// Every page loads the single SPA entry. Old bookmarks receive a real redirect.
function legacyPageRedirects() {
  const redirect = (request, response, next) => {
    const url = new URL(request.url || '/', 'http://localhost');
    const target = legacyRoutes[url.pathname];
    if (!target) return next();
    response.writeHead(308, { Location: `${target}${url.search}` });
    response.end();
  };
  return {
    name: 'legacy-page-redirects',
    configureServer(server) { server.middlewares.use(redirect); },
    configurePreviewServer(server) { server.middlewares.use(redirect); },
  };
}

export default defineConfig({
  plugins: [react(), legacyPageRedirects()],
  appType: 'spa',
  server: { port: 5500, strictPort: true },
  preview: { port: 5500, strictPort: true },
});
