import { useCallback, useEffect, useRef, useState } from 'react';

// The caller supplies an existing API request; no business data is synthesized.
export function useResource(loader, initialData) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const generation = useRef(0);
  const mounted = useRef(false);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const result = await loaderRef.current();
      if (mounted.current && request === generation.current) setData(result);
    } catch (failure) {
      if (mounted.current && request === generation.current) setError(failure.message);
    } finally {
      if (mounted.current && request === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    reload();
    return () => { mounted.current = false; generation.current++; };
  }, [reload]);
  return { data, loading, error, reload };
}
