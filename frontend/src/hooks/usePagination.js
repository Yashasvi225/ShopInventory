import { useCallback, useEffect, useState } from 'react';

// The existing list endpoints return records; pagination only changes their presentation.
export function usePagination(rows) {
  const [page, setPage] = useState(1);
  const [pageSize, setSize] = useState(20);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  useEffect(() => { setPage(previous => Math.min(previous, pageCount)); }, [pageCount]);
  const reset = useCallback(() => setPage(1), []);
  const setPageSize = value => { setSize(Number(value)); setPage(1); };
  return { page: currentPage, pageCount, pageSize, total: rows.length, setPage, setPageSize, reset,
    rows: rows.slice((currentPage - 1) * pageSize, currentPage * pageSize) };
}
