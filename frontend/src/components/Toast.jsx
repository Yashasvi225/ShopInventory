import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { getActiveStoreId } from '../storeRequests';

const ToastContext = createContext(null);
export function ToastProvider({ children }) {
  const [notification, setNotification] = useState(null);
  const timer = useRef();
  const deadline = useRef(0);
  const remaining = useRef(5000);
  const interaction = useRef({ hover: false, focus: false });
  const previousFocus = useRef(null);
  const element = useRef(null);
  const active = useRef(false);
  const dismiss = useCallback(() => {
    active.current = false;
    clearTimeout(timer.current);
    timer.current = undefined;
    if (element.current?.contains(document.activeElement)) {
      const target = previousFocus.current;
      if (target?.isConnected && !target.matches(':disabled') && !target.closest('[inert]')) target.focus();
      else document.getElementById('main-content')?.focus();
    }
    interaction.current = { hover: false, focus: false };
    setNotification(null);
  }, []);
  const schedule = useCallback(() => {
    deadline.current = Date.now() + remaining.current;
    timer.current = setTimeout(dismiss, remaining.current);
  }, [dismiss]);
  const toast = useCallback((text, { tone = 'success' } = {}) => {
    clearTimeout(timer.current); timer.current = undefined;
    previousFocus.current = document.activeElement;
    remaining.current = 5000;
    active.current = true;
    setNotification({ text, tone });
    if (!interaction.current.hover && !interaction.current.focus) schedule();
  }, [schedule]);
  const pause = kind => {
    interaction.current[kind] = true;
    if (timer.current !== undefined) {
      remaining.current = Math.max(0, deadline.current - Date.now());
      clearTimeout(timer.current); timer.current = undefined;
    }
  };
  const resume = kind => {
    interaction.current[kind] = false;
    if (active.current && !interaction.current.hover && !interaction.current.focus && timer.current === undefined) schedule();
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { window.addEventListener('inventory-store-changed', dismiss); return () => window.removeEventListener('inventory-store-changed', dismiss); }, [dismiss]);
  return <ToastContext.Provider value={toast}>{children}
    {notification && <div ref={element} className={`toast toast--${notification.tone}`} role="status" aria-atomic="true"
      onMouseEnter={() => pause('hover')} onMouseLeave={() => resume('hover')}
      onFocusCapture={() => pause('focus')} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) resume('focus'); }}>
      <Icon name={notification.tone === 'success' ? 'check' : 'warning'} /><span>{notification.text}</span>
      <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={dismiss}><Icon name="close" /></button>
    </div>}
  </ToastContext.Provider>;
}
export const useToast = () => {
  const toast = useContext(ToastContext);
  const scope = getActiveStoreId();
  return (text, options) => { if (scope === getActiveStoreId()) toast(text, options); };
};
