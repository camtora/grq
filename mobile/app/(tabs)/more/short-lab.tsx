import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, Divider, MiniLabel, Segmented, Loading, ErrorNote, Masonry } from '../../../components/Chrome';
import DeskChart from '../../../components/DeskChart';
import PayoffChart from '../../../components/options/PayoffChart';
import Sparkline from '../../../components/Sparkline';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { useResponsive } from '../../../constants/layout';
import { money, signedMoney, pnlColor } from '../../../lib/format';
import { api } from '../../../services/api';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

// The A/B's fixed arm colours (web ShortDeskPanel: control teal, treatment amber).
const ARM_COLORS: Record<string, string> = { control: '#5eead4', treatment: '#fbbf24' };

/* ---------- wire (web lib/short lab+shadow+desk views, JSON-serialized) ---------- */

type ShortHolding = {
  id: number;
  symbol: string;
  companyName: string | null;
  qty: number;
  avgShortCents: number;
  markCents: number;
  liabilityCents: number;
  borrowBps: number;
  accruedBorrowCents: number;
  unrealCents: number;
  returnPct: number;
  daysHeld: number;
  decay: number[];
  card: string;
};
type ShortResolved = {
  id: number;
  symbol: string;
  qty: number;
  avgShortCents: number;
  exitCents: number;
  side: string; // COVER | MARGIN_CALL
  realizedPnlCents: number;
  returnPct: number;
  decay: number[];
  card: string;
};
type ShadowShort = { symbol: string; qty: number; avgShortCents: number; markCents: number; unrealCents: number; returnPct: number; daysHeld: number };
type ShortDeskPos = { symbol: string; qty: number; avgCostCents: number; unrealCents: number };
type ShortDeskArm = {
  id: number;
  arm: string;
  label: string;
  equityCents: number;
  cashCents: number;
  returnPct: number;
  longs: ShortDeskPos[];
  shorts: ShortDeskPos[];
  navHistory: { at: string; returnPct: number }[];
  calls: { action: string | null; symbol: string | null; thesis: string | null; filled: boolean; rejectReason: string | null }[];
  tradeCount: number;
  realizedCents: number;
};
type ShortLabWire = {
  lab: { id: number; name: string; cashCents: number; startingCashCents: number; maintMarginPct: number; status: string };
  equityCents: number;
  shortMktValCents: number;
  health: { equityCents: number; requiredCents: number; cushionCents: number; usedPct: number; call: boolean };
  realizedCents: number;
  open: ShortHolding[];
  history: ShortResolved[];
  navHistory: { at: string; returnPct: number }[];
  shadow?: { count: number; avgReturnPct: number; winRatePct: number; totalUnrealCents: number; positions: ShadowShort[] };
};
type ShortDeskWire = {
  desk: { id: number; name: string; status: string; cadence: string; startingStakeCents: number };
  arms: ShortDeskArm[];
  agentEnabled: boolean;
};

const ret = (pct: number) => `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;

function StatCell({ k, v, tone, note, p }: { k: string; v: string; tone?: string; note?: string; p: Palette }) {
  return (
    <View style={s.statCell}>
      <Text style={[s.statLabel, { color: p.textMuted }]}>{k.toUpperCase()}</Text>
      <Text style={[s.statValue, tabular, { color: tone ?? p.textPrimary }]}>{v}</Text>
      {note ? <Text style={[s.statNote, { color: p.textMuted }]}>{note}</Text> : null}
    </View>
  );
}

/* ---------- one open short ---------- */

function ShortCard({ h, p, onChanged }: { h: ShortHolding; p: Palette; onChanged: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showPayoff, setShowPayoff] = useState(false);

  const cover = () => {
    Alert.alert(`Cover ${h.qty} ${h.symbol}?`, 'Buys the shares back at the live price and books the lesson.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Cover',
        onPress: async () => {
          setBusy(true);
          try {
            await api('/api/short-lab', { method: 'POST', body: JSON.stringify({ op: 'cover', positionId: h.id }) });
            onChanged();
          } catch (e) {
            Alert.alert('Cover', e instanceof Error ? e.message : 'Could not cover.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Card style={{ borderColor: p.neg + '33' }}>
      <View style={s.shortHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.shortTitle, { color: p.textPrimary }]}>
            <Text style={{ color: p.neg }}>SHORT</Text> {h.qty}{' '}
            <Text
              onPress={() => router.push(`/stock/${h.symbol}`)}
              style={{ color: p.accentText, textDecorationLine: 'underline' }}
            >
              {h.symbol}
            </Text>{' '}
            <Text style={{ color: p.textMuted }}>@ {money(h.avgShortCents)}</Text>
          </Text>
          <Text style={[s.metaSmall, tabular, { color: p.textMuted, marginTop: 3 }]}>
            mark {money(h.markCents)} · owe {money(h.liabilityCents)} · {h.daysHeld}d held · borrow ~
            {(h.borrowBps / 100).toFixed(1)}%/yr ({money(h.accruedBorrowCents)} so far)
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.shortPnl, tabular, { color: pnlColor(h.unrealCents, p) }]}>{signedMoney(h.unrealCents)}</Text>
          <Text style={[s.metaSmall, tabular, { color: h.returnPct >= 0 ? p.pos : p.neg }]}>{ret(h.returnPct)}</Text>
        </View>
      </View>

      {h.card ? <Text style={[s.teachCard, { color: p.textMuted }]}>{h.card}</Text> : null}

      <Pressable onPress={() => setShowPayoff(!showPayoff)}>
        <Text style={[s.foldLink, { color: p.textMuted }]}>
          {showPayoff ? '▾' : '▸'} PAYOFF — THE LOSS THAT NEVER STOPS
        </Text>
      </Pressable>
      {showPayoff && (
        <View style={{ marginTop: 6 }}>
          <PayoffChart
            legs={[{ kind: 'STOCK', action: 'SELL', qty: h.qty, entryCents: h.avgShortCents }]}
            spotCents={h.markCents}
            daysLeft={0}
            breakevens={[h.avgShortCents]}
            height={150}
          />
          <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 4 }]}>
            Profit is capped (the stock can only fall to $0); the loss climbs forever as the price rises —
            that&apos;s the whole danger of a short.
          </Text>
        </View>
      )}

      {h.decay.length >= 2 && (
        <View style={{ marginTop: 8 }}>
          <View style={{ maxWidth: 240 }}>
            <Sparkline values={h.decay} height={30} area />
          </View>
          <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 2 }]}>
            unrealized P&L over time — rising = the short working, falling = it running against you
          </Text>
        </View>
      )}

      <Pressable onPress={cover} disabled={busy} style={[s.coverBtn, { backgroundColor: p.accent + '26' }]}>
        {busy ? <ActivityIndicator size="small" color={p.accentText} /> : <Text style={[s.btnText, { color: p.accentText }]}>Cover</Text>}
      </Pressable>
    </Card>
  );
}

/* ---------- the page ---------- */

/** The Short Lab (D101) — a permanently sandboxed study of short selling, the one
 * bet the fund can't make and the only one with unbounded loss. Web /short-lab
 * parity: the live book, margin health + the forced-cover call, open/cover,
 * resolved lessons, the shadow-shorts study, and the double-gated agent A/B. */
export default function ShortLabScreen() {
  const { p } = usePalette();
  const { isWide } = useResponsive();
  const router = useRouter();
  const lab = useApi<ShortLabWire>('/api/short-lab');
  const desk = useApi<ShortDeskWire>('/api/short-desk');
  const [symbol, setSymbol] = useState('');
  const [mode, setMode] = useState<'dollars' | 'shares'>('dollars');
  const [size, setSize] = useState('5000');
  const [busy, setBusy] = useState<string | null>(null);

  const d = lab.data;
  const reloadAll = () => {
    lab.reload();
    desk.reload();
  };

  const labOp = async (op: string, confirmMsg?: string) => {
    const go = async () => {
      setBusy(op);
      try {
        await api('/api/short-lab', { method: 'POST', body: JSON.stringify({ op }) });
        reloadAll();
      } catch (e) {
        Alert.alert('Short Lab', e instanceof Error ? e.message : 'Action failed.');
      } finally {
        setBusy(null);
      }
    };
    if (confirmMsg) {
      Alert.alert('Short Lab', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: () => void go() },
      ]);
    } else void go();
  };

  const openShort = async () => {
    const sym = symbol.trim().toUpperCase();
    const n = Number(size) || 0;
    if (!sym || n <= 0) return;
    setBusy('open');
    try {
      const body =
        mode === 'shares'
          ? { op: 'open', symbol: sym, qty: Math.floor(n) }
          : { op: 'open', symbol: sym, notionalCents: Math.round(n * 100) };
      await api('/api/short-lab', { method: 'POST', body: JSON.stringify(body) });
      setSymbol('');
      lab.reload();
    } catch (e) {
      Alert.alert('Short it', e instanceof Error ? e.message : 'Could not open the short.');
    } finally {
      setBusy(null);
    }
  };

  const deskOp = async (op: string, confirmMsg?: string) => {
    const go = async () => {
      setBusy(`desk-${op}`);
      try {
        await api('/api/short-desk', { method: 'POST', body: JSON.stringify({ op }) });
        desk.reload();
      } catch (e) {
        Alert.alert('Agent A/B', e instanceof Error ? e.message : 'Action failed.');
      } finally {
        setBusy(null);
      }
    };
    if (confirmMsg) {
      Alert.alert('Agent A/B', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: () => void go() },
      ]);
    } else void go();
  };

  const h = d?.health;

  return (
    <SubScreen title="The Short Lab" wide={isWide} refreshing={lab.refreshing || desk.refreshing} onRefresh={() => { void lab.refresh(); void desk.refresh(); }}>
      {lab.loading && <Loading />}
      {lab.error && !lab.loading && <ErrorNote message={lab.error} />}
      {d && h && (
        <View style={{ marginTop: 8, gap: 10 }}>
          {/* Dashboard header — prose + controls + the stat/margin strips span the
              full width (matching the panel columns below); on a phone this is just
              the reading column. */}
          <View style={{ gap: 10 }}>
          <Text style={[s.intro, { color: p.textMuted }]}>
            Short selling is the one bet the fund can&apos;t make — and the only one with unbounded loss. Open
            modeled shorts on real names, watch them evolve, and learn why shorts blow up. A pure sandbox:
            nothing here ever trades a real short.
          </Text>

          {/* member controls */}
          <View style={s.controls}>
            <Pressable disabled={busy === 'mark'} onPress={() => labOp('mark')} style={[s.btn, { backgroundColor: p.accent + '1f', borderColor: p.accent + '55', borderWidth: 1 }]}>
              <Text style={[s.btnText, { color: p.accentText }]}>{busy === 'mark' ? '…' : '↻ Mark to live'}</Text>
            </Pressable>
            <Pressable
              disabled={busy === 'reset'}
              onPress={() => labOp('reset', `All positions, history, and the equity curve are wiped — cash goes back to ${money(d.lab.startingCashCents)}.`)}
              style={[s.btn, { backgroundColor: p.neg + '1f', borderColor: p.neg + '55', borderWidth: 1 }]}
            >
              <Text style={[s.btnText, { color: p.neg }]}>Reset</Text>
            </Pressable>
          </View>

          {/* stat strip */}
          <Card style={s.statGrid}>
            <StatCell k="Equity" v={money(d.equityCents)} note={`${d.lab.status.toLowerCase()} · ${money(d.lab.startingCashCents)} start`} p={p} />
            <StatCell k="Cash" v={money(d.lab.cashCents)} note="incl. short proceeds" p={p} />
            <StatCell k="Short exposure" v={money(d.shortMktValCents)} tone={p.neg} note={`${d.open.length} open short${d.open.length === 1 ? '' : 's'}`} p={p} />
            <StatCell k="Realized P&L" v={signedMoney(d.realizedCents)} tone={pnlColor(d.realizedCents, p)} note="closed + called" p={p} />
          </Card>

          {/* margin health */}
          <Card style={h.call ? { borderColor: p.neg + '66' } : undefined}>
            <View style={s.marginHead}>
              <Text style={[s.marginLabel, { color: p.accentText }]}>MARGIN HEALTH</Text>
              <Text style={[s.metaSmall, tabular, { color: h.call ? p.neg : p.textMuted, fontFamily: h.call ? F.bold : F.reg }]}>
                {h.call ? 'MARGIN CALL — force-covering' : `${money(h.cushionCents)} cushion`}
              </Text>
            </View>
            <Text style={[s.metaSmall, tabular, { color: p.textMuted, marginTop: 3 }]}>
              equity {money(h.equityCents)} · maintenance needs {money(h.requiredCents)} ({d.lab.maintMarginPct}%)
            </Text>
            <View style={[s.marginTrack, { backgroundColor: p.cardHi }]}>
              <View
                style={[
                  s.marginFill,
                  {
                    width: `${Math.min(100, h.usedPct)}%`,
                    backgroundColor: h.usedPct >= 100 ? p.neg : h.usedPct >= 70 ? p.warn : p.pos,
                  },
                ]}
              />
            </View>
            <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 4 }]}>
              Margin used {Math.min(999, h.usedPct)}% of equity — at 100% the lab force-covers your worst short
              (a modeled margin call).
            </Text>
          </Card>
          </View>

          <Masonry columns={isWide ? 2 : 1} style={{ gap: 10 }}>
          {/* open a short */}
          <View>
            <SectionTitle sub="modeled, at the live quote — US names">Open a short</SectionTitle>
            <Card>
              <View style={s.formRow}>
                <TextInput
                  value={symbol}
                  onChangeText={setSymbol}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="ticker — e.g. GME"
                  placeholderTextColor={p.textMuted}
                  style={[s.input, { backgroundColor: p.cardHi, borderColor: p.cardBorder, color: p.textPrimary, flex: 1 }]}
                />
                <TextInput
                  value={size}
                  onChangeText={setSize}
                  keyboardType="number-pad"
                  style={[s.input, tabular, { backgroundColor: p.cardHi, borderColor: p.cardBorder, color: p.textPrimary, width: 90 }]}
                />
              </View>
              <View style={{ marginTop: 8 }}>
                <Segmented
                  options={[
                    { key: 'dollars', label: '$ notional' },
                    { key: 'shares', label: 'shares' },
                  ]}
                  value={mode}
                  onChange={setMode}
                />
              </View>
              <Pressable onPress={openShort} disabled={busy === 'open'} style={[s.shortBtn, { backgroundColor: p.neg + '1f', borderColor: p.neg + '55' }]}>
                {busy === 'open' ? <ActivityIndicator size="small" color={p.neg} /> : <Text style={[s.btnText, { color: p.neg }]}>SHORT IT</Text>}
              </Pressable>
              <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 8 }]}>
                Opens a modeled short at the live quote. Remember: the loss is unbounded, and you pay a modeled
                borrow fee to hold it.
              </Text>
            </Card>
          </View>

          {/* open shorts */}
          <View>
            <SectionTitle sub="live-marked · borrow accruing">Open shorts</SectionTitle>
            {d.open.length === 0 ? (
              <Card>
                <Text style={[s.empty, { color: p.textMuted }]}>
                  No open shorts — short a real name above and watch it play out, for the lesson, not the money.
                </Text>
              </Card>
            ) : (
              <View style={{ gap: 10 }}>
                {d.open.map((o) => (
                  <ShortCard key={o.id} h={o} p={p} onChanged={reloadAll} />
                ))}
              </View>
            )}
          </View>

          {/* resolved lessons */}
          {d.history.length > 0 && (
            <View>
              <SectionTitle sub="covered + margin-called">Resolved — the lessons</SectionTitle>
              <View style={{ gap: 8 }}>
                {d.history.map((r) => (
                  <Card key={r.id} style={r.side === 'MARGIN_CALL' ? { borderColor: p.neg + '55' } : undefined}>
                    <View style={s.shortHead}>
                      <Text style={[s.shortTitle, { color: p.textPrimary, flex: 1 }]}>
                        {r.qty}{' '}
                        <Text onPress={() => router.push(`/stock/${r.symbol}`)} style={{ color: p.accentText, textDecorationLine: 'underline' }}>
                          {r.symbol}
                        </Text>{' '}
                        @ {money(r.avgShortCents)} → {money(r.exitCents)}{' '}
                        <Text style={[s.pillText, { color: r.side === 'MARGIN_CALL' ? p.neg : p.textMuted }]}>
                          {r.side === 'MARGIN_CALL' ? 'MARGIN CALL' : 'covered'}
                        </Text>
                      </Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[s.meta, tabular, { color: pnlColor(r.realizedPnlCents, p), fontFamily: F.semi }]}>
                          {signedMoney(r.realizedPnlCents)}
                        </Text>
                        <Text style={[s.metaSmall, tabular, { color: r.returnPct >= 0 ? p.pos : p.neg }]}>{ret(r.returnPct)}</Text>
                      </View>
                    </View>
                    {r.card ? <Text style={[s.teachCard, { color: p.textMuted }]}>{r.card}</Text> : null}
                    {r.decay.length >= 2 && (
                      <View style={{ marginTop: 6, maxWidth: 240 }}>
                        <Sparkline values={r.decay} height={26} area />
                      </View>
                    )}
                  </Card>
                ))}
              </View>
            </View>
          )}

          {/* equity curve */}
          <View>
            <SectionTitle sub="return over time">Equity</SectionTitle>
            <Card>
              <DeskChart series={[{ label: 'Short Lab', color: p.neg, points: d.navHistory }]} height={150} />
            </Card>
          </View>

          {/* education */}
          <View>
            <SectionTitle sub="the five ideas">Shorting, explained</SectionTitle>
            <Card>
              {(
                [
                  ['Short selling.', "You borrow shares, sell them now, and must buy them back later. You profit if the price falls — a bet AGAINST a stock, the trade the long-only fund can't make."],
                  ['Unbounded loss.', 'A stock you own can only fall to zero, but a stock you’re short can rise forever — so your loss has NO cap. That’s the single most important difference from every other trade here. (A long put is the defined-risk way to bet down — see Learning ▸ Options.)'],
                  ['Cost to borrow.', "You're renting the shares — a hard-to-borrow name can cost a lot per year, and you pay any dividend while short. Time works against you even if you're eventually right."],
                  ['Margin & the margin call.', 'Shorting runs on borrowed collateral. If the stock rises against you and your equity falls below the maintenance line, you get force-covered at the worst possible moment — this lab models exactly that.'],
                  ['Short squeeze.', 'When a crowded short rallies, shorts scramble to cover, which pushes the price up further — a feedback loop with no long-side equivalent.'],
                ] as const
              ).map(([head, body], i) => (
                <Text key={head} style={[s.eduLine, { color: p.textMuted }, i > 0 && { marginTop: 8 }]}>
                  <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>{head} </Text>
                  {body}
                </Text>
              ))}
            </Card>
          </View>

          {/* shadow shorts */}
          {d.shadow && (
            <View>
              <SectionTitle sub="what if we'd shorted our exits?">Shadow shorts</SectionTitle>
              <Card>
                <Text style={[s.eduLine, { color: p.textMuted }]}>
                  Every time the fund sells a name, a modeled short opens here at that price — asking &ldquo;what
                  if, instead of just exiting, we&apos;d flipped to short?&rdquo; A running lesson on whether our
                  exits tend to keep falling. Pure observation; the fund never shorts.
                </Text>
                {d.shadow.count === 0 ? (
                  <Text style={[s.empty, { color: p.textMuted }]}>No exits shadowed yet — this fills in as the fund sells names.</Text>
                ) : (
                  <>
                    <View style={s.shadowStats}>
                      <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>
                        exits shadowed <Text style={{ color: p.textPrimary, fontFamily: F.semi }}>{d.shadow.count}</Text>
                      </Text>
                      <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>
                        avg return shorting them{' '}
                        <Text style={{ color: d.shadow.avgReturnPct >= 0 ? p.pos : p.neg, fontFamily: F.semi }}>{ret(d.shadow.avgReturnPct)}</Text>
                      </Text>
                      <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>
                        would&apos;ve profited <Text style={{ color: p.textPrimary, fontFamily: F.semi }}>{d.shadow.winRatePct}%</Text>
                      </Text>
                      <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>
                        modeled P&L{' '}
                        <Text style={{ color: pnlColor(d.shadow.totalUnrealCents, p), fontFamily: F.semi }}>{signedMoney(d.shadow.totalUnrealCents)}</Text>
                      </Text>
                    </View>
                    <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 6 }]}>
                      {d.shadow.avgReturnPct > 3
                        ? "Our exits have tended to keep falling — shorting them would've paid (a signal our sell discipline is timely)."
                        : d.shadow.avgReturnPct < -3
                          ? "Our exits have tended to bounce — shorting them would've hurt, a caution against betting they keep dropping."
                          : 'Roughly a wash so far — our exits neither cratered nor bounced hard.'}
                    </Text>
                    <View style={{ marginTop: 8 }}>
                      {d.shadow.positions.slice(0, 14).map((sp, i) => (
                        <View key={`${sp.symbol}-${i}`}>
                          {i > 0 && <Divider />}
                          <Pressable onPress={() => router.push(`/stock/${sp.symbol}`)} style={s.shadowRow}>
                            <Text style={[s.meta, { color: p.textPrimary, flex: 1 }]}>
                              {sp.qty} <Text style={{ color: p.accentText }}>{sp.symbol}</Text>
                            </Text>
                            <Text style={[s.metaSmall, tabular, { color: p.textMuted, width: 74, textAlign: 'right' }]}>
                              {money(sp.avgShortCents)}→{money(sp.markCents)}
                            </Text>
                            <Text style={[s.metaSmall, tabular, { color: pnlColor(sp.unrealCents, p), width: 88, textAlign: 'right' }]}>
                              {signedMoney(sp.unrealCents)} ({ret(sp.returnPct)})
                            </Text>
                            <Text style={[s.metaSmall, tabular, { color: p.textMuted, width: 30, textAlign: 'right' }]}>{sp.daysHeld}d</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </Card>
            </View>
          )}

          {/* agent A/B */}
          {desk.data && (
            <View>
              <SectionTitle sub={`long-only vs long+short · ${desk.data.desk.name}`}>Agent A/B</SectionTitle>
              <Card style={!desk.data.agentEnabled || desk.data.desk.status !== 'RUNNING' ? { borderColor: p.warn + '40' } : undefined}>
                <Text style={[s.eduLine, { color: p.textMuted }]}>
                  Two Opus agents, same {money(desk.data.desk.startingStakeCents)} stake and menu, one
                  difference: the <Text style={{ color: p.warn, fontFamily: F.semi }}>treatment</Text> may also
                  SHORT names it thinks will fall (the <Text style={{ color: p.pos, fontFamily: F.semi }}>control</Text>{' '}
                  is long-only, like the fund). Does betting against names help, or does the unbounded downside
                  + borrow cost + margin calls drag it?
                </Text>
                {!desk.data.agentEnabled ? (
                  <Text style={[s.metaSmall, { color: p.warn, marginTop: 8 }]}>
                    The A/B is OFF — it runs Opus sessions on Cam&apos;s quota. Set GRQ_SHORTLAB_AGENT=true and
                    Start it to run; it won&apos;t place any sessions until then.
                  </Text>
                ) : desk.data.desk.status !== 'RUNNING' ? (
                  <Text style={[s.metaSmall, { color: p.warn, marginTop: 8 }]}>
                    Enabled but {desk.data.desk.status.toLowerCase()} — Start runs it {desk.data.desk.cadence}.
                  </Text>
                ) : (
                  <Text style={[s.metaSmall, { color: p.pos, marginTop: 8 }]}>
                    Running {desk.data.desk.cadence} during market hours.
                  </Text>
                )}

                <View style={[s.controls, { marginTop: 10 }]}>
                  {desk.data.desk.status === 'RUNNING' ? (
                    <Pressable disabled={busy === 'desk-pause'} onPress={() => deskOp('pause')} style={[s.btn, { backgroundColor: p.warn + '1f', borderColor: p.warn + '55', borderWidth: 1 }]}>
                      <Text style={[s.btnText, { color: p.warn }]}>Pause</Text>
                    </Pressable>
                  ) : (
                    <Pressable disabled={busy === 'desk-start'} onPress={() => deskOp('start')} style={[s.btn, { backgroundColor: p.pos + '1f', borderColor: p.pos + '55', borderWidth: 1 }]}>
                      <Text style={[s.btnText, { color: p.pos }]}>Start</Text>
                    </Pressable>
                  )}
                  <Pressable
                    disabled={busy === 'desk-reset'}
                    onPress={() => deskOp('reset', 'Both arms go back to their stake and all positions/trades/history are wiped.')}
                    style={[s.btn, { backgroundColor: p.neg + '1f', borderColor: p.neg + '55', borderWidth: 1 }]}
                  >
                    <Text style={[s.btnText, { color: p.neg }]}>Reset</Text>
                  </Pressable>
                </View>

                {desk.data.arms.some((a) => (a.navHistory?.length ?? 0) >= 2) && (
                  <View style={{ marginTop: 10 }}>
                    <DeskChart
                      series={desk.data.arms.map((a) => ({ label: a.label, color: ARM_COLORS[a.arm] ?? p.accent, points: a.navHistory }))}
                      height={150}
                    />
                  </View>
                )}

                <View style={{ gap: 10, marginTop: 10 }}>
                  {desk.data.arms.map((a) => {
                    const treatment = a.arm === 'treatment';
                    return (
                      <View key={a.id} style={[s.armBox, { borderColor: p.cardBorder }]}>
                        <View style={s.shortHead}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                            <View style={[s.armDot, { backgroundColor: ARM_COLORS[a.arm] ?? p.accent }]} />
                            <Text style={[s.meta, { color: p.textPrimary, fontFamily: F.semi }]}>{a.label}</Text>
                            <Text style={[s.pillText, { color: treatment ? p.warn : p.textMuted }]}>
                              {treatment ? 'LONG + SHORT' : 'LONG ONLY'}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[s.meta, tabular, { color: p.textPrimary, fontFamily: F.semi }]}>{money(a.equityCents)}</Text>
                            <Text style={[s.metaSmall, tabular, { color: a.returnPct >= 0 ? p.pos : p.neg }]}>{ret(a.returnPct)}</Text>
                          </View>
                        </View>
                        <Text style={[s.metaSmall, tabular, { color: p.textMuted, marginTop: 3 }]}>
                          {Math.round((a.cashCents / Math.max(1, a.equityCents)) * 100)}% cash · {a.tradeCount} trades ·
                          realized {signedMoney(a.realizedCents)}
                        </Text>
                        {a.longs.length > 0 && (
                          <View style={{ marginTop: 6 }}>
                            <Text style={[s.armSectionLabel, { color: p.pos }]}>LONG</Text>
                            {a.longs.map((pos) => (
                              <View key={pos.symbol} style={s.posRow}>
                                <Text style={[s.metaSmall, { color: p.textMuted, flex: 1 }]}>
                                  {pos.qty} <Text style={{ color: p.accentText }}>{pos.symbol}</Text> @ {money(pos.avgCostCents)}
                                </Text>
                                <Text style={[s.metaSmall, tabular, { color: pnlColor(pos.unrealCents, p) }]}>{signedMoney(pos.unrealCents)}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        {a.shorts.length > 0 && (
                          <View style={{ marginTop: 6 }}>
                            <Text style={[s.armSectionLabel, { color: p.neg }]}>SHORT</Text>
                            {a.shorts.map((pos) => (
                              <View key={pos.symbol} style={s.posRow}>
                                <Text style={[s.metaSmall, { color: p.textMuted, flex: 1 }]}>
                                  SHORT {pos.qty} <Text style={{ color: p.accentText }}>{pos.symbol}</Text> @ {money(pos.avgCostCents)}
                                </Text>
                                <Text style={[s.metaSmall, tabular, { color: pnlColor(pos.unrealCents, p) }]}>{signedMoney(pos.unrealCents)}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        {a.calls.length > 0 && (
                          <View style={{ marginTop: 6 }}>
                            <MiniLabel>Recent calls</MiniLabel>
                            {a.calls.slice(0, 6).map((c, i) => (
                              <Text key={i} style={[s.metaSmall, { color: p.textMuted, marginTop: 2 }]} numberOfLines={2}>
                                <Text style={{ color: c.action === 'SHORT' ? p.neg : c.action === 'BUY' ? p.pos : p.textMuted, fontFamily: F.semi }}>
                                  {c.action ?? '—'}
                                </Text>{' '}
                                {c.symbol ?? ''}
                                {c.thesis ? ` — ${c.thesis}` : ''}
                                {c.filled ? <Text style={{ color: p.pos }}> · filled</Text> : c.rejectReason ? <Text style={{ color: p.warn }}> · {c.rejectReason}</Text> : null}
                              </Text>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </Card>
            </View>
          )}
          </Masonry>

          <Footnote>
            sandbox · modeled, never executable · the fund never shorts (a hard guardrail) · prices are
            live/delayed quotes; borrow cost + margin are modeled · single virtual book, no FX
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  controls: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  btnText: { fontFamily: F.semi, fontSize: 12 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '50%', paddingVertical: 6 },
  statLabel: { fontFamily: F.semi, fontSize: 8.5, letterSpacing: 1 },
  statValue: { fontFamily: F.semi, fontSize: 15, marginTop: 2 },
  statNote: { fontFamily: F.reg, fontSize: 9.5, marginTop: 1 },
  marginHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  marginLabel: { fontFamily: F.bold, fontSize: 9.5, letterSpacing: 1.5 },
  marginTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  marginFill: { height: 8, borderRadius: 4 },
  formRow: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontFamily: F.reg, fontSize: 13 },
  shortBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', marginTop: 10 },
  empty: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, paddingVertical: 8 },
  shortHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  shortTitle: { fontFamily: F.semi, fontSize: 13.5, lineHeight: 19 },
  shortPnl: { fontFamily: F.semi, fontSize: 14 },
  teachCard: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 17, marginTop: 6 },
  foldLink: { fontFamily: F.semi, fontSize: 9.5, letterSpacing: 1, marginTop: 8 },
  coverBtn: { borderRadius: 10, paddingVertical: 8, alignItems: 'center', marginTop: 10 },
  pillText: { fontFamily: F.bold, fontSize: 9, letterSpacing: 0.6 },
  meta: { fontFamily: F.reg, fontSize: 12 },
  metaSmall: { fontFamily: F.reg, fontSize: 10, lineHeight: 14 },
  eduLine: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 17 },
  shadowStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  shadowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7 },
  armBox: { borderWidth: 1, borderRadius: 12, padding: 10 },
  armDot: { width: 9, height: 9, borderRadius: 4.5 },
  armSectionLabel: { fontFamily: F.bold, fontSize: 8.5, letterSpacing: 1 },
  posRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
});
