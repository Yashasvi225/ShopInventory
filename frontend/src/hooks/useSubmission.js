import { useRef, useState } from 'react';

// A synchronous lock also catches two submissions before React renders disabled.
export function useSubmission() {
  const locked = useRef(false);
  const [saving, setSaving] = useState(false);
  const begin = () => { if (locked.current) return false; locked.current = true; setSaving(true); return true; };
  const end = () => { locked.current = false; setSaving(false); };
  return { saving, begin, end };
}
