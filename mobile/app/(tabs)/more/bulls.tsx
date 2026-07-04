import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, Divider, MiniLabel, Loading, ErrorNote } from '../../../components/Chrome';
import DeskChart from '../../../components/DeskChart';
import Sparkline from '../../../components/Sparkline';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money, signedMoney, pnlColor } from '../../../lib/format';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

// The web's bull line colours (lib/race/bulls BULL_COLORS order) — chart identity.
const BULL_COLORS = ['#5eead4', '#fbbf24', '#a78bfa', '#f472b6', '#38bdf8', '#4ade80', '#fb923c', '#f87171'];

/* ---------- wire (web bullsResponse; optional fields degrade pre-deploy) ---------- */

type BullHolding = { symbol: string; qty: number; mvCadCents: number; unrealCadCents?: number | null; avgCostCents?: number; currency?: string };
type BullCall = { at: string; action: string | null; symbol: string | null; qty: number | null; thesis: string | null; filled: boolean; rejectReason: string | null };
type Bull = {
  entrantId: number;
  label: string;
  model?: string;
  dial: string;
  navCadCents: number;
  returnPct: number;
  cashPct: number;
  tradeCount: number;
  navHistory?: { at: string; returnPct: number }[];
  holdings: BullHolding[];
  calls?: BullCall[];
};
type BullsResponse = {
  races?: { id: number; name: string; status: string; leaderReturnPct: number | null }[];
  current: {
    race: { id: number; name: string; status: string; startingStakeCents: number; cadence?: string; startedAt?: string | null };
    realFundReturnPct: number | null;
    realFundNavCents?: number | null;
    bulls: Bull[];
  } | null;
};

function retColor(pct: number, p: Palette): string {
  return pct > 0 ? p.pos : pct < 0 ? p.neg : p.textMuted;
}
const ret = (pct: number) => `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;

/* ---------- one bull, expandable ---------- */

function BullCard({ b, rank, color, p }: { b: Bull; rank: number | null; color: string; p: Palette }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Card style={rank == null ? { opacity: 0.65 } : undefined}>
      <Pressable onPress={() => setOpen(!open)}>
        <View style={s.head}>
          <Text style={[s.rank, tabular, { color: p.textMuted }]}>{rank != null ? `#${rank}` : '—'}</Text>
          <View style={[s.dot, { backgroundColor: color }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <Text style={[s.label, { color: p.textPrimary }]}>{b.label}</Text>
              <Text style={[s.pill, { color: p.accentText, borderColor: p.accent + '55', backgroundColor: p.accent + '1a' }]}>
                {b.dial}
              </Text>
              {rank == null && (
                <Text style={[s.pill, { color: p.textMuted, borderColor: p.cardBorder, backgroundColor: p.cardHi }]}>
                  unranked · 0 trades
                </Text>
              )}
            </View>
            <Text style={[s.meta, tabular, { color: p.textMuted }]}>
              {money(b.navCadCents)} · {Math.round(b.cashPct)}% cash · {b.tradeCount} trade{b.tradeCount === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.ret, tabular, { color: retColor(b.returnPct, p) }]}>{ret(b.returnPct)}</Text>
            <Text style={[s.metaSmall, { color: p.accentText }]}>{open ? '▾ collapse' : '▸ book & calls'}</Text>
          </View>
        </View>
        {(b.navHistory?.length ?? 0) >= 2 && (
          <View style={{ marginTop: 8 }}>
            <Sparkline values={b.navHistory!.map((h) => h.returnPct)} height={24} />
          </View>
        )}

        {open && (
          <View style={[s.expand, { borderTopColor: p.cardBorder }]}>
            <MiniLabel>Holdings</MiniLabel>
            {b.holdings.length === 0 ? (
              <Text style={[s.meta, { color: p.textMuted }]}>All cash.</Text>
            ) : (
              b.holdings.map((h, i) => (
                <View key={h.symbol}>
                  {i > 0 && <Divider />}
                  <Pressable onPress={() => router.push(`/stock/${h.symbol}`)} style={s.holdingRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.meta, { color: p.textPrimary }]}>
                        <Text style={{ color: p.accentText, fontFamily: F.semi }}>{h.symbol}</Text>{' '}
                        <Text style={[tabular, { color: p.textMuted }]}>
                          {h.qty}
                          {h.avgCostCents != null ? ` @ ${money(h.avgCostCents)}` : ''}
                          {h.currency === 'USD' ? ' US' : ''}
                        </Text>
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.meta, tabular, { color: p.textPrimary, fontFamily: F.semi }]}>{money(h.mvCadCents)}</Text>
                      {h.unrealCadCents != null && h.unrealCadCents !== 0 && (
                        <Text style={[s.metaSmall, tabular, { color: pnlColor(h.unrealCadCents, p) }]}>
                          {signedMoney(h.unrealCadCents)}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                </View>
              ))
            )}

            {(b.calls?.length ?? 0) > 0 && (
              <View style={{ marginTop: 10 }}>
                <MiniLabel>Recent calls</MiniLabel>
                <View style={{ gap: 6 }}>
                  {b.calls!.map((c, i) => (
                    <View key={i} style={s.callRow}>
                      <Text style={[s.callVerb, { color: c.action === 'BUY' ? p.pos : c.action === 'SELL' ? p.neg : p.textMuted }]}>
                        {c.action ?? '—'}
                      </Text>
                      <Text style={[s.callBody, { color: p.textMuted }]}>
                        {c.symbol ? (
                          <Text style={{ color: p.textPrimary, fontFamily: F.semi }}>
                            {c.symbol}
                            {c.qty ? ` ×${c.qty}` : ''}{' '}
                          </Text>
                        ) : null}
                        {c.thesis ?? ''}
                        {c.filled ? <Text style={{ color: p.pos }}> · filled</Text> : c.rejectReason ? <Text style={{ color: p.warn }}> · rejected: {c.rejectReason}</Text> : null}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </Pressable>
    </Card>
  );
}

/* ---------- the page ---------- */

/** Bull Race — each model runs its OWN $50k paper book: same market, separate
 * books, fully isolated from the real fund. Web /bulls parity: race switcher
 * (past races), the return-over-time chart, traded-first ranking, and expandable
 * bulls with the full book + recent calls. */
export default function BullsScreen() {
  const { p } = usePalette();
  const [raceId, setRaceId] = useState<number | null>(null);
  const { data: d, error, loading, refreshing, refresh } = useApi<BullsResponse>(
    `/api/bulls${raceId != null ? `?id=${raceId}` : ''}`,
  );
  const [showHow, setShowHow] = useState(false);

  const cur = d?.current;
  // Web ranking rule: only bulls that have traded get placed; the feed is leader-first.
  let placed = 0;
  const ranks = (cur?.bulls ?? []).map((b) => (b.tradeCount > 0 ? ++placed : null));

  return (
    <SubScreen title="Bull Race" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View style={{ marginTop: 8, gap: 10 }}>
          <Text style={[s.intro, { color: p.textMuted }]}>
            Eight bulls, eight paper accounts — each model actively runs its OWN book: its own trades, its own
            P&L, same market, fully isolated from the real fund. Which mind compounds best when it has to
            manage a portfolio itself? (What models would do on the fund&apos;s REAL calls is Second Opinions.)
          </Text>

          {/* past races */}
          {(d.races?.length ?? 0) > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.raceRow}>
              {d.races!.map((r) => {
                const on = cur?.race.id === r.id;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setRaceId(r.id)}
                    style={[s.chip, { borderColor: on ? p.accent + '88' : p.cardBorder, backgroundColor: on ? p.accent + '26' : p.cardBg }]}
                  >
                    <Text style={{ color: on ? p.accentText : p.textMuted, fontFamily: on ? F.semi : F.med, fontSize: 11.5 }}>
                      {r.name} {r.status === 'RUNNING' ? '●' : r.status === 'PAUSED' ? '❚❚' : '■'}
                      {r.leaderReturnPct != null && (
                        <Text style={[tabular, { color: retColor(r.leaderReturnPct, p), fontSize: 10 }]}>
                          {'  '}{ret(r.leaderReturnPct)}
                        </Text>
                      )}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {cur && (
            <>
              <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>
                <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>{cur.race.name}</Text> ·{' '}
                {cur.bulls.length} bulls{cur.race.cadence ? ` · ${cur.race.cadence}` : ''} ·{' '}
                {money(cur.race.startingStakeCents)} each ·{' '}
                <Text style={{ color: cur.race.status === 'RUNNING' ? p.pos : p.warn }}>{cur.race.status}</Text>
                {cur.race.startedAt ? ` · since ${cur.race.startedAt.slice(0, 10)}` : ''}
              </Text>

              {/* return over time */}
              {cur.bulls.some((b) => (b.navHistory?.length ?? 0) >= 2) && (
                <View>
                  <SectionTitle sub="every bull, one axis">Return over time</SectionTitle>
                  <Card>
                    <DeskChart
                      height={190}
                      series={cur.bulls.map((b, i) => ({
                        label: b.label,
                        color: BULL_COLORS[i % BULL_COLORS.length],
                        points: b.navHistory ?? [],
                      }))}
                    />
                  </Card>
                </View>
              )}

              {/* leaderboard */}
              <SectionTitle sub="tap a bull for its book & calls">Leaderboard</SectionTitle>
              <View style={{ gap: 10 }}>
                {cur.bulls.map((b, i) => (
                  <BullCard key={b.entrantId} b={b} rank={ranks[i]} color={BULL_COLORS[i % BULL_COLORS.length]} p={p} />
                ))}
              </View>

              {cur.realFundReturnPct != null && (
                <Card>
                  <Text style={[s.meta, { color: p.textMuted, lineHeight: 17 }]}>
                    <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>Reference — the real fund (Opus, live + tooled): </Text>
                    <Text style={[tabular, { color: retColor(cur.realFundReturnPct, p), fontFamily: F.semi }]}>
                      {ret(cur.realFundReturnPct)}
                    </Text>
                    {cur.realFundNavCents != null ? ` on ${money(cur.realFundNavCents)} NAV. ` : '. '}
                    Not directly comparable (different capital, timeframe, and it researches with tools) — context only.
                  </Text>
                </Card>
              )}

              {/* how it works */}
              <Card>
                <Pressable onPress={() => setShowHow(!showHow)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[s.howTitle, { color: p.textMuted }]}>HOW BULL RACES WORK</Text>
                  <Text style={{ color: p.textMuted, marginLeft: 'auto', fontSize: 12 }}>{showHow ? '▴' : '▾'}</Text>
                </Pressable>
                {showHow && (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    {(
                      [
                        ['Own book, own rules.', `Each bull starts with ${money(cur.race.startingStakeCents)} CAD and trades on its own — every BUY/SELL fills into ITS account at the live price (with commission). P&L is real portfolio value, marked to the market.`],
                        ['Level field.', "Every bull runs seed-only / no-tools — even Opus — so this measures judgment, not who has the better research shovel. (The real Opus fund, which DOES use tools, is shown only as a reference above.)"],
                        ['Risk dials bite.', 'Each bull trades under its dial (position cap, cash floor, weekly-buy cap); a call that breaks them is auto-rejected. A pure sandbox — it never touches the real fund.'],
                      ] as const
                    ).map(([head, body]) => (
                      <Text key={head} style={[s.howBody, { color: p.textMuted }]}>
                        <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>{head} </Text>
                        {body}
                      </Text>
                    ))}
                  </View>
                )}
              </Card>
            </>
          )}

          <Footnote>
            hypothetical paper accounts — fills simulate at the live (delayed ~15 min) mid with IBKR-style
            commission, no real money · US names fill in CAD at the live FX rate · creating and
            pausing/resetting races lives on the web for now
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  raceRow: { flexDirection: 'row', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank: { fontFamily: 'System', fontWeight: '800', fontSize: 13, width: 26 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontFamily: F.semi, fontSize: 13.5 },
  ret: { fontFamily: 'System', fontWeight: '800', fontSize: 16 },
  meta: { fontFamily: F.reg, fontSize: 11, marginTop: 1 },
  metaSmall: { fontFamily: F.reg, fontSize: 10, lineHeight: 14, marginTop: 1 },
  pill: {
    fontFamily: F.bold,
    fontSize: 8.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    overflow: 'hidden',
  },
  expand: { borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  holdingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  callRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  callVerb: { fontFamily: F.bold, fontSize: 10.5, width: 38 },
  callBody: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 16, flex: 1 },
  howTitle: { fontFamily: F.semi, fontSize: 10.5, letterSpacing: 1 },
  howBody: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 17 },
});
