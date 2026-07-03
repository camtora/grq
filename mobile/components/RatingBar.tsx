import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { usePalette, F, type Palette } from '../constants/theme';

/** The 7-point rating slider — port of web components/RatingBar.tsx.
 * Red→amber→emerald track, needle at pos (0..1), the bear guarding the sell
 * end and the bull the buy end. Drives Alfred's CALL so the headline and the
 * needle always agree. */
export function toneColor(tone: string | null | undefined, p: Palette): string {
  if (tone === 'emerald') return p.pos;
  if (tone === 'red') return p.neg;
  if (tone === 'amber') return p.warn;
  return p.accentText;
}

export default function RatingBar({
  label,
  tone,
  pos,
  note,
  hideLabel = false,
  mascots = false,
}: {
  label: string;
  tone: string | null;
  pos: number; // 0..1
  note?: string;
  hideLabel?: boolean;
  mascots?: boolean;
}) {
  const { p } = usePalette();
  const left = Math.max(3, Math.min(97, pos * 100));

  return (
    <View>
      {(!hideLabel || note) && (
        <View style={[s.labelRow, hideLabel && { justifyContent: 'flex-end' }]}>
          {!hideLabel && (
            <Text style={[s.label, { color: toneColor(tone, p) }]}>{label}</Text>
          )}
          {note && <Text style={[s.note, { color: p.textMuted }]}>{note}</Text>}
        </View>
      )}
      <View style={s.trackRow}>
        {mascots && (
          <Image source={require('../assets/bear-splash.png')} style={s.mascot} resizeMode="contain" />
        )}
        <View style={s.track}>
          <Svg width="100%" height={12} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="rb" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#ef4444" stopOpacity="0.55" />
                <Stop offset="0.5" stopColor="#fbbf24" stopOpacity="0.45" />
                <Stop offset="1" stopColor="#10b981" stopOpacity="0.55" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="12" rx="6" fill="url(#rb)" />
          </Svg>
          <View style={[s.needle, { left: `${left}%`, backgroundColor: p.bodyBg }]} />
        </View>
        {mascots && (
          <Image source={require('../assets/bull-splash.png')} style={s.mascot} resizeMode="contain" />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontFamily: F.black, fontSize: 24 },
  note: { fontFamily: F.semi, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 12, justifyContent: 'center' },
  needle: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#ffffff',
    marginLeft: -9,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  mascot: { width: 30, height: 22 },
});
