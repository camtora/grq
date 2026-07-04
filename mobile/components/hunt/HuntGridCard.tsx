import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '../Chrome';
import StockLogo from '../StockLogo';
import Sparkline from '../Sparkline';
import HeatMeter from './HeatMeter';
import ConfidenceGauge from './ConfidenceGauge';
import { FindActions } from './shared';
import { livePriceOf, type LiveQuoteMap } from './HuntRow';
import { usePalette, F } from '../../constants/theme';
import { money, signedPctFromBps } from '../../lib/format';
import { heatColor, previewText } from '../../lib/hunt';
import type { HuntFind } from '../../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

/** Top Pick's grid tile for the non-#1 finds (web HuntGridCard): identity +
 * live price, a small area spark, gauge + heat meter, 2-line thesis, actions. */
export default function HuntGridCard({
  f,
  live,
  onChanged,
}: {
  f: HuntFind;
  live: LiveQuoteMap;
  onChanged: () => void;
}) {
  const { p } = usePalette();
  const router = useRouter();
  const color = heatColor(f.heat);
  const chg30Bps = f.change30d != null ? Math.round(f.change30d * 10_000) : null;
  const price = livePriceOf(f, live);

  return (
    <Card style={s.card}>
      <View style={s.strip}>
        <View style={[s.stripHalf, { backgroundColor: p.accent }]} />
        <View style={[s.stripHalf, { backgroundColor: color }]} />
      </View>
      <View style={s.headRow}>
        <Pressable onPress={() => router.push(`/stock/${f.sym}`)} hitSlop={6} style={s.identity}>
          <StockLogo symbol={f.sym} logoUrl={f.logoUrl} size={32} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.sym, { color: p.accentText }]}>{f.sym}</Text>
            {f.name !== f.sym && (
              <Text style={[s.name, { color: p.textMuted }]} numberOfLines={1}>
                {f.name}
              </Text>
            )}
          </View>
        </Pressable>
        <View style={{ alignItems: 'flex-end' }}>
          {price != null && (
            <Text style={[s.price, tabular, { color: p.textPrimary }]}>
              {f.currency === 'USD' ? 'US' : ''}
              {money(price)}
            </Text>
          )}
          {chg30Bps != null && (
            <Text style={[s.chg, tabular, { color: chg30Bps >= 0 ? p.pos : p.neg }]}>
              {signedPctFromBps(chg30Bps, 0)}
            </Text>
          )}
        </View>
      </View>

      {f.spark.length >= 2 ? (
        <View style={{ marginTop: 10 }}>
          <Sparkline values={f.spark} height={38} area />
        </View>
      ) : (
        <View style={s.noHistory}>
          <Text style={[s.metaText, { color: p.textMuted }]}>no history yet</Text>
        </View>
      )}

      <View style={s.gaugeRow}>
        <ConfidenceGauge value={f.confidence} size={50} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <HeatMeter heat={f.heat} color={color} />
        </View>
      </View>

      <Text style={[s.preview, { color: p.textMuted }]} numberOfLines={2}>
        {previewText(f.body)}
      </Text>

      <View style={{ marginTop: 10 }}>
        <FindActions find={f} p={p} onChanged={onChanged} iconOnly />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  card: { overflow: 'hidden', paddingTop: 15 },
  strip: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, flexDirection: 'row' },
  stripHalf: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sym: { fontFamily: F.semi, fontSize: 15 },
  name: { fontFamily: F.reg, fontSize: 10.5, marginTop: 1 },
  price: { fontFamily: F.semi, fontSize: 13.5 },
  chg: { fontFamily: F.semi, fontSize: 11, marginTop: 1 },
  noHistory: { height: 38, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  preview: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  metaText: { fontFamily: F.reg, fontSize: 10.5 },
});
