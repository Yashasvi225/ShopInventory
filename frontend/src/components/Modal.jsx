import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export default function Modal({ title, onClose, children }) {
  const titleId = useId();
  const dialog = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = document.getElementById('root');
    const previousInert = root.inert;
    root.inert = true;
    const focusables = () => [...dialog.current.querySelectorAll('button, input:not([type=hidden]), select, a[href], textarea')].filter(element => !element.matches(':disabled') && element.getClientRects().length);
    focusables()[0]?.focus();
    const keydown = event => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const items = focusables();
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      root.inert = previousInert;
      document.removeEventListener('keydown', keydown);
      // A list reload can remove the row that launched an edit/stock dialog.
      const target = previousFocus?.isConnected && !previousFocus.matches(':disabled')
        ? previousFocus : root.querySelector('.page-actions .btn.primary:not(:disabled)');
      target?.focus();
    };
  }, []);
  return createPortal(<div className="modal show"><div ref={dialog} className="modalbox" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <div className="modalhead"><h2 id={titleId}>{title}</h2><button type="button" className="close" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>
    <div className="modalbody">{children}</div>
  </div></div>, document.body);
}
