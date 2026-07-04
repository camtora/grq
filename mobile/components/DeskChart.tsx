import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polyline, Text as SvgText } from 'react-native-svg';
import { usePalette, F } from '../constants/theme';

export type ChartSeries = {
  label: string;
  color: string;
  points: { at: string; returnPct: number }[];
};

/** Return-over-time, multiple arms on one axis (the web BullChart, phone-sized):
 * time-scaled x, a dashed zero line, min/max/zero % labels, legend below. */
export default function DeskChart({ series, height = 170 }: { series: ChartSeries[]; height?: number }) {
  const { p } = usePalette();
  const [w, setW] = useState(0);

  const all = series.flatMap((sr) => sr.points);
  if (all.length < 2) {
    return (
      <View style={[s.emptyBox, { height, borderColor: p.cardBorder }]}>
        <Text style={{ color: p.textMuted, fontFamily: F.reg, fontSize: 11 }}>
          the chart draws once a couple of NAV snapshots land
        </Text>
      </View>
    );
  }

  const times = all.map((pt) => Date.parse(pt.at));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const tSpan = t1 - t0 || 1;
  const vals = all.map((pt) => pt.returnPct);
  const vMax = Math.max(...vals, 0);
  const vMin = Math.min(...vals, 0);
  const vSpan = vMax - vMin || 1;

  const padL = 34;
  const padR = 8;
  const padY = 12;
  const x = (t: number) => padL + ((t - t0) / tSpan) * (w - padL - padR);
  const y = (v: number) => padY + (1 - (v - vMin) / vSpan) * (height - padY * 2);
  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  const dateOf = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <View>
      <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={height}>
            {/* zero line */}
            <Line x1={padL} y1={y(0)} x2={w - padR} y2={y(0)} stroke={p.cardBorder} strokeWidth={1} strokeDasharray="4 4" />
            {series.map((sr) =>
              sr.points.length >= 2 ? (
                <Polyline
                  key={sr.label}
                  points={sr.points.map((pt) => `${x(Date.parse(pt.at)).toFixed(1)},${y(pt.returnPct).toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke={sr.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null,
            )}
            <SvgText x={2} y={y(vMax) + 3} fill={p.textMuted} fontSize={9}>{fmt(vMax)}</SvgText>
            <SvgText x={2} y={y(0) + 3} fill={p.textMuted} fontSize={9}>0%</SvgText>
            <SvgText x={2} y={y(vMin) + 3} fill={p.textMuted} fontSize={9}>{fmt(vMin)}</SvgText>
          </Svg>
        )}
      </View>
      <View style={s.xRow}>
        <Text style={[s.xLabel, { color: p.textMuted }]}>{dateOf(t0)}</Text>
        <Text style={[s.xLabel, { color: p.textMuted }]}>{dateOf(t1)}</Text>
      </View>
      <View style={s.legend}>
        {series.map((sr) => (
          <View key={sr.label} style={s.legendItem}>
            <View style={[s.dot, { backgroundColor: sr.color }]} />
            <Text style={[s.legendText, { color: p.textMuted }]}>{sr.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  emptyBox: { borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  xRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 34, paddingRight: 8, marginTop: 2 },
  xLabel: { fontFamily: F.reg, fontSize: 9 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: F.med, fontSize: 10.5 },
});
