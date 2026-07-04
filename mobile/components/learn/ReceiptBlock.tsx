import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette, F, type Palette } from '../../constants/theme';
import { money } from '../../lib/format';

const tabular = { fontVariant: ['tabular-nums' as const] };

/** A "receipts" block inside a Learn lesson (web components/learn/Receipts.tsx,
 * serialized by /api/learn/receipts) — the fund's OWN live numbers, so lesson
 * claims can't drift from reality. Renders honestly-empty when data can't load. */

export type ReceiptStat = { label: string; value: string; tone?: 'pos' | 'neg' | 'warn' };
export type ReceiptWire =
  | { title: string; empty: string }
  | {
      title: string;
      footer: string;
      stats?: ReceiptStat[];
      fills?: { side: string; qty: number; symbol: string; priceCents: number; commissionCents: number; day: string }[];
    };

function toneColor(tone: ReceiptStat['tone'], p: Palette): string {
  if (tone === 'pos') return p.pos;
  if (tone === 'neg') return p.neg;
  if (tone === 'warn') return p.warn;
  return p.textPrimary;
}

export default function ReceiptBlock({ r }: { r: ReceiptWire | undefined }) {
  const { p } = usePalette();
  if (!r) return null;
  return (
    <View style={[s.box, { borderColor: p.cardBorder, backgroundColor: p.cardHi + '33' }]}>
      <View style={s.headRow}>
        <Text style={[s.title, { color: p.accentText }]}>RECEIPTS · {r.title.toUpperCase()}</Text>
        <Text style={[s.honest, { color: p.textMuted }]}>the fund&apos;s own live numbers</Text>
      </View>
      {'empty' in r ? (
        <Text style={[s.empty, { color: p.textMuted }]}>{r.empty}</Text>
      ) : (
        <>
          {r.fills && (
            <View style={{ gap: 4, marginTop: 8 }}>
              {r.fills.map((f, i) => (
                <Text key={i} style={[s.fill, tabular, { color: p.textMuted }]}>
                  <Text style={{ color: f.side === 'BUY' ? p.pos : p.warn, fontFamily: F.bold }}>{f.side}</Text>{' '}
                  <Text style={{ color: p.accentText, fontFamily: F.semi }}>
                    {f.qty} {f.symbol}
                  </Text>{' '}
                  @ {money(f.priceCents)} · {money(f.commissionCents)} commission · {f.day}
                </Text>
              ))}
            </View>
          )}
          {r.stats && (
            <View style={s.statsWrap}>
              {r.stats.map((st) => (
                <View key={st.label} style={[s.statCell, { borderColor: p.cardBorder }]}>
                  <Text style={[s.statLabel, { color: p.textMuted }]}>{st.label.toUpperCase()}</Text>
                  <Text style={[s.statValue, tabular, { color: toneColor(st.tone, p) }]}>{st.value}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={[s.footer, { color: p.textMuted }]}>{r.footer}</Text>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 12 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  title: { fontFamily: F.bold, fontSize: 9, letterSpacing: 1.5 },
  honest: { fontFamily: F.reg, fontSize: 8.5 },
  empty: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  fill: { fontFamily: F.reg, fontSize: 11, lineHeight: 16 },
  statsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  statCell: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, minWidth: '30%', flexGrow: 1 },
  statLabel: { fontFamily: F.semi, fontSize: 7.5, letterSpacing: 0.6 },
  statValue: { fontFamily: F.semi, fontSize: 12.5, marginTop: 2 },
  footer: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 15, marginTop: 8 },
});
