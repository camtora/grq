import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, Divider, Loading, ErrorNote } from '../../../components/Chrome';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money } from '../../../lib/format';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

type DeskHolding = { kind: string; underlying: string; qty: number; mvCadCents: number; label?: string | null };
type DeskArm = {
  entrantId: number;
  label: string;
  arm: string; // control | options
  returnPct: number;
  navCadCents: number;
  openOptionCount: number;
  tradeCount: number;
  holdings: DeskHolding[];
};
type DeskResponse = {
  current: {
    desk: { name: string; status: string; startingStakeCents: number };
    realFundReturnPct: number;
    arms: DeskArm[];
  };
};

function retColor(pct: number, p: Palette): string {
  return pct > 0 ? p.pos : pct < 0 ? p.neg : p.textMuted;
}

/** The Options Desk — the A/B that teaches options: the same model runs
 * stock-only vs stock+options (buy-to-open calls/puts, defined risk).
 * Sandbox only; the real fund never trades options. */
export default function DeskScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const { data: d, error, loading, refreshing, refresh } = useApi<DeskResponse>('/api/desk');

  const cur = d?.current;

  return (
    <SubScreen title="Options Desk" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {cur && (
        <View>
          <SectionTitle sub={`${cur.desk.name} · ${cur.desk.status.toLowerCase()} · ${money(cur.desk.startingStakeCents)} per arm`}>
            Stock-only vs stock+options
          </SectionTitle>
          {cur.arms.map((a) => (
            <Card key={a.entrantId} style={{ marginBottom: 10 }}>
              <View style={s.head}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: p.textPrimary }]}>{a.label}</Text>
                  <Text style={[s.meta, { color: p.textMuted }]}>
                    {a.arm === 'control' ? 'control — stocks only' : 'treatment — may buy calls & puts'} ·{' '}
                    {a.tradeCount} trades{a.openOptionCount > 0 ? ` · ${a.openOptionCount} open option${a.openOptionCount === 1 ? '' : 's'}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.ret, tabular, { color: retColor(a.returnPct, p) }]}>
                    {a.returnPct > 0 ? '+' : ''}{a.returnPct.toFixed(2)}%
                  </Text>
                  <Text style={[s.meta, tabular, { color: p.textMuted }]}>{money(a.navCadCents)}</Text>
                </View>
              </View>
              {a.holdings.length > 0 && (
                <View style={{ marginTop: 6 }}>
                  {a.holdings.slice(0, 8).map((h, i) => (
                    <View key={`${h.underlying}-${i}`}>
                      <Divider />
                      <Pressable onPress={() => router.push(`/stock/${h.underlying}`)} style={s.row}>
                        <Text style={[s.kind, { color: h.kind === 'OPTION' ? p.warn : p.textMuted }]}>
                          {h.kind === 'OPTION' ? 'OPT' : 'STK'}
                        </Text>
                        <Text style={[s.sym, { color: p.accentText }]}>{h.underlying}</Text>
                        {h.label ? (
                          <Text style={[s.meta, { color: p.textMuted, flex: 1 }]} numberOfLines={1}>{h.label}</Text>
                        ) : (
                          <Text style={[s.meta, tabular, { color: p.textMuted }]}>{h.qty} sh</Text>
                        )}
                        <Text style={[s.meta, tabular, { color: p.textPrimary, marginLeft: 'auto' }]}>
                          {money(h.mvCadCents)}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          ))}
          <Footnote>
            a teaching sandbox (D91) — real CBOE chains, modeled fills, defined-risk only; the
            live fund is code-blocked from options and that isn't changing here
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontFamily: F.semi, fontSize: 14 },
  ret: { fontFamily: F.display, fontSize: 16 },
  meta: { fontFamily: F.reg, fontSize: 10.5, marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  kind: { fontFamily: F.black, fontSize: 9, width: 26 },
  sym: { fontFamily: F.semi, fontSize: 13 },
});
