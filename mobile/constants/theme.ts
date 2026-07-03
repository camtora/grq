import { useColorScheme } from 'react-native';
import { useAuth } from '../store/auth';
import { useThemeStore } from '../store/theme';

/**
 * GRQ palette — ported from ios/GRQ/Theme/Theme.swift (which itself mirrors
 * web shared tokens). THEME IS MEMBER-KEYED: Cam = light, Graham = dark
 * (me.theme from /api/auth/me); device scheme is only the pre-sign-in fallback.
 * docs/MOBILE-DESIGN.md §1.
 */
export type Palette = {
  bodyBg: string;
  cardBg: string;
  cardHi: string;
  cardBorder: string;
  textPrimary: string;
  textMuted: string;
  accent: string;
  accentText: string;
  pos: string;
  neg: string;
  warn: string;
  glow: string;
};

export const dark: Palette = {
  bodyBg: '#060d0c',
  cardBg: '#0e1a18',
  cardHi: '#152824',
  cardBorder: 'rgba(45, 212, 191, 0.22)',
  textPrimary: '#e9fbf6',
  textMuted: '#8fbfb6',
  accent: '#2dd4bf',
  accentText: '#5eead4',
  pos: '#34d399',
  neg: '#f87171',
  warn: '#fbbf24',
  glow: 'rgba(20, 184, 166, 0.20)',
};

export const light: Palette = {
  bodyBg: '#eef6f4',
  cardBg: '#ffffff',
  cardHi: '#ffffff',
  cardBorder: 'rgba(13, 148, 136, 0.16)',
  textPrimary: '#08231f',
  textMuted: '#5b837c',
  accent: '#0d9488',
  accentText: '#0f766e',
  pos: '#059669',
  neg: '#dc2626',
  warn: '#b45309',
  glow: 'rgba(13, 148, 136, 0.12)',
};

export const brandAccent = '#14b8a6';

/** Font tokens (docs/MOBILE-DESIGN.md §2). RN custom fonts ignore fontWeight —
 * always set the exact family. Display = Space Grotesk, UI/body = Inter. */
export const F = {
  display: 'SpaceGrotesk_700Bold',
  displayMed: 'SpaceGrotesk_600SemiBold',
  black: 'Inter_800ExtraBold',
  bold: 'Inter_700Bold',
  semi: 'Inter_600SemiBold',
  med: 'Inter_500Medium',
  reg: 'Inter_400Regular',
} as const;

export function usePalette(): { p: Palette; scheme: 'light' | 'dark' } {
  const device = useColorScheme() === 'light' ? 'light' : 'dark';
  const memberTheme = useAuth((s) => s.me?.theme);
  const override = useThemeStore((s) => s.override);
  const scheme =
    override ?? (memberTheme === 'light' || memberTheme === 'dark' ? memberTheme : device);
  return { p: scheme === 'light' ? light : dark, scheme };
}
