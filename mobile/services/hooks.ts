import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard } from 'react-native';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { api } from './api';
import { useAuth } from '../store/auth';

/** Keep a chat list pinned to the newest message WITHOUT fighting the reader.
 *
 * The old pattern — `onContentSizeChange={() => list.scrollToEnd()}` — force-scrolled
 * to the bottom on EVERY content-size change, so any late re-measure (an avatar image
 * decoding, a markdown fold, the keyboard opening) yanked the view back down mid-drag.
 * You could never scroll up into history, and the list often settled a message short of
 * the true bottom. It bit Graham's thread hardest because his messages render avatars
 * (Cam's own don't), so his thread re-measured more and never sat still.
 *
 * Here we only auto-follow while the reader is ALREADY at the bottom; the moment they
 * scroll up we leave them be. `stick()` forces a jump to the newest message and re-arms
 * auto-follow — call it on load, thread switch, and send. */
export function useStickyScroll<T>(ref: React.RefObject<FlatList<T> | null>) {
  const atBottom = useRef(true);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    // Within ~48px of the end counts as "at the bottom" — leaves slack for the
    // last bubble's padding and sub-pixel rounding.
    atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 48;
  }, []);
  const onContentSizeChange = useCallback(() => {
    if (atBottom.current) ref.current?.scrollToEnd({ animated: false });
  }, [ref]);
  const stick = useCallback(() => {
    atBottom.current = true;
    ref.current?.scrollToEnd({ animated: false });
  }, [ref]);
  return { onScroll, onContentSizeChange, stick };
}

/** The keyboard's overlap with the window, in px — reliable inside modal
 * sheets where KeyboardAvoidingView mis-measures (endCoordinates are window
 * coords, and a sheet's bottom == the window's bottom). */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      const win = Dimensions.get('window').height;
      setH(Math.max(0, win - e.endCoordinates.screenY));
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setH(0));
    return () => {
      sub.remove();
      hide.remove();
    };
  }, []);
  return h;
}

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

  // Silent reload — no spinner. For background polling (e.g. Today every 60s).
  const reload = useCallback(() => load(), [load]);

  return { data, error, refreshing, refresh, reload, loading: data === null && error === null };
}

/** Live quotes for a SET of symbols (the web's LiveQuotesProvider): one
 * /api/quotes poll every 15s while mounted, keyed exactly as requested.
 * Consumers fall back to their server-rendered price on a missing key. */
export function useLiveQuotes(symbols: string[]): Record<string, { priceCents: number; changeBps: number }> {
  const [q, setQ] = useState<Record<string, { priceCents: number; changeBps: number }>>({});
  const key = symbols.join(',');
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const tick = async () => {
      try {
        const d = await api<{ quotes: Record<string, { priceCents: number; changePct: number }> }>(
          `/api/quotes?symbols=${encodeURIComponent(key)}`,
        );
        if (!alive) return;
        const next: Record<string, { priceCents: number; changeBps: number }> = {};
        for (const [sym, row] of Object.entries(d.quotes)) {
          next[sym] = { priceCents: row.priceCents, changeBps: Math.round(row.changePct * 100) };
        }
        setQ(next);
      } catch {
        /* next tick retries */
      }
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [key]);
  return q;
}

/** Live quote poll for one symbol (the web's <LiveQuote>): /api/quotes every
 * 15s while mounted. Returns null until the first tick lands. */
export function useLiveQuote(symbol: string | null): { priceCents: number; changeBps: number } | null {
  const [q, setQ] = useState<{ priceCents: number; changeBps: number } | null>(null);
  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    const tick = async () => {
      try {
        const d = await api<{ quotes: Record<string, { priceCents: number; changePct: number }> }>(
          `/api/quotes?symbols=${encodeURIComponent(symbol)}`,
        );
        const row = d.quotes[symbol] ?? Object.values(d.quotes)[0];
        if (alive && row) setQ({ priceCents: row.priceCents, changeBps: Math.round(row.changePct * 100) });
      } catch {
        /* next tick retries */
      }
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [symbol]);
  return q;
}
