import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SessionProvider } from './session';
import { ToastProvider } from './components/Toast';
import '../css/style.css';
import '../css/auth.css';
import '../css/dashboard.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider><ToastProvider><App /></ToastProvider></SessionProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
