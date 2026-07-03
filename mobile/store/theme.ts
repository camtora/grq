import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/** Appearance override (Cam 2026-07-03): the member's theme is the DEFAULT
 * (Cam light · Graham dark), but it's settable — the override persists on
 * this device. null = use the member default. */
type ThemeOverride = 'light' | 'dark' | null;

type ThemeState = {
  override: ThemeOverride;
  hydrate: () => Promise<void>;
  setOverride: (v: ThemeOverride) => Promise<void>;
};

const KEY = 'grq_theme_override';

export const useThemeStore = create<ThemeState>((set) => ({
  override: null,
  hydrate: async () => {
    try {
      const v = await AsyncStorage.getItem(KEY);
      set({ override: v === 'light' || v === 'dark' ? v : null });
    } catch {
      /* default wins */
    }
  },
  setOverride: async (v) => {
    set({ override: v });
    try {
      if (v) await AsyncStorage.setItem(KEY, v);
      else await AsyncStorage.removeItem(KEY);
    } catch {
      /* in-memory only, then */
    }
  },
}));
