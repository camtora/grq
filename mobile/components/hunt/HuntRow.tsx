import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '../Chrome';
import StockLogo from '../StockLogo';
import Sparkline from '../Sparkline';
import MdText from '../MdText';
import { FindActions } from './shared';
import { usePalette, F, type Palette } from '../../constants/theme';
import { money, signedPctFromBps } from '../../lib/format';
import { heatColor, obscurityLabel, previewText, wordCount } from '../../lib/hunt';
import type { HuntFind } from '../../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

export type LiveQuoteMap = Record<string, { priceCents: number; changeBps: number }>;

export function livePriceOf(f: HuntFind, live: LiveQuoteMap): number | null {
  return live[f.quoteSymbol ?? f.sym]?.priceCents ?? f.cur;
}

/** One find as a Heat Board row (web HuntRow, phone-sized): heat rail + rank,
 * identity, live price + 30d + tag, the labeled heat meter, a 3-line thesis with
 * "read all (N words)", obscurity + conviction. Expand = sparkline, targets, the
 * full thesis, sources, actions. Leads, not verdicts — never a Buy/Hold/Sell. */
export default function HuntRow({
  f,
  rank,
  live,
  onChanged,
  onDismissed,
}: {
  f: HuntFind;
  rank: number;
  live: LiveQuoteMap;
  onChanged: () => void;
  onDismissed: (sym: string) => void;
}) {
  const { p } = usePalette();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const color = heatColor(f.heat);
  const obs = obscurityLabel(f.obscurity);
  const chg30Bps = f.change30d != null ? Math.round(f.change30d * 10_000) : null;
  const price = livePriceOf(f, live);
  const words = wordCount(f.body);

  return (
    <Card style={s.findCard}>
      {/* heat-colored left rail — the board's signature */}
      <View style={[s.rail, { backgroundColor: color }]} />
      <Pressable onPress={() => setOpen(!open)} style={s.findBody}>
        <View style={s.headRow}>
          <Text style={[s.rank, tabular, { color }]}>{String(rank).padStart(2, '0')}</Text>
          <Pressable onPress={() => router.push(`/stock/${f.sym}`)} hitSlop={6} style={s.identity}>
            <StockLogo symbol={f.sym} logoUrl={f.logoUrl} size={32} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.symRow}>
                <Text style={[s.sym, { color: p.accentText }]}>{f.sym}</Text>
                {rank === 1 && (
                  <Text style={[s.hottest, { color: p.warn, borderColor: p.warn + '66', backgroundColor: p.warn + '26' }]}>
                    ▲ hottest
                  </Text>
                )}
              </View>
              <Text style={[s.name, { color: p.textMuted }]} numberOfLines={1}>
                {f.name !== f.sym ? f.name : f.tag ?? ''}
              </Text>
            </View>
          </Pressable>
          <View style={s.heatCol}>
            <Text style={[s.heatVal, tabular, { color }]}>{f.heat}</Text>
            <Text style={[s.microLabel, { color: p.textMuted }]}>HEAT</Text>
          </View>
        </View>

        {/* heat meter */}
        <View style={[s.heatTrack, { backgroundColor: p.cardHi }]}>
          <View style={[s.heatFill, { width: `${Math.max(4, f.heat)}%`, backgroundColor: color }]} />
        </View>

        <View style={s.metaRow}>
          {price != null && (
            <Text style={[s.price, tabular, { color: p.textPrimary }]}>
              {f.currency === 'USD' ? 'US' : ''}
              {money(price)}
            </Text>
          )}
          {chg30Bps != null && (
            <Text style={[s.chg, tabular, { color: chg30Bps >= 0 ? p.pos : p.neg }]}>
              {signedPctFromBps(chg30Bps, 0)} / 30d
            </Text>
          )}
          {f.tag && <Text style={[s.tag, { color: p.textMuted }]}>{f.tag}</Text>}
        </View>

        {!open && (
          <Text style={[s.preview, { color: p.textMuted }]} numberOfLines={3}>
            {previewText(f.body)}
          </Text>
        )}

        <View style={s.badgeRow}>
          {obs && (
            <Text style={[s.obsPill, { color: p.warn, borderColor: p.warn + '40', backgroundColor: p.warn + '14' }]}>
              {obs}
            </Text>
          )}
          {f.confidence != null && (
            <Text style={[s.metaText, tabular, { color: p.textMuted }]}>conviction {f.confidence}%</Text>
          )}
          <Text style={[s.metaText, { color: p.accentText, marginLeft: 'auto' }]}>
            {open ? '▾ collapse' : `▸ read all (${words.toLocaleString()} words)`}
          </Text>
        </View>

        {open && (
          <View style={[s.detail, { borderTopColor: p.cardBorder }]}>
            {f.spark.length >= 2 && (
              <View>
                <Sparkline values={f.spark} height={44} area />
                <Text style={[s.microLabel, { color: p.textMuted, textAlign: 'center', marginTop: 2 }]}>30-DAY TREND</Text>
              </View>
            )}
            {(f.targetNearCents != null || f.targetFarCents != null) && (
              <View style={{ gap: 4 }}>
                {f.targetNearCents != null && (
                  <TargetLine
                    label={f.nearDays != null ? `near (~${f.nearDays} trading days)` : 'near target'}
                    cents={f.targetNearCents}
                    bps={f.nearBps}
                    currency={f.currency}
                    p={p}
                  />
                )}
                {f.targetFarCents != null && (
                  <TargetLine label="12-mo target" cents={f.targetFarCents} bps={f.farBps} currency={f.currency} p={p} />
                )}
              </View>
            )}
            <MdText body={f.body} />
            {f.sources.length > 0 && (
              <Text style={[s.metaText, { color: p.textMuted }]}>via {f.sources.slice(0, 3).join(', ')}</Text>
            )}
            <FindActions find={f} p={p} onChanged={onChanged} onDismissed={onDismissed} withDismiss />
          </View>
        )}
      </Pressable>
    </Card>
  );
}

function TargetLine({
  label,
  cents,
  bps,
  currency,
  p,
}: {
  label: string;
  cents: number;
  bps: number | null;
  currency: string | null;
  p: Palette;
}) {
  return (
    <View style={s.targetLine}>
      <Text style={[s.metaText, { color: p.textMuted }]}>{label}</Text>
      <Text style={[s.targetVal, tabular, { color: p.textPrimary }]}>
        {currency === 'USD' ? 'US' : ''}
        {money(cents)}
      </Text>
      {bps != null && (
        <Text style={[s.targetVal, tabular, { color: bps >= 0 ? p.pos : p.neg }]}>{signedPctFromBps(bps, 0)}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  findCard: { padding: 0, overflow: 'hidden', flexDirection: 'row' },
  rail: { width: 4, alignSelf: 'stretch' },
  findBody: { flex: 1, minWidth: 0, padding: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { fontFamily: F.bold, fontSize: 20, width: 30, textAlign: 'center' },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  symRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sym: { fontFamily: F.semi, fontSize: 15, textDecorationLine: 'underline' },
  hottest: {
    fontFamily: F.bold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  name: { fontFamily: F.reg, fontSize: 11, marginTop: 1 },
  heatCol: { alignItems: 'center', width: 40 },
  heatVal: { fontFamily: F.bold, fontSize: 18 },
  microLabel: { fontFamily: F.semi, fontSize: 8, letterSpacing: 1 },
  heatTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 8 },
  heatFill: { height: 4, borderRadius: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8 },
  price: { fontFamily: F.semi, fontSize: 14 },
  chg: { fontFamily: F.semi, fontSize: 11.5 },
  tag: { fontFamily: F.reg, fontSize: 10 },
  preview: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  obsPill: {
    fontFamily: F.semi,
    fontSize: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  metaText: { fontFamily: F.reg, fontSize: 11 },
  detail: { borderTopWidth: 1, marginTop: 10, paddingTop: 10, gap: 10 },
  targetLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  targetVal: { fontFamily: F.semi, fontSize: 12.5 },
});
