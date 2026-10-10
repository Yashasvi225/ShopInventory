import { useSyncExternalStore } from 'react';
let activeStoreId = '';
let pending = 0;
const listeners = new Set();
const emit = () => listeners.forEach(listener => listener());
export const getActiveStoreId = () => activeStoreId;
export const setActiveStoreId = id => { activeStoreId = id || ''; };
export const hasPendingWrites = () => pending > 0;
export function trackWrite() {
  pending++; emit(); let finished = false;
  return () => { if (finished) return; finished = true; pending--; emit(); };
}
export const usePendingWrites = () => useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, hasPendingWrites, () => false);
