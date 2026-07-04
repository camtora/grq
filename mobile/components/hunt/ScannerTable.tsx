import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '../Chrome';
import StockLogo from '../StockLogo';
import Sparkline from '../Sparkline';
import ConfidenceGauge from './ConfidenceGauge';
import { livePriceOf, type LiveQuoteMap } from './HuntRow';
import { usePalette, F, type Palette } from '../../constants/theme';
import { money, signedPctFromBps } from '../../lib/format';
import { heatColor, previewText } from '../../lib/hunt';
import type { HuntFind } from '../../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

// Column widths — the grid is wider than the phone; it scrolls sideways in its own
// container (web ScannerTable's min-width, the house rule for wide content).
const W = { heat: 72, ticker: 150, last: 78, chg: 56, spark: 96, conf: 48, thesis: 190 } as const;

/** Scanner — the dense one-row-per-name terminal view (web Direction C).
 * Row tap opens the dossier; watch/dismiss live on the other layouts. */
export default function ScannerTable({ finds, live }: { finds: HuntFind[]; live: LiveQuoteMap }) {
  const { p } = usePalette();
  return (
    <Card style={s.card}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[s.headRow, { borderBottomColor: p.cardBorder, backgroundColor: p.cardHi + '66' }]}>
            <Text style={[s.h, { width: W.heat, color: p.textMuted }]}>HEAT ▾</Text>
            <Text style={[s.h, { width: W.ticker, color: p.textMuted }]}>TICKER</Text>
            <Text style={[s.h, s.right, { width: W.last, color: p.textMuted }]}>LAST</Text>
            <Text style={[s.h, s.right, { width: W.chg, color: p.textMuted }]}>30D</Text>
            <Text style={[s.h, s.center, { width: W.spark, color: p.textMuted }]}>TREND</Text>
            <Text style={[s.h, s.center, { width: W.conf, color: p.textMuted }]}>CONF</Text>
            <Text style={[s.h, { width: W.thesis, color: p.textMuted }]}>THESIS</Text>
          </View>
          {finds.map((f, i) => (
            <ScannerRow key={f.sym} f={f} rank={i + 1} live={live} p={p} last={i === finds.length - 1} />
          ))}
        </View>
      </ScrollView>
    </Card>
  );
}

function ScannerRow({
  f,
  rank,
  live,
  p,
  last,
}: {
  f: HuntFind;
  rank: number;
  live: LiveQuoteMap;
  p: Palette;
  last: boolean;
}) {
  const router = useRouter();
  const color = heatColor(f.heat);
  const chg30Bps = f.change30d != null ? Math.round(f.change30d * 10_000) : null;
  const price = livePriceOf(f, live);

  return (
    <Pressable
      onPress={() => router.push(`/stock/${f.sym}`)}
      style={[s.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.cardBorder }]}
    >
      {/* heat */}
      <View style={{ width: W.heat }}>
        <View style={s.heatHead}>
          <Text style={[s.rank, tabular, { color: p.textMuted }]}>{String(rank).padStart(2, '0')}</Text>
          <Text style={[s.heatVal, tabular, { color }]}>{f.heat}</Text>
        </View>
        <View style={[s.heatTrack, { backgroundColor: p.cardHi }]}>
          <View style={[s.heatFill, { width: `${Math.max(4, f.heat)}%`, backgroundColor: color }]} />
        </View>
      </View>
      {/* ticker */}
      <View style={[s.tickerCell, { width: W.ticker }]}>
        <StockLogo symbol={f.sym} logoUrl={f.logoUrl} size={28} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[s.sym, { color: p.accentText }]}>{f.sym}</Text>
            {rank === 1 && (
              <Text style={[s.hot, { color: p.warn, borderColor: p.warn + '66', backgroundColor: p.warn + '26' }]}>hot</Text>
            )}
          </View>
          {f.name !== f.sym && (
            <Text style={[s.name, { color: p.textMuted }]} numberOfLines={1}>
              {f.name}
            </Text>
          )}
        </View>
      </View>
      {/* last */}
      <Text style={[s.cellText, s.right, tabular, { width: W.last, color: p.textPrimary }]}>
        {price != null ? `${f.currency === 'USD' ? 'US' : ''}${money(price)}` : '—'}
      </Text>
      {/* 30d chg */}
      <Text
        style={[s.cellText, s.right, tabular, { width: W.chg, color: chg30Bps == null ? p.textMuted : chg30Bps >= 0 ? p.pos : p.neg }]}
      >
        {chg30Bps != null ? signedPctFromBps(chg30Bps, 0) : '—'}
      </Text>
      {/* spark */}
      <View style={{ width: W.spark, paddingHorizontal: 4 }}>
        {f.spark.length >= 2 ? (
          <Sparkline values={f.spark} height={28} />
        ) : (
          <Text style={[s.cellText, s.center, { color: p.textMuted }]}>—</Text>
        )}
      </View>
      {/* conf */}
      <View style={{ width: W.conf, alignItems: 'center' }}>
        <ConfidenceGauge value={f.confidence} size={40} label="" />
      </View>
      {/* thesis */}
      <Text style={[s.thesis, { width: W.thesis, color: p.textMuted }]} numberOfLines={3}>
        {previewText(f.body)}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  h: { fontFamily: F.semi, fontSize: 9, letterSpacing: 1 },
  right: { textAlign: 'right' },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  heatHead: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginBottom: 4 },
  rank: { fontFamily: F.semi, fontSize: 10 },
  heatVal: { fontFamily: F.bold, fontSize: 15 },
  heatTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  heatFill: { height: 4, borderRadius: 2 },
  tickerCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sym: { fontFamily: F.semi, fontSize: 13.5 },
  hot: {
    fontFamily: F.bold,
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 0.5,
    overflow: 'hidden',
  },
  name: { fontFamily: F.reg, fontSize: 10, marginTop: 1 },
  cellText: { fontFamily: F.semi, fontSize: 12 },
  thesis: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 14 },
});
