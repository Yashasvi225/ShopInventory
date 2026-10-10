import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useResource } from './useResource';

// Date filters run on the server; the existing history endpoint caps responses at 500.
export function useSalesHistory(initialRange = { from: '', to: '' }) {
  const [range, setRange] = useState(initialRange);
  const query = new URLSearchParams({ ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}), limit: '500' }).toString();
  const resource = useResource(() => api('/sales?' + query), []);
  const previous = useRef(query);
  useEffect(() => {
    if (previous.current !== query) { previous.current = query; resource.reload(); }
  }, [query, resource.reload]);
  return { ...resource, range, setRange };
}
