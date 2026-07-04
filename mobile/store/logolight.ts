import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { api } from '../services/api';

/** White-logo verdicts (web StockLogo parity): many FMP marks are white glyphs
 * on transparency — invisible on the white chip. The web measures luminance on
 * a client canvas; RN has no canvas, so the SERVER measures once
 * (/api/logo-meta, sharp) and we cache verdicts here forever (logos are static).
 * Components call want(url); verdicts land in a debounced batch. */

const KEY = 'grq_light_logos_v1';
const isFmp = (url: string) => url.includes('financialmodelingprep.com');

type State = {
  verdicts: Record<string, boolean>;
  want: (url: string) => void;
};

let hydrated = false;
let pending = new Set<string>();
const asked = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function hydrate() {
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      // Server-fetched verdicts that raced hydration win over the stored copy.
      useLogoLight.setState((s) => ({ verdicts: { ...(JSON.parse(raw) as Record<string, boolean>), ...s.verdicts } }));
    }
  } catch {
    /* start empty */
  }
}

async function flush() {
  timer = null;
  const batch = [...pending].slice(0, 48);
  pending = new Set([...pending].filter((u) => !batch.includes(u)));
  if (!batch.length) return;
  try {
    const d = await api<{ light: Record<string, boolean> }>(
      `/api/logo-meta?urls=${encodeURIComponent(batch.join(','))}`,
    );
    const merged = { ...useLogoLight.getState().verdicts, ...d.light };
    useLogoLight.setState({ verdicts: merged });
    AsyncStorage.setItem(KEY, JSON.stringify(merged)).catch(() => {});
  } catch {
    // Transient (or a pre-deploy 404) — allow a retry on the next mount.
    batch.forEach((u) => asked.delete(u));
  }
  if (pending.size && !timer) timer = setTimeout(flush, 400);
}

export const useLogoLight = create<State>((set, get) => ({
  verdicts: {},
  want: (url) => {
    if (!isFmp(url)) return; // only FMP marks are measured (web parity)
    if (!hydrated) void hydrate();
    if (url in get().verdicts || asked.has(url)) return;
    asked.add(url);
    pending.add(url);
    if (!timer) timer = setTimeout(flush, 400);
  },
}));
