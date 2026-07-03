import { useColorScheme } from 'react-native';

/**
 * GRQ palette — ported from ios/GRQ/Theme/Theme.swift (which itself mirrors
 * web shared tokens). Cam runs light, Graham runs dark.
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
  glow: 'rgba(13, 148, 136, 0.12)',
};

export const brandAccent = '#14b8a6';

export function usePalette(): { p: Palette; scheme: 'light' | 'dark' } {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  return { p: scheme === 'light' ? light : dark, scheme };
}
