import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, Divider, MiniLabel, Loading, ErrorNote } from '../../../components/Chrome';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money, signedMoney, pnlColor } from '../../../lib/format';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

type DeskHolding = {
  kind: 'STOCK' | 'CALL' | 'PUT' | string;
  underlying: string;
  qty: number;
  mvCadCents: number;
  unrealCadCents?: number | null;
  strikeCents?: number | null;
  expiry?: string | null;
  daysLeft?: number | null;
  card?: string | null;
};
type DeskResolved = { kind: string; underlying: string; returnPct: number | null; realizedPnlCents: number | null; card: string | null };
type DeskArm = {
  entrantId: number;
  label: string;
  arm: string; // control | treatment
  returnPct: number;
  navCadCents: number;
  openOptionCount: number;
  tradeCount: number;
  holdings: DeskHolding[];
  resolved: DeskResolved[];
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

function kindColor(kind: string, p: Palette): string {
  if (kind === 'CALL') return p.pos;
  if (kind === 'PUT') return p.warn;
  return p.textMuted;
}

function HoldingRow({ h }: { h: DeskHolding }) {
  const { p } = usePalette();
  const router = useRouter();
  const isOption = h.kind === 'CALL' || h.kind === 'PUT';
  return (
    <View style={s.holding}>
      <Pressable onPress={() => router.push(`/stock/${h.underlying}`)} style={s.holdingHead}>
        <Text style={[s.kind, { color: kindColor(h.kind, p) }]}>{h.kind}</Text>
        <Text style={[s.sym, { color: p.accentText }]}>{h.underlying}</Text>
        {isOption && h.strikeCents != null ? (
          <Text style={[s.meta, tabular, { color: p.textMuted }]}>
            {h.qty}× ${(h.strikeCents / 100).toFixed(0)} strike
            {h.expiry ? ` · exp ${h.expiry.slice(5)}` : ''}
            {h.daysLeft != null ? ` · ${h.daysLeft}d left` : ''}
          </Text>
        ) : (
          <Text style={[s.meta, tabular, { color: p.textMuted }]}>{h.qty} sh</Text>
        )}
        <View style={s.holdingRight}>
          <Text style={[s.meta, tabular, { color: p.textPrimary }]}>{money(h.mvCadCents)}</Text>
          {h.unrealCadCents != null && h.unrealCadCents !== 0 && (
            <Text style={[s.metaSmall, tabular, { color: pnlColor(h.unrealCadCents, p) }]}>
              {signedMoney(h.unrealCadCents)}
            </Text>
          )}
        </View>
      </Pressable>
      {h.card && (
        <Text style={[s.card, { color: p.textMuted, borderLeftColor: kindColor(h.kind, p) + '66' }]}>
          {h.card}
        </Text>
      )}
    </View>
  );
}

/** The Options Desk (D91/D92) — the A/B that teaches options: one model runs
 * stocks only, the other may also buy calls & puts (defined risk). Every
 * option carries its plain-English teaching card. Sandbox only; the real
 * fund never trades options. */
export default function DeskScreen() {
  const { p } = usePalette();
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
            <Card key={a.entrantId} style={{ marginBottom: 12 }}>
              <View style={s.head}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: p.textPrimary }]}>{a.label}</Text>
                  <Text style={[s.meta, { color: p.textMuted }]}>
                    {a.arm === 'control' ? 'control — stocks only' : 'treatment — may buy calls & puts'} ·{' '}
                    {a.tradeCount} trade{a.tradeCount === 1 ? '' : 's'}
                    {a.openOptionCount > 0 ? ` · ${a.openOptionCount} open option${a.openOptionCount === 1 ? '' : 's'}` : ''}
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
                <View style={{ marginTop: 10 }}>
                  <MiniLabel>Open positions</MiniLabel>
                  {a.holdings.map((h, i) => (
                    <View key={`${h.underlying}-${h.kind}-${i}`}>
                      {i > 0 && <Divider />}
                      <HoldingRow h={h} />
                    </View>
                  ))}
                </View>
              )}

              {a.resolved.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <MiniLabel>Settled</MiniLabel>
                  {a.resolved.map((r, i) => (
                    <View key={`${r.underlying}-${i}`}>
                      {i > 0 && <Divider />}
                      <View style={s.holding}>
                        <View style={s.holdingHead}>
                          <Text style={[s.kind, { color: kindColor(r.kind, p) }]}>{r.kind}</Text>
                          <Text style={[s.sym, { color: p.accentText }]}>{r.underlying}</Text>
                          <View style={s.holdingRight}>
                            {r.realizedPnlCents != null && (
                              <Text style={[s.meta, tabular, { color: pnlColor(r.realizedPnlCents, p) }]}>
                                {signedMoney(r.realizedPnlCents)}
                              </Text>
                            )}
                            {r.returnPct != null && (
                              <Text style={[s.metaSmall, tabular, { color: retColor(r.returnPct, p) }]}>
                                {r.returnPct > 0 ? '+' : ''}{r.returnPct.toFixed(0)}%
                              </Text>
                            )}
                          </View>
                        </View>
                        {r.card && (
                          <Text style={[s.card, { color: p.textMuted, borderLeftColor: kindColor(r.kind, p) + '66' }]}>
                            {r.card}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {a.holdings.length === 0 && a.resolved.length === 0 && (
                <Text style={[s.meta, { color: p.textMuted, marginTop: 8 }]}>All cash — nothing on this arm yet.</Text>
              )}
            </Card>
          ))}
          <Footnote>
            each option's card explains the bet in plain English — the whole point of the desk ·
            real CBOE chains, modeled fills, defined-risk only · the live fund is code-blocked from
            options and that isn't changing here
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontFamily: F.semi, fontSize: 14 },
  ret: { fontFamily: 'System', fontWeight: '800', fontSize: 16 },
  meta: { fontFamily: F.reg, fontSize: 10.5, marginTop: 1 },
  metaSmall: { fontFamily: F.reg, fontSize: 9.5, marginTop: 1 },
  holding: { paddingVertical: 8 },
  holdingHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  holdingRight: { marginLeft: 'auto', alignItems: 'flex-end' },
  kind: { fontFamily: F.black, fontSize: 9.5, width: 38, letterSpacing: 0.5 },
  sym: { fontFamily: F.semi, fontSize: 13.5 },
  card: {
    fontFamily: F.reg,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 7,
    paddingLeft: 10,
    borderLeftWidth: 2,
  },
});
