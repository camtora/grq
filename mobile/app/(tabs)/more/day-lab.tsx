import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SubScreen, Card, SectionTitle, Footnote, Divider, Loading, ErrorNote } from '../../../components/Chrome';
import DeskChart from '../../../components/DeskChart';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money, signedMoney, pnlColor } from '../../../lib/format';
import { api } from '../../../services/api';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

// The two arms' fixed colours (web day-lab chart: Trader amber, Holder teal).
const TRADER_COLOR = '#fbbf24';
const HOLDER_COLOR = '#5eead4';

/* ---------- wire (web lib/day/lab.ts DayLabView, JSON-serialized) ---------- */

type DayTrade = { at: string; side: string; shares: number; priceCents: number; commissionCents: number; realizedPnlCents: number | null; card: string | null };
type DayVerdict = { id: number; symbol: string; tradingDate: string; traderPlCents: number; holderPlCents: number; roundTrips: number };
type DayLabWire = {
  lab: {
    id: number; symbol: string; currency: string; tradingDate: string; status: string;
    startingCashCents: number; markCents: number;
    traderShares: number; traderCashCents: number; traderEquityCents: number; traderPlCents: number;
    holderShares: number; holderEntryCents: number | null; holderPlCents: number;
    feesCents: number; spreadCents: number; roundTrips: number;
  } | null;
  chart: { at: string; traderPct: number; holderPct: number }[];
  trades: DayTrade[];
  history: DayVerdict[];
};

const pctStr = (c: number, start: number) => `${c >= 0 ? '+' : ''}${start > 0 ? ((c / start) * 100).toFixed(2) : '0'}%`;

function StatCell({ k, v, tone, note, p }: { k: string; v: string; tone?: string; note?: string; p: Palette }) {
  return (
    <View style={s.statCell}>
      <Text style={[s.statLabel, { color: p.textMuted }]}>{k.toUpperCase()}</Text>
      <Text style={[s.statValue, tabular, { color: tone ?? p.textPrimary }]}>{v}</Text>
      {note ? <Text style={[s.statNote, { color: p.textMuted }]}>{note}</Text> : null}
    </View>
  );
}

/** The Day-Trading Lab (D103) — day-trade a real name against a Holder who buys
 * once and sits: same stock, same day, same virtual cash. Watch whether frantic
 * in-and-out beats patience after the spread and commissions. Web /day-lab
 * parity. Modeled, never executable; the fund is code-blocked from same-day
 * round trips (§6). */
export default function DayLabScreen() {
  const { p } = usePalette();
  const { data: d, error, loading, refreshing, refresh, reload } = useApi<DayLabWire>('/api/day-lab');
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('100');
  const [busy, setBusy] = useState<string | null>(null);

  const lab = d?.lab ?? null;
  const open = lab?.status === 'OPEN';
  const traderWinning = lab ? lab.traderPlCents > lab.holderPlCents : false;
  const churnCost = lab ? lab.feesCents + lab.spreadCents : 0;

  const post = async (op: string, body: Record<string, unknown> = {}, confirmMsg?: string) => {
    const go = async () => {
      setBusy(op);
      try {
        await api('/api/day-lab', { method: 'POST', body: JSON.stringify({ op, ...body }) });
        reload();
      } catch (e) {
        Alert.alert('Day-Trading Lab', e instanceof Error ? e.message : 'Action failed.');
      } finally {
        setBusy(null);
      }
    };
    if (confirmMsg) {
      Alert.alert('Day-Trading Lab', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: () => void go() },
      ]);
    } else void go();
  };

  const nShares = Math.max(1, Math.floor(Number(shares) || 0));

  return (
    <SubScreen title="Day-Trading Lab" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View style={{ marginTop: 8, gap: 10 }}>
          <Text style={[s.intro, { color: p.textMuted }]}>
            Day-trade a real name against a Holder who just buys once and sits — same stock, same day, and
            {lab ? ` ${money(lab.startingCashCents)}` : ' $50,000'} of virtual buying power each. Watch whether
            frantic in-and-out beats patience after the spread and commissions. A pure sandbox: the fund
            can&apos;t day-trade, and nothing here is real.
          </Text>

          {/* controls */}
          <Card>
            <View style={s.formRow}>
              <TextInput
                value={ticker}
                onChangeText={setTicker}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="new lab — ticker, e.g. NVDA"
                placeholderTextColor={p.textMuted}
                style={[s.input, { backgroundColor: p.cardHi, borderColor: p.cardBorder, color: p.textPrimary, flex: 1 }]}
              />
              <Pressable
                onPress={() => post('start', { symbol: ticker.trim().toUpperCase() })}
                disabled={busy === 'start' || !ticker.trim()}
                style={[s.btn, { backgroundColor: p.accent + '26', opacity: !ticker.trim() ? 0.5 : 1 }]}
              >
                {busy === 'start' ? <ActivityIndicator size="small" color={p.accentText} /> : <Text style={[s.btnText, { color: p.accentText }]}>{open ? 'Start new' : 'Start lab'}</Text>}
              </Pressable>
            </View>
            {open && lab && (
              <View style={[s.tradeControls, { borderTopColor: p.cardBorder }]}>
                <TextInput
                  value={shares}
                  onChangeText={setShares}
                  keyboardType="number-pad"
                  style={[s.input, tabular, { backgroundColor: p.cardHi, borderColor: p.cardBorder, color: p.textPrimary, width: 76 }]}
                />
                <Pressable onPress={() => post('buy', { shares: nShares })} disabled={!!busy} style={[s.btn, { backgroundColor: p.pos + '1f', borderColor: p.pos + '55', borderWidth: 1 }]}>
                  <Text style={[s.btnText, { color: p.pos }]}>{busy === 'buy' ? '…' : 'Buy @ ask'}</Text>
                </Pressable>
                <Pressable onPress={() => post('sell', { shares: nShares })} disabled={!!busy} style={[s.btn, { backgroundColor: p.neg + '1f', borderColor: p.neg + '55', borderWidth: 1 }]}>
                  <Text style={[s.btnText, { color: p.neg }]}>{busy === 'sell' ? '…' : 'Sell @ bid'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => post('flatten', {}, 'Flatten (sell all) and close this lab for a final verdict?')}
                  disabled={!!busy}
                  style={[s.btn, { backgroundColor: p.cardHi, borderColor: p.cardBorder, borderWidth: 1 }]}
                >
                  <Text style={[s.btnText, { color: p.textPrimary }]}>Flatten & close</Text>
                </Pressable>
                <Pressable
                  onPress={() => post('reset', {}, 'Delete this lab and its history?')}
                  disabled={!!busy}
                  style={[s.btn, { borderColor: p.neg + '40', borderWidth: 1 }]}
                >
                  <Text style={[s.btnText, { color: p.neg }]}>Reset</Text>
                </Pressable>
              </View>
            )}
          </Card>

          {!lab ? (
            <Card>
              <Text style={[s.empty, { color: p.textMuted }]}>
                No lab yet — pick a ticker above and start one, then trade it against the buy-and-hold twin.
              </Text>
            </Card>
          ) : (
            <>
              {/* the stake line */}
              <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>
                <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>{lab.symbol}</Text> ·{' '}
                {money(lab.startingCashCents)} {lab.currency} per book · Trader{' '}
                <Text style={{ color: p.textPrimary }}>{money(lab.traderCashCents)}</Text> cash + {lab.traderShares} sh
                (≈{money(lab.traderEquityCents)} equity) · Holder {lab.holderShares} sh
                {lab.holderShares > 0 ? ` @ ${money(lab.holderEntryCents ?? 0)}` : ' (mirrors your first buy)'}
              </Text>

              {/* verdict strip */}
              <Card style={s.statGrid}>
                <StatCell
                  k={`Trader — ${lab.symbol}`}
                  v={signedMoney(lab.traderPlCents)}
                  tone={pnlColor(lab.traderPlCents, p)}
                  note={`${pctStr(lab.traderPlCents, lab.startingCashCents)} · ${lab.roundTrips} round trip${lab.roundTrips === 1 ? '' : 's'}`}
                  p={p}
                />
                <StatCell
                  k="Holder (buy & hold)"
                  v={signedMoney(lab.holderPlCents)}
                  tone={pnlColor(lab.holderPlCents, p)}
                  note={pctStr(lab.holderPlCents, lab.startingCashCents)}
                  p={p}
                />
                <StatCell k="Cost to churn" v={money(churnCost)} tone={p.warn} note={`${money(lab.feesCents)} fees + ${money(lab.spreadCents)} spread`} p={p} />
                <StatCell
                  k="Who's ahead?"
                  v={traderWinning ? 'Trader' : 'Holder'}
                  tone={traderWinning ? p.warn : p.pos}
                  note={traderWinning ? 'churning is winning… for now' : 'patience is winning'}
                  p={p}
                />
              </Card>

              {/* the honest verdict line */}
              <Card style={!traderWinning ? { borderColor: p.pos + '40' } : undefined}>
                <Text style={[s.verdict, { color: p.textMuted }]}>
                  {traderWinning ? (
                    <>
                      The Trader is ahead of the Holder by{' '}
                      <Text style={{ color: p.textPrimary, fontFamily: F.semi }}>{money(lab.traderPlCents - lab.holderPlCents)}</Text>{' '}
                      right now — but they&apos;ve paid {money(churnCost)} in fees + spread to get there, and one
                      bad exit can flip it. Keep going, or Flatten &amp; close for the final tally.
                    </>
                  ) : (
                    <>
                      The Holder — who bought{' '}
                      {lab.holderShares > 0 ? `${lab.holderShares} ${lab.symbol}` : 'the same lot'} once and did
                      nothing — is ahead by{' '}
                      <Text style={{ color: p.pos, fontFamily: F.semi }}>{money(lab.holderPlCents - lab.traderPlCents)}</Text>.
                      The Trader&apos;s {money(churnCost)} in fees + spread is the gap. This is the whole lesson:
                      churn has to beat its own costs before it beats sitting still.
                    </>
                  )}
                </Text>
              </Card>

              {/* the two equity lines */}
              <View>
                <SectionTitle sub="equity over the session">Trader vs Holder</SectionTitle>
                <Card>
                  {d.chart.length >= 2 ? (
                    <DeskChart
                      height={170}
                      series={[
                        { label: 'Trader (churning)', color: TRADER_COLOR, points: d.chart.map((c) => ({ at: c.at, returnPct: c.traderPct })) },
                        { label: 'Holder (buy & hold)', color: HOLDER_COLOR, points: d.chart.map((c) => ({ at: c.at, returnPct: c.holderPct })) },
                      ]}
                    />
                  ) : (
                    <Text style={[s.empty, { color: p.textMuted }]}>Make your first buy to start the two equity lines.</Text>
                  )}
                </Card>
              </View>

              {/* the trade log */}
              <View>
                <SectionTitle sub={`${lab.symbol} @ ${money(lab.markCents)} ${lab.currency} ${open ? '(live)' : '(closed)'}`}>
                  Your trades
                </SectionTitle>
                {d.trades.length === 0 ? (
                  <Card>
                    <Text style={[s.empty, { color: p.textMuted }]}>
                      No trades yet. Buy some {lab.symbol} — the Holder will mirror your first buy and then sit.
                    </Text>
                  </Card>
                ) : (
                  <Card style={s.listCard}>
                    {d.trades.map((t, i) => (
                      <View key={i}>
                        {i > 0 && <Divider />}
                        <View style={s.tradeRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[s.meta, tabular, { color: t.side === 'BUY' ? p.pos : p.neg, fontFamily: F.semi }]}>
                              {t.side} {t.shares} @ {money(t.priceCents)}
                            </Text>
                            {t.card ? (
                              <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 2 }]} numberOfLines={2}>
                                {t.card}
                              </Text>
                            ) : null}
                          </View>
                          {t.realizedPnlCents != null ? (
                            <Text style={[s.metaSmall, tabular, { color: pnlColor(t.realizedPnlCents, p), fontFamily: F.semi }]}>
                              {signedMoney(t.realizedPnlCents)}
                            </Text>
                          ) : (
                            <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>−{money(t.commissionCents)} fee</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </Card>
                )}
              </View>
            </>
          )}

          {/* past rounds */}
          {(d.history?.length ?? 0) > 0 && (
            <View>
              <SectionTitle sub="did churning win?">Past rounds</SectionTitle>
              <Card style={s.listCard}>
                {d.history.map((hv, i) => {
                  const traderWon = hv.traderPlCents > hv.holderPlCents;
                  return (
                    <View key={hv.id}>
                      {i > 0 && <Divider />}
                      <View style={s.tradeRow}>
                        <Text style={[s.meta, { color: p.textPrimary, flex: 1 }]}>
                          {hv.symbol}{' '}
                          <Text style={[s.metaSmall, { color: p.textMuted }]}>
                            {hv.tradingDate} · {hv.roundTrips} trips
                          </Text>
                        </Text>
                        <Text style={[s.metaSmall, tabular, { color: traderWon ? p.warn : p.pos, fontFamily: F.semi }]}>
                          {traderWon ? 'Trader' : 'Holder'} by {money(Math.abs(hv.traderPlCents - hv.holderPlCents))}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                <Text style={[s.metaSmall, { color: p.textMuted, paddingVertical: 8 }]}>
                  Holder wins {d.history.filter((hv) => hv.holderPlCents >= hv.traderPlCents).length}/{d.history.length} rounds so far.
                </Text>
              </Card>
            </View>
          )}

          {/* education */}
          <View>
            <SectionTitle sub="the five ideas">Day trading, explained</SectionTitle>
            <Card>
              {(
                [
                  ['Day trading.', "Buying and selling the same stock within one day to profit from small intraday moves — never holding overnight. The opposite of the fund's buy-and-hold-on-conviction approach."],
                  ['The bid/ask spread.', 'You buy at the (higher) ask and sell at the (lower) bid, so EVERY round trip starts underwater by the spread — the silent tax that adds up fast when you trade a lot.'],
                  ['Commissions & slippage.', 'Each fill pays a commission, and big/fast orders move the price against you. Thin per-trade margins get eaten by these costs long before you notice.'],
                  ['PDT & settlement.', "In the US, <$25k margin accounts get restricted after 4 day trades in 5 days (the Pattern Day Trader rule); cash accounts dodge it but hit settlement limits — you can't instantly rebuy with unsettled proceeds."],
                  ['Why most lose.', 'Between spread, commissions, taxes (short-term = full income rates), and the discipline it demands, studies find ~70–90% of active day traders lose money over time. This lab lets you test that against a Holder, honestly.'],
                ] as const
              ).map(([head, body], i) => (
                <Text key={head} style={[s.eduLine, { color: p.textMuted }, i > 0 && { marginTop: 8 }]}>
                  <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>{head} </Text>
                  {body}
                </Text>
              ))}
            </Card>
          </View>

          <Footnote>
            sandbox · modeled, never executable · the fund is code-blocked from same-day round trips · fills
            cross the live (delayed) bid/ask; commissions use the IBKR model · single virtual book, no FX
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  formRow: { flexDirection: 'row', gap: 8 },
  tradeControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontFamily: F.reg, fontSize: 13 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center' },
  btnText: { fontFamily: F.semi, fontSize: 12 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '50%', paddingVertical: 6 },
  statLabel: { fontFamily: F.semi, fontSize: 8.5, letterSpacing: 1 },
  statValue: { fontFamily: F.semi, fontSize: 15, marginTop: 2 },
  statNote: { fontFamily: F.reg, fontSize: 9.5, marginTop: 1 },
  verdict: { fontFamily: F.reg, fontSize: 12, lineHeight: 18 },
  empty: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, paddingVertical: 8 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  tradeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  meta: { fontFamily: F.reg, fontSize: 12 },
  metaSmall: { fontFamily: F.reg, fontSize: 10, lineHeight: 14 },
  eduLine: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 17 },
});
