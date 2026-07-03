import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useAuth } from '../store/auth';

/** The one data hook (docs/MOBILE-DESIGN.md §6): loading / error / pull-to-refresh.
 * Re-fetches when sign-in lands — screens mount behind the splash BEFORE the first
 * sign-in completes, so their initial fetch can 403; auth flipping to signedIn
 * retries them all (bit Graham's first run, 2026-07-03). */
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const authStatus = useAuth((s) => s.status);

  const load = useCallback(async () => {
    try {
      const d = await api<T>(path);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Request failed.');
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  // First sign-in on a fresh install: retry anything that fetched pre-auth.
  useEffect(() => {
    if (authStatus === 'signedIn' && error) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { data, error, refreshing, refresh, loading: data === null && error === null };
}
