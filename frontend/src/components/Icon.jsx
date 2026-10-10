// One consistent stroke-based icon set; no network assets or extra dependency.
const paths = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  products: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5" /></>,
  suppliers: <><path d="M3 5h11v12H3zM14 9h4l3 4v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
  inventory: <><path d="M4 8h16v13H4zM3 3h18v5H3zM9 12h6M9 16h6" /></>,
  sales: <><path d="M3 3h2l2 13h12l2-9H6M8 11h11" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
  reports: <><path d="M4 3v18h17M8 16v-5M13 16V6M18 16V9" /></>,
  'ai-recommendations': <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4M18 4h4" /></>,
  store: <><path d="M4 10v11h16V10M3 10l2-7h14l2 7M3 10c0 3 4.5 3 4.5 0 0 3 4.5 3 4.5 0 0 3 4.5 3 4.5 0 0 3 4.5 3 4.5 0M9 21v-6h6v6" /></>,
  money: <><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="12" cy="12" r="3" /><path d="M6 12h.01M18 12h.01" /></>,
  warning: <><path d="m10.2 4-8 14a2 2 0 0 0 1.8 3h16a2 2 0 0 0 1.8-3l-8-14a2 2 0 0 0-3.6 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  logout: <><path d="M9 3H4v18h5M9 12h12M17 8l4 4-4 4" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
  scroll: <><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  phone: <path d="M6 3h4l2 5-3 2a15 15 0 0 0 5 5l2-3 5 2v4a3 3 0 0 1-3 3A18 18 0 0 1 3 6a3 3 0 0 1 3-3Z" />,
};

export default function Icon({ name, className = '' }) {
  return <svg className={`icon ${className}`.trim()} width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{paths[name] || paths.products}</svg>;
}
