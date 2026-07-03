import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useAuth } from '../store/auth';

/** The one data hook (docs/MOBILE-DESIGN.md §6): loading / error / pull-to-refresh.
 *
 * Cold-boot rules (Cam 2026-07-03 — no error may ever flash before auth settles):
 * - screens mount behind the splash and fetch immediately, racing auth hydration;
 * - a failed initial fetch retries QUIETLY (3 attempts, backing off) and the screen
 *   stays in `loading` the whole time — transient 403s/502s never paint;
 * - while auth is still hydrating, keep retrying rather than erroring at all;
 * - when sign-in lands, anything without data refetches fresh. */
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const attempts = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authStatus = useAuth((s) => s.status);
  const authRef = useRef(authStatus);
  authRef.current = authStatus;
  const dataRef = useRef<T | null>(null);

  const load = useCallback(
    async (isRetry = false) => {
      if (!isRetry) attempts.current = 0;
      try {
        const d = await api<T>(path);
        if (!alive.current) return;
        dataRef.current = d;
        setData(d);
        setError(null);
      } catch (e) {
        if (!alive.current) return;
        attempts.current += 1;
        const authSettling = authRef.current === 'loading';
        // Quiet retries: 3 on a settled session, effectively-until-settled while
        // auth is still hydrating (capped so a signed-out idle app goes quiet).
        if ((attempts.current < 3 || authSettling) && attempts.current < 8) {
          retryTimer.current = setTimeout(() => {
            if (alive.current) load(true);
          }, Math.min(1200 * attempts.current, 5000));
          return; // stay in `loading` — no error flash
        }
        setError(e instanceof Error ? e.message : 'Request failed.');
      }
    },
    [path],
  );

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [load]);

  // First sign-in on a fresh install (or a session that expired): anything that
  // hasn't loaded real data yet refetches with the new token.
  useEffect(() => {
    if (authStatus === 'signedIn' && dataRef.current === null) {
      setError(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { data, error, refreshing, refresh, loading: data === null && error === null };
}
