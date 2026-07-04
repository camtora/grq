import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, Loading, ErrorNote } from '../../../components/Chrome';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money, pnlColor } from '../../../lib/format';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

type Bull = {
  entrantId: number;
  label: string;
  dial: string;
  navCadCents: number;
  returnPct: number;
  cashPct: number;
  tradeCount: number;
  holdings: { symbol: string; qty: number; mvCadCents: number }[];
};
type BullsResponse = {
  current: {
    race: { name: string; status: string; startingStakeCents: number };
    realFundReturnPct: number;
    bulls: Bull[];
  };
};

function retColor(pct: number, p: Palette): string {
  return pct > 0 ? p.pos : pct < 0 ? p.neg : p.textMuted;
}

/** Bull Race — each model runs its OWN paper book: same market, same starting
 * stake, its own trades. The real fund's return is the bar to beat. */
export default function BullsScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const { data: d, error, loading, refreshing, refresh } = useApi<BullsResponse>('/api/bulls');

  const cur = d?.current;
  const bulls = [...(cur?.bulls ?? [])].sort((a, b) => b.returnPct - a.returnPct);

  return (
    <SubScreen title="Bull Race" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {cur && (
        <View>
          <SectionTitle sub={`${cur.race.name} · ${cur.race.status.toLowerCase()} · ${money(cur.race.startingStakeCents)} each`}>
            The standings
          </SectionTitle>
          <Card style={{ marginBottom: 10 }}>
            <Text style={[s.benchLine, tabular, { color: p.textPrimary }]}>
              The real fund (Alfred):{' '}
              <Text style={{ color: retColor(cur.realFundReturnPct, p), fontFamily: F.bold }}>
                {cur.realFundReturnPct > 0 ? '+' : ''}{cur.realFundReturnPct.toFixed(2)}%
              </Text>
              <Text style={[s.meta, { color: p.textMuted }]}>  — the bar to beat</Text>
            </Text>
          </Card>
          {bulls.map((b, i) => (
            <Card key={b.entrantId} style={{ marginBottom: 10 }}>
              <View style={s.head}>
                <Text style={[s.rank, tabular, { color: p.textMuted }]}>#{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: p.textPrimary }]}>{b.label}</Text>
                  <Text style={[s.meta, { color: p.textMuted }]}>
                    dial {b.dial.toLowerCase()} · {b.tradeCount} trade{b.tradeCount === 1 ? '' : 's'} · {b.cashPct.toFixed(0)}% cash
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.ret, tabular, { color: retColor(b.returnPct, p) }]}>
                    {b.returnPct > 0 ? '+' : ''}{b.returnPct.toFixed(2)}%
                  </Text>
                  <Text style={[s.meta, tabular, { color: p.textMuted }]}>{money(b.navCadCents)}</Text>
                </View>
              </View>
              {b.holdings.length > 0 && (
                <View style={s.holdings}>
                  {b.holdings.slice(0, 6).map((h) => (
                    <Pressable
                      key={h.symbol}
                      onPress={() => router.push(`/stock/${h.symbol}`)}
                      style={[s.chip, { borderColor: p.cardBorder }]}
                    >
                      <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 11 }}>
                        {h.symbol} <Text style={[tabular, { color: p.textMuted, fontFamily: F.reg }]}>{h.qty}</Text>
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </Card>
          ))}
          <Footnote>
            paper books with the same guardrails as the fund — a race of judgment, not luck; no
            bull ever touches real money
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  benchLine: { fontFamily: F.med, fontSize: 13 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { fontFamily: 'System', fontWeight: '800', fontSize: 14, width: 28 },
  label: { fontFamily: F.semi, fontSize: 14 },
  ret: { fontFamily: 'System', fontWeight: '800', fontSize: 16 },
  meta: { fontFamily: F.reg, fontSize: 10.5, marginTop: 1 },
  holdings: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
});
