import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { usePalette, F } from '../../constants/theme';

const tabular = { fontVariant: ['tabular-nums' as const] };

/** The heat meter — "HEAT" label + the 0–100 score (hue-coded) over a bar that
 * fills teal (cool) → the name's heat color (hot). Web components/hunt/HeatMeter. */
export default function HeatMeter({
  heat,
  color,
  barHeight = 7,
}: {
  heat: number;
  color: string; // heatColor(heat) from lib/hunt
  barHeight?: number;
}) {
  const { p } = usePalette();
  const [w, setW] = useState(0);
  // Gradient ids are global across mounted Svg roots — keep each meter's unique.
  const gid = useRef(`hm${Math.random().toString(36).slice(2, 8)}`).current;
  const fill = (Math.min(100, Math.max(0, heat)) / 100) * w;
  return (
    <View>
      <View style={s.head}>
        <Text style={[s.label, { color: p.textMuted }]}>HEAT</Text>
        <Text style={[s.score, tabular, { color }]}>{heat}</Text>
      </View>
      <View
        style={{ height: barHeight, borderRadius: barHeight / 2, backgroundColor: p.cardHi, overflow: 'hidden' }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
      >
        {w > 0 && (
          <Svg width={w} height={barHeight}>
            <Defs>
              <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={p.accent} />
                <Stop offset="1" stopColor={color} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={fill} height={barHeight} rx={barHeight / 2} fill={`url(#${gid})`} />
          </Svg>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 },
  label: { fontFamily: F.semi, fontSize: 9, letterSpacing: 1.5 },
  score: { fontFamily: F.bold, fontSize: 16 },
});
