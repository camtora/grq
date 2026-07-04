import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '../Chrome';
import StockLogo from '../StockLogo';
import Sparkline from '../Sparkline';
import MdText from '../MdText';
import HeatMeter from './HeatMeter';
import ConfidenceGauge from './ConfidenceGauge';
import { FindActions } from './shared';
import { livePriceOf, type LiveQuoteMap } from './HuntRow';
import { usePalette, F } from '../../constants/theme';
import { money, signedPctFromBps } from '../../lib/format';
import { heatColor, wordCount } from '../../lib/hunt';
import type { HuntFind } from '../../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

/** Top Pick — the #1 find blown up (web HuntHero, phone-sized): hottest-pick pill,
 * big identity + live price, the 30-day area chart, gauge + heat meter, the full
 * thesis, actions. */
export default function HuntHero({
  f,
  live,
  onChanged,
  onDismissed,
}: {
  f: HuntFind;
  live: LiveQuoteMap;
  onChanged: () => void;
  onDismissed: (sym: string) => void;
}) {
  const { p } = usePalette();
  const router = useRouter();
  const color = heatColor(f.heat);
  const chg30Bps = f.change30d != null ? Math.round(f.change30d * 10_000) : null;
  const price = livePriceOf(f, live);

  return (
    <Card style={[s.hero, { borderColor: p.warn + '40' }]}>
      {/* heat gradient strip along the top (web's 3px accent) */}
      <View style={s.strip}>
        <View style={[s.stripHalf, { backgroundColor: p.accent }]} />
        <View style={[s.stripHalf, { backgroundColor: color }]} />
      </View>

      <View style={s.pillRow}>
        <Text style={[s.hottestPill, { color: p.warn, borderColor: p.warn + '66', backgroundColor: p.warn + '26' }]}>
          ▲ Hottest pick
        </Text>
        <Text style={[s.rankLine, tabular, { color: p.textMuted }]}>RANK 01 · HEAT {f.heat}</Text>
      </View>

      <Pressable onPress={() => router.push(`/stock/${f.sym}`)} style={s.identity}>
        <StockLogo symbol={f.sym} logoUrl={f.logoUrl} size={50} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.bigSym, { color: p.textPrimary }]}>{f.sym}</Text>
          <Text style={[s.nameLine, { color: p.textMuted }]} numberOfLines={1}>
            {[f.name !== f.sym ? f.name : null, f.tag].filter(Boolean).join(' · ') || f.sym}
          </Text>
        </View>
      </Pressable>

      <View style={s.priceRow}>
        {price != null && (
          <Text style={[s.bigPrice, tabular, { color: p.textPrimary }]}>
            {f.currency === 'USD' ? 'US' : ''}
            {money(price)}
          </Text>
        )}
        {chg30Bps != null && (
          <Text style={[s.chg, tabular, { color: chg30Bps >= 0 ? p.pos : p.neg }]}>
            {signedPctFromBps(chg30Bps, 0)} <Text style={{ color: p.textMuted, fontSize: 10 }}>30d</Text>
          </Text>
        )}
      </View>

      <View style={[s.chartBox, { borderColor: p.cardBorder, backgroundColor: p.cardHi + '66' }]}>
        <Text style={[s.microLabel, { color: p.textMuted }]}>30-DAY PRICE</Text>
        {f.spark.length >= 2 ? (
          <Sparkline values={f.spark} height={120} area />
        ) : (
          <View style={s.noHistory}>
            <Text style={[s.metaText, { color: p.textMuted }]}>no price history yet</Text>
          </View>
        )}
      </View>

      <View style={s.gaugeRow}>
        <ConfidenceGauge value={f.confidence} size={92} label="CONFIDENCE" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <HeatMeter heat={f.heat} color={color} barHeight={10} />
          <Text style={[s.metaText, { color: p.textMuted, marginTop: 8 }]}>
            {wordCount(f.body).toLocaleString()} words of thesis · heat is Alfred&apos;s derived read
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <MdText body={f.body} />
      </View>

      <View style={{ marginTop: 14 }}>
        <FindActions find={f} p={p} onChanged={onChanged} onDismissed={onDismissed} withDismiss />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  hero: { overflow: 'hidden', paddingTop: 18 },
  strip: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, flexDirection: 'row' },
  stripHalf: { flex: 1 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  hottestPill: {
    fontFamily: F.bold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  rankLine: { fontFamily: F.semi, fontSize: 11 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bigSym: { fontFamily: 'System', fontWeight: '800', fontSize: 30, letterSpacing: -0.5 },
  nameLine: { fontFamily: F.reg, fontSize: 12, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 12 },
  bigPrice: { fontFamily: F.semi, fontSize: 24 },
  chg: { fontFamily: F.semi, fontSize: 14 },
  chartBox: { borderWidth: 1, borderRadius: 14, padding: 10, marginTop: 12 },
  noHistory: { height: 120, alignItems: 'center', justifyContent: 'center' },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
  microLabel: { fontFamily: F.semi, fontSize: 9, letterSpacing: 1.5, marginBottom: 4 },
  metaText: { fontFamily: F.reg, fontSize: 11, lineHeight: 15 },
});
