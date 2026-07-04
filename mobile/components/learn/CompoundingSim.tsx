import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { usePalette, F, type Palette } from '../../constants/theme';
import { money } from '../../lib/format';

const tabular = { fontVariant: ['tabular-nums' as const] };

/** The compounding machine (web components/learn/CompoundingSim, D110 Phase 2) —
 * monthly contributions compounding at a chosen return over chosen years, with a
 * fee-drag line showing what an MER quietly eats. Same integer-cents math as the
 * web; sliders are pure-JS PanResponder tracks (no native dep), and tapping the
 * chart pins a year's numbers. */

type YearPoint = { y: number; contrib: number; val: number; valFee: number };

function series(monthlyCents: number, retPct: number, feePct: number, years: number): YearPoint[] {
  const out: YearPoint[] = [{ y: 0, contrib: 0, val: 0, valFee: 0 }];
  let val = 0;
  let valFee = 0;
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      val += monthlyCents;
      valFee += monthlyCents;
      val += Math.round((val * retPct) / 1200);
      valFee += Math.round((valFee * (retPct - feePct)) / 1200);
    }
    out.push({ y, contrib: monthlyCents * 12 * y, val, valFee });
  }
  return out;
}

const fmtK = (c: number) => (c >= 100_000_000 ? `$${(c / 100_000_000).toFixed(1)}M` : c >= 100_000 ? `$${Math.round(c / 100_000)}k` : money(c));

/** Pure-JS slider: a PanResponder track — drag or tap anywhere on it. */
function Slider({ label, min, max, step, value, onChange, p }: { label: string; min: number; max: number; step: number; value: number; onChange: (n: number) => void; p: Palette }) {
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  wRef.current = w;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => set(e.nativeEvent.locationX),
      onPanResponderMove: (e) => set(e.nativeEvent.locationX),
    }),
  ).current;
  const set = (x: number) => {
    const width = wRef.current;
    if (width <= 0) return;
    const frac = Math.min(1, Math.max(0, x / width));
    const raw = min + frac * (max - min);
    onChange(Math.round(raw / step) * step);
  };
  const frac = (value - min) / (max - min || 1);
  return (
    <View style={{ flex: 1, minWidth: 130 }}>
      <Text style={[sl.label, tabular, { color: p.textPrimary }]}>{label}</Text>
      <View {...pan.panHandlers} style={sl.hit} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <View style={[sl.track, { backgroundColor: p.cardHi }]}>
          <View style={[sl.fill, { width: `${frac * 100}%`, backgroundColor: p.accent + '88' }]} />
        </View>
        <View style={[sl.thumb, { left: Math.max(0, frac * w - 8), backgroundColor: p.accent }]} />
      </View>
    </View>
  );
}

const sl = StyleSheet.create({
  label: { fontFamily: F.semi, fontSize: 11 },
  hit: { height: 28, justifyContent: 'center', marginTop: 2 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  thumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8 },
});

const CHART_H = 190;
const PAD = { top: 12, right: 8, bottom: 20, left: 40 };

export default function CompoundingSim() {
  const { p } = usePalette();
  const [monthly, setMonthly] = useState(200);
  const [ret, setRet] = useState(7);
  const [years, setYears] = useState(25);
  const [fee, setFee] = useState(2);
  const [pin, setPin] = useState<number | null>(null); // pinned year
  const [w, setW] = useState(0);

  const pts = useMemo(() => series(monthly * 100, ret, fee, years), [monthly, ret, fee, years]);
  const last = pts[pts.length - 1];
  const yMax = Math.max(last.val, last.contrib, 1);

  const X = (y: number) => PAD.left + (y / years) * (w - PAD.left - PAD.right);
  const Y = (c: number) => PAD.top + (CHART_H - PAD.top - PAD.bottom) * (1 - c / yMax);
  const line = (pick: (pt: YearPoint) => number) => pts.map((pt) => `${X(pt.y).toFixed(1)},${Y(pick(pt)).toFixed(1)}`).join(' ');

  const hp = pin !== null && pin >= 0 && pin <= years ? pts[pin] : null;
  const onChartPress = (x: number) => {
    const y = Math.round(((x - PAD.left) / (w - PAD.left - PAD.right)) * years);
    setPin(y >= 0 && y <= years ? y : null);
  };
  const xTickEvery = years > 30 ? 10 : 5;

  return (
    <View style={[s2.box, { borderColor: p.cardBorder, backgroundColor: p.cardHi + '33' }]}>
      <Text style={[s2.title, { color: p.accentText }]}>THE COMPOUNDING MACHINE</Text>

      {/* legend — identity never colour-alone */}
      <View style={s2.legend}>
        <Text style={[s2.legendItem, { color: p.pos }]}>— value at {ret}%</Text>
        {fee > 0 && <Text style={[s2.legendItem, { color: p.warn }]}>— after {fee}% fees</Text>}
        <Text style={[s2.legendItem, { color: p.textMuted }]}>┄ contributions</Text>
      </View>

      <Pressable
        style={{ height: CHART_H, marginTop: 6 }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onPress={(e) => onChartPress(e.nativeEvent.locationX)}
      >
        {w > 0 && (
          <Svg width={w} height={CHART_H}>
            {/* baseline + y labels */}
            <Line x1={PAD.left} y1={CHART_H - PAD.bottom} x2={w - PAD.right} y2={CHART_H - PAD.bottom} stroke={p.cardBorder} strokeWidth={1} />
            <SvgText x={2} y={Y(yMax) + 8} fill={p.textMuted} fontSize={9}>{fmtK(yMax)}</SvgText>
            <SvgText x={2} y={Y(yMax / 2) + 3} fill={p.textMuted} fontSize={9}>{fmtK(yMax / 2)}</SvgText>
            {pts
              .filter((pt) => pt.y > 0 && pt.y % xTickEvery === 0)
              .map((pt) => (
                <SvgText key={pt.y} x={X(pt.y)} y={CHART_H - 6} textAnchor="middle" fill={p.textMuted} fontSize={9}>
                  {pt.y}y
                </SvgText>
              ))}
            {/* series */}
            <Polyline points={line((pt) => pt.contrib)} fill="none" stroke={p.textMuted} strokeWidth={1.5} strokeDasharray="5 4" />
            {fee > 0 && <Polyline points={line((pt) => pt.valFee)} fill="none" stroke={p.warn} strokeWidth={2} />}
            <Polyline points={line((pt) => pt.val)} fill="none" stroke={p.pos} strokeWidth={2} />
            {/* pinned year */}
            {hp && (
              <>
                <Line x1={X(hp.y)} y1={PAD.top} x2={X(hp.y)} y2={CHART_H - PAD.bottom} stroke={p.textMuted} strokeWidth={1} strokeDasharray="2 3" />
                <Circle cx={X(hp.y)} cy={Y(hp.val)} r={4} fill={p.pos} />
                {fee > 0 && <Circle cx={X(hp.y)} cy={Y(hp.valFee)} r={4} fill={p.warn} />}
                <Circle cx={X(hp.y)} cy={Y(hp.contrib)} r={3} fill={p.textMuted} />
              </>
            )}
          </Svg>
        )}
      </Pressable>
      {hp ? (
        <Text style={[s2.pinLine, tabular, { color: p.textMuted }]}>
          <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>Year {hp.y}:</Text> put in {money(hp.contrib)} ·{' '}
          <Text style={{ color: p.pos }}>value {money(hp.val)}</Text>
          {fee > 0 && (
            <Text style={{ color: p.warn }}> · after fees {money(hp.valFee)}</Text>
          )}
        </Text>
      ) : (
        <Text style={[s2.pinLine, { color: p.textMuted }]}>tap the chart to pin a year</Text>
      )}

      {/* the dials */}
      <View style={s2.sliders}>
        <Slider label={`$${monthly}/month`} min={50} max={1000} step={50} value={monthly} onChange={setMonthly} p={p} />
        <Slider label={`${ret}% / year`} min={0} max={12} step={0.5} value={ret} onChange={setRet} p={p} />
        <Slider label={`${years} years`} min={5} max={40} step={1} value={years} onChange={setYears} p={p} />
        <Slider label={fee > 0 ? `${fee}% fee drag` : 'no fees'} min={0} max={2.5} step={0.25} value={fee} onChange={setFee} p={p} />
      </View>

      {/* the punchline numbers */}
      <View style={s2.statsRow}>
        {(
          [
            ['PUT IN', money(last.contrib), undefined],
            ['END VALUE', money(last.val), p.pos],
            ['GROWTH', money(last.val - last.contrib), undefined],
            ['LOST TO FEES', fee > 0 ? money(last.val - last.valFee) : '—', p.warn],
          ] as const
        ).map(([k, v, tone]) => (
          <View key={k} style={s2.statCell}>
            <Text style={[s2.statLabel, { color: p.textMuted }]}>{k}</Text>
            <Text style={[s2.statValue, tabular, { color: tone ?? p.textPrimary }]}>{v}</Text>
          </View>
        ))}
      </View>

      <Text style={[s2.foot, { color: p.textMuted }]}>
        A smooth {ret}% every year exists nowhere — real returns arrive lumpy (Course 5). The arithmetic still
        holds over time, which is the point.
      </Text>
    </View>
  );
}

const s2 = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 },
  title: { fontFamily: F.bold, fontSize: 9.5, letterSpacing: 1.5 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  legendItem: { fontFamily: F.med, fontSize: 10 },
  pinLine: { fontFamily: F.reg, fontSize: 10.5, marginTop: 4 },
  sliders: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  statCell: { width: '50%', paddingVertical: 4 },
  statLabel: { fontFamily: F.semi, fontSize: 8, letterSpacing: 0.8 },
  statValue: { fontFamily: F.semi, fontSize: 14, marginTop: 2 },
  foot: { fontFamily: F.reg, fontSize: 9.5, lineHeight: 13, marginTop: 10 },
});
