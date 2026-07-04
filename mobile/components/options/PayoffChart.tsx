import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polyline, Polygon, Text as SvgText } from 'react-native-svg';
import { usePalette, F } from '../../constants/theme';
import { payoffCurve, type Leg } from '../../lib/options/payoff';

/** The payoff diagram (web components/options/PayoffChart, phone-sized): the solid
 * at-expiry P/L line with profit shaded green / loss red, the dashed "today"
 * (Black-Scholes) curve, the zero line, breakeven ticks and the spot marker. */
export default function PayoffChart({
  legs,
  spotCents,
  daysLeft,
  breakevens,
  height = 190,
}: {
  legs: Leg[];
  spotCents: number;
  daysLeft: number;
  breakevens: number[];
  height?: number;
}) {
  const { p } = usePalette();
  const [w, setW] = useState(0);

  const curve = payoffCurve(legs, spotCents, daysLeft, 140);
  const pnls = curve.expiry.map((pt) => pt.p).concat(curve.today ? curve.today.map((pt) => pt.p) : []);
  const pMax = Math.max(...pnls, 0);
  const pMin = Math.min(...pnls, 0);
  const pSpan = pMax - pMin || 1;

  const padL = 6;
  const padR = 6;
  const padY = 14;
  const x = (spot: number) => padL + ((spot - curve.lo) / (curve.hi - curve.lo || 1)) * (w - padL - padR);
  const y = (pnl: number) => padY + (1 - (pnl - pMin) / pSpan) * (height - padY * 2);
  const pts = (arr: { s: number; p: number }[]) => arr.map((pt) => `${x(pt.s).toFixed(1)},${y(pt.p).toFixed(1)}`).join(' ');
  const fmt$ = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;

  // Profit/loss shading: the region between the expiry line and zero, split by sign.
  const zeroY = y(0);
  const shade = (sign: 1 | -1) =>
    curve.expiry
      .map((pt) => ({ s: pt.s, p: sign > 0 ? Math.max(0, pt.p) : Math.min(0, pt.p) }))
      .map((pt) => `${x(pt.s).toFixed(1)},${y(pt.p).toFixed(1)}`)
      .join(' ');

  return (
    <View>
      <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={height}>
            <Polygon points={`${padL},${zeroY} ${shade(1)} ${w - padR},${zeroY}`} fill={p.pos} fillOpacity={0.1} />
            <Polygon points={`${padL},${zeroY} ${shade(-1)} ${w - padR},${zeroY}`} fill={p.neg} fillOpacity={0.1} />
            {/* zero line */}
            <Line x1={padL} y1={zeroY} x2={w - padR} y2={zeroY} stroke={p.cardBorder} strokeWidth={1} />
            {/* the dashed "today" (modeled) curve — what the clock hasn't taken yet */}
            {curve.today && (
              <Polyline points={pts(curve.today)} fill="none" stroke={p.accentText} strokeWidth={1.5} strokeDasharray="5 4" />
            )}
            {/* the solid at-expiry payoff */}
            <Polyline points={pts(curve.expiry)} fill="none" stroke={p.textPrimary} strokeWidth={2} strokeLinejoin="round" />
            {/* breakevens */}
            {breakevens.map((b) => (
              <Line key={b} x1={x(b)} y1={padY} x2={x(b)} y2={height - padY} stroke={p.warn} strokeWidth={1} strokeDasharray="2 3" />
            ))}
            {/* spot marker */}
            <Line x1={x(spotCents)} y1={padY} x2={x(spotCents)} y2={height - padY} stroke={p.textMuted} strokeWidth={1} strokeDasharray="1 4" />
            <SvgText x={2} y={y(pMax) + 3} fill={p.pos} fontSize={9}>+{fmt$(pMax)}</SvgText>
            <SvgText x={2} y={y(pMin) + 3} fill={p.neg} fontSize={9}>−{fmt$(Math.abs(pMin))}</SvgText>
          </Svg>
        )}
      </View>
      <View style={s.xRow}>
        <Text style={[s.xLabel, { color: p.textMuted }]}>{fmt$(curve.lo)}</Text>
        <Text style={[s.xLabel, { color: p.textMuted }]}>spot {fmt$(spotCents)}</Text>
        <Text style={[s.xLabel, { color: p.textMuted }]}>{fmt$(curve.hi)}</Text>
      </View>
      <View style={s.legend}>
        <Text style={[s.legendItem, { color: p.textPrimary }]}>— at expiry</Text>
        {curve.today && <Text style={[s.legendItem, { color: p.accentText }]}>┄ today (modeled)</Text>}
        {breakevens.length > 0 && <Text style={[s.legendItem, { color: p.warn }]}>┆ break-even</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  xRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  xLabel: { fontFamily: F.reg, fontSize: 9 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  legendItem: { fontFamily: F.med, fontSize: 10 },
});
