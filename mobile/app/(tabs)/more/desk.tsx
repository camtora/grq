import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, Divider, MiniLabel, Segmented, Loading, ErrorNote } from '../../../components/Chrome';
import DeskChart from '../../../components/DeskChart';
import Sparkline from '../../../components/Sparkline';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money, signedMoney, pnlColor } from '../../../lib/format';
import { api } from '../../../services/api';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

// The web's fixed arm identity colours (ARM_COLORS) — theme-agnostic, matches the chart.
const ARM_COLORS: Record<string, string> = { control: '#5eead4', treatment: '#fbbf24' };

/* ---------- wire (web options-desk parity; optional fields degrade pre-deploy) ---------- */

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
  avgCostCents?: number;
  markCents?: number;
  currency?: string;
  breakevenCents?: number | null;
  maxLossCadCents?: number | null;
  decay?: number[] | null;
};
type DeskResolved = {
  kind: string;
  underlying: string;
  returnPct: number | null;
  realizedPnlCents: number | null;
  card: string | null;
  strikeCents?: number | null;
  expiry?: string | null;
  qty?: number;
  side?: string; // SELL_TO_CLOSE | EXPIRE
};
type DeskCall = {
  at: string;
  action: string | null;
  underlying: string | null;
  right: string | null;
  strikeCents: number | null;
  qty: number | null;
  thesis: string | null;
  filled: boolean;
  rejectReason: string | null;
};
type DeskArm = {
  entrantId: number;
  label: string;
  arm: string; // control | treatment
  returnPct: number;
  navCadCents: number;
  openOptionCount: number;
  tradeCount: number;
  cashPct?: number;
  navHistory?: { at: string; returnPct: number }[];
  holdings: DeskHolding[];
  resolved: DeskResolved[];
  calls?: DeskCall[];
};
type DeskResponse = {
  desks?: { id: number; name: string; status: string }[];
  current: {
    desk: { id: number; name: string; status: string; startingStakeCents: number; cadence?: string; startedAt?: string | null };
    realFundReturnPct: number | null;
    realFundNavCents?: number | null;
    arms: DeskArm[];
  } | null;
};

function retColor(pct: number, p: Palette): string {
  return pct > 0 ? p.pos : pct < 0 ? p.neg : p.textMuted;
}
function kindColor(kind: string, p: Palette): string {
  if (kind === 'CALL') return p.pos;
  if (kind === 'PUT') return p.warn;
  return p.textMuted;
}
const ret = (pct: number) => `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;

/* ---------- option position: the teaching card (web DeskRow parity) ---------- */

function OptionCard({ h, p }: { h: DeskHolding; p: Palette }) {
  const router = useRouter();
  const color = kindColor(h.kind, p);
  return (
    <View style={[s.optCard, { borderColor: p.warn + '33', backgroundColor: p.warn + '0d' }]}>
      <Pressable onPress={() => router.push(`/stock/${h.underlying}`)} style={s.optHead}>
        <Text style={[s.optTitle, { color: p.textPrimary }]}>
          <Text style={{ color: p.accentText }}>{h.underlying}</Text>
          {h.expiry ? ` ${h.expiry.slice(5)}` : ''} {h.strikeCents != null ? money(h.strikeCents) : ''}{' '}
          <Text style={{ color }}>{h.kind}</Text> <Text style={{ color: p.textMuted }}>×{h.qty}</Text>
        </Text>
        <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
          <Text style={[s.meta, tabular, { color: p.textPrimary }]}>{money(h.mvCadCents)}</Text>
          {h.unrealCadCents != null && (
            <Text style={[s.metaSmall, tabular, { color: pnlColor(h.unrealCadCents, p) }]}>{signedMoney(h.unrealCadCents)}</Text>
          )}
        </View>
      </Pressable>
      {h.card && <Text style={[s.teachCard, { color: p.textMuted }]}>{h.card}</Text>}
      <View style={s.statLine}>
        {h.avgCostCents != null && <Text style={[s.stat, tabular, { color: p.textMuted }]}>paid {money(h.avgCostCents)}/sh</Text>}
        {h.markCents != null && <Text style={[s.stat, tabular, { color: p.textMuted }]}>mark {money(h.markCents)}/sh</Text>}
        {h.breakevenCents != null && <Text style={[s.stat, tabular, { color: p.textMuted }]}>breakeven {money(h.breakevenCents)}</Text>}
        {h.maxLossCadCents != null && <Text style={[s.stat, tabular, { color: p.textMuted }]}>max loss {money(h.maxLossCadCents)}</Text>}
        {h.daysLeft != null && <Text style={[s.stat, tabular, { color: p.textMuted }]}>{h.daysLeft}d left</Text>}
      </View>
      {h.decay && h.decay.length >= 2 && (
        <View style={{ marginTop: 6 }}>
          <View style={{ maxWidth: 200 }}>
            <Sparkline values={h.decay} height={24} />
          </View>
          <Text style={[s.decayNote, { color: p.textMuted }]}>
            premium vs entry — drifting below the line is time decay at work
          </Text>
        </View>
      )}
    </View>
  );
}

/* ---------- one arm ---------- */

function ArmCard({ a, p, deskStake }: { a: DeskArm; p: Palette; deskStake: number }) {
  const router = useRouter();
  const color = ARM_COLORS[a.arm] ?? p.accent;
  const stocks = a.holdings.filter((h) => h.kind === 'STOCK');
  const options = a.holdings.filter((h) => h.kind !== 'STOCK');
  const isTreatment = a.arm === 'treatment';
  void deskStake;

  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={s.armHead}>
        <View style={[s.armDot, { backgroundColor: color }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <Text style={[s.armLabel, { color: p.textPrimary }]}>{a.label}</Text>
            <Text style={[s.pill, { color: isTreatment ? p.accentText : p.textMuted, borderColor: (isTreatment ? p.accent : p.textMuted) + '55', backgroundColor: (isTreatment ? p.accent : p.textMuted) + '1a' }]}>
              {isTreatment ? 'options' : 'stock-only'}
            </Text>
          </View>
          <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>
            {a.cashPct != null ? `${Math.round(a.cashPct)}% cash · ` : ''}
            {a.tradeCount} trade{a.tradeCount === 1 ? '' : 's'}
            {isTreatment ? ` · ${a.openOptionCount} open option${a.openOptionCount === 1 ? '' : 's'}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.armRet, tabular, { color: retColor(a.returnPct, p) }]}>{ret(a.returnPct)}</Text>
          <Text style={[s.meta, tabular, { color: p.textMuted }]}>{money(a.navCadCents)}</Text>
        </View>
      </View>
      {(a.navHistory?.length ?? 0) >= 2 && (
        <View style={{ marginTop: 8 }}>
          <Sparkline values={a.navHistory!.map((h) => h.returnPct)} height={28} />
        </View>
      )}

      {options.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <MiniLabel>Option positions</MiniLabel>
          <View style={{ gap: 8 }}>
            {options.map((h, i) => (
              <OptionCard key={`${h.underlying}-${h.kind}-${i}`} h={h} p={p} />
            ))}
          </View>
        </View>
      )}

      {a.resolved.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <MiniLabel>Resolved options — the punchlines</MiniLabel>
          <View style={{ gap: 8 }}>
            {a.resolved.map((r, i) => (
              <View key={`${r.underlying}-${i}`} style={[s.optCard, { borderColor: p.cardBorder, backgroundColor: p.cardHi + '44' }]}>
                <View style={s.optHead}>
                  <Text style={[s.optTitle, { color: p.textPrimary }]}>
                    <Text style={{ color: p.accentText }} onPress={() => router.push(`/stock/${r.underlying}`)}>
                      {r.underlying}
                    </Text>
                    {r.expiry ? ` ${r.expiry.slice(5)}` : ''} {r.strikeCents != null ? money(r.strikeCents) : ''}{' '}
                    <Text style={{ color: kindColor(r.kind, p) }}>{r.kind}</Text>
                    {r.qty != null ? <Text style={{ color: p.textMuted }}> ×{r.qty}</Text> : null}{' '}
                    <Text style={[s.metaSmall, { color: p.textMuted }]}>{r.side === 'EXPIRE' ? 'expired' : 'closed'}</Text>
                  </Text>
                  <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
                    {r.realizedPnlCents != null && (
                      <Text style={[s.meta, tabular, { color: pnlColor(r.realizedPnlCents, p) }]}>{signedMoney(r.realizedPnlCents)}</Text>
                    )}
                    {r.returnPct != null && (
                      <Text style={[s.metaSmall, tabular, { color: retColor(r.returnPct, p) }]}>{ret(r.returnPct)}</Text>
                    )}
                  </View>
                </View>
                {r.card && <Text style={[s.teachCard, { color: p.textMuted }]}>{r.card}</Text>}
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ marginTop: 12 }}>
        <MiniLabel>Stock holdings</MiniLabel>
        {stocks.length === 0 ? (
          <Text style={[s.meta, { color: p.textMuted }]}>No stock positions.</Text>
        ) : (
          stocks.map((h, i) => (
            <View key={h.underlying}>
              {i > 0 && <Divider />}
              <Pressable onPress={() => router.push(`/stock/${h.underlying}`)} style={s.stockRow}>
                <Text style={[s.sym, { color: p.accentText }]}>{h.underlying}</Text>
                <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>
                  {h.qty} @ {h.avgCostCents != null ? money(h.avgCostCents) : '—'}
                  {h.currency === 'USD' ? ' US' : ''}
                </Text>
                <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
                  <Text style={[s.meta, tabular, { color: p.textPrimary }]}>{money(h.mvCadCents)}</Text>
                  {h.unrealCadCents != null && h.unrealCadCents !== 0 && (
                    <Text style={[s.metaSmall, tabular, { color: pnlColor(h.unrealCadCents, p) }]}>{signedMoney(h.unrealCadCents)}</Text>
                  )}
                </View>
              </Pressable>
            </View>
          ))
        )}
      </View>

      {(a.calls?.length ?? 0) > 0 && (
        <View style={{ marginTop: 12 }}>
          <MiniLabel>Recent calls</MiniLabel>
          <View style={{ gap: 6 }}>
            {a.calls!.map((c, i) => {
              const verb =
                c.action === 'BUY' ? 'BUY' : c.action === 'SELL' ? 'SELL' : c.action === 'BUY_OPTION' ? 'BUY OPT' : c.action === 'SELL_OPTION' ? 'CLOSE' : (c.action ?? '—');
              const tone =
                c.action === 'BUY' || c.action === 'BUY_OPTION' ? p.pos : c.action === 'SELL' || c.action === 'SELL_OPTION' ? p.neg : p.textMuted;
              return (
                <View key={i} style={s.callRow}>
                  <Text style={[s.callVerb, { color: tone }]}>{verb}</Text>
                  <Text style={[s.callBody, { color: p.textMuted }]}>
                    {c.underlying ? (
                      <Text style={{ color: p.textPrimary, fontFamily: F.semi }}>
                        {c.underlying}
                        {c.right ? ` ${c.strikeCents != null ? money(c.strikeCents) + ' ' : ''}${c.right}` : ''}
                        {c.qty ? ` ×${c.qty}` : ''}{' '}
                      </Text>
                    ) : null}
                    {c.thesis ?? ''}
                    {c.filled ? <Text style={{ color: p.pos }}> · filled</Text> : c.rejectReason ? <Text style={{ color: p.warn }}> · rejected: {c.rejectReason}</Text> : null}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </Card>
  );
}

/* ---------- collapsible explainer (the web's <details> cards) ---------- */

function Explainer({ title, children, p }: { title: string; children: React.ReactNode; p: Palette }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ marginTop: 10 }}>
      <Pressable onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[s.expTitle, { color: p.textMuted }]}>{title}</Text>
        <Text style={{ color: p.textMuted, marginLeft: 'auto', fontSize: 12 }}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && <View style={{ marginTop: 10, gap: 8 }}>{children}</View>}
    </Card>
  );
}

function Bullet({ head, rest, p }: { head: string; rest: string; p: Palette }) {
  return (
    <Text style={[s.expBody, { color: p.textMuted }]}>
      <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>{head} </Text>
      {rest}
    </Text>
  );
}

/* ---------- the page ---------- */

/** The Options Desk (D91/D92) — web /options-desk parity. A sandbox A/B: a
 * CONTROL (Opus, stock-only) vs a TREATMENT (Opus + the power to BUY calls and
 * puts). Every option carries its plain-English teaching card. Pure sandbox —
 * the real fund is code-blocked from options and that isn't changing here. */
export default function DeskScreen() {
  const { p } = usePalette();
  const [deskId, setDeskId] = useState<number | null>(null);
  const { data: d, error, loading, refreshing, refresh, reload } = useApi<DeskResponse>(
    `/api/desk${deskId != null ? `?id=${deskId}` : ''}`,
  );
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCadence, setNewCadence] = useState<'daily' | 'hourly'>('daily');
  const [newStake, setNewStake] = useState('50000');

  const cur = d?.current;

  const act = (op: string, confirmMsg?: string) => {
    const go = async () => {
      if (!cur) return;
      setBusy(true);
      try {
        await api(`/api/desk/${cur.desk.id}`, { method: 'POST', body: JSON.stringify({ op }) });
        if (op === 'delete') setDeskId(null);
        reload();
      } catch (e) {
        Alert.alert('Desk', e instanceof Error ? e.message : 'Action failed.');
      } finally {
        setBusy(false);
      }
    };
    if (confirmMsg) {
      Alert.alert(`${op[0].toUpperCase()}${op.slice(1)} desk?`, confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: op[0].toUpperCase() + op.slice(1), style: 'destructive', onPress: () => void go() },
      ]);
    } else void go();
  };

  const createDesk = async () => {
    setBusy(true);
    try {
      const res = await api<{ deskId: number }>('/api/desk', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim() || 'New Desk',
          cadence: newCadence,
          startingStakeCents: Math.round((Number(newStake) || 0) * 100),
        }),
      });
      setShowNew(false);
      setNewName('');
      setDeskId(res.deskId);
      reload();
    } catch (e) {
      Alert.alert('New desk', e instanceof Error ? e.message : 'Could not create the desk.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubScreen title="Options Desk" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View style={{ marginTop: 8 }}>
          <Text style={[s.intro, { color: p.textMuted }]}>
            Same money, same menu, one difference: one Opus can only buy and sell stocks (exactly what the
            fund does today); the other can ALSO buy call and put options. Which one compounds better? A pure
            sandbox — and a place to learn how options actually work, on real names.
          </Text>

          {/* desk switcher + new desk */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.deskRow}>
            {(d.desks ?? []).map((desk) => {
              const on = cur?.desk.id === desk.id;
              return (
                <Pressable
                  key={desk.id}
                  onPress={() => setDeskId(desk.id)}
                  style={[s.chip, { borderColor: on ? p.accent + '88' : p.cardBorder, backgroundColor: on ? p.accent + '26' : p.cardBg }]}
                >
                  <Text style={{ color: on ? p.accentText : p.textMuted, fontFamily: on ? F.semi : F.med, fontSize: 11.5 }}>
                    {desk.name} {desk.status === 'RUNNING' ? '●' : desk.status === 'PAUSED' ? '❚❚' : '■'}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setShowNew(!showNew)} style={[s.chip, { borderColor: p.cardBorder, backgroundColor: p.cardHi }]}>
              <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 11.5 }}>＋ new desk</Text>
            </Pressable>
          </ScrollView>

          {showNew && (
            <Card style={{ marginBottom: 10 }}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="name — e.g. Earnings-season desk"
                placeholderTextColor={p.textMuted}
                style={[s.input, { backgroundColor: p.cardHi, borderColor: p.cardBorder, color: p.textPrimary }]}
              />
              <View style={{ marginTop: 8 }}>
                <Segmented
                  options={[
                    { key: 'daily', label: 'daily cadence' },
                    { key: 'hourly', label: 'hourly cadence' },
                  ]}
                  value={newCadence}
                  onChange={setNewCadence}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Text style={[s.meta, { color: p.textMuted }]}>stake each CA$</Text>
                <TextInput
                  value={newStake}
                  onChangeText={setNewStake}
                  keyboardType="number-pad"
                  style={[s.input, { backgroundColor: p.cardHi, borderColor: p.cardBorder, color: p.textPrimary, width: 100, flex: 0 }]}
                />
                <Pressable onPress={createDesk} disabled={busy} style={[s.btn, { backgroundColor: p.accent + '26' }]}>
                  {busy ? <ActivityIndicator size="small" color={p.accentText} /> : <Text style={[s.btnText, { color: p.accentText }]}>Start desk</Text>}
                </Pressable>
              </View>
              <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 8 }]}>
                two arms spawn automatically — a control (Opus, stock-only) and a treatment (Opus, +options)
              </Text>
            </Card>
          )}

          {!cur || cur.arms.length === 0 ? (
            <Card>
              <Text style={[s.meta, { color: p.textMuted, paddingVertical: 8 }]}>No desk yet — spin one up with ＋ new desk above.</Text>
            </Card>
          ) : (
            <>
              {/* meta + member controls */}
              <View style={s.metaRow}>
                <Text style={[s.metaSmall, tabular, { color: p.textMuted, flex: 1 }]}>
                  <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>{cur.desk.name}</Text> · {cur.arms.length} arms
                  {cur.desk.cadence ? ` · ${cur.desk.cadence}` : ''} · {money(cur.desk.startingStakeCents)} each ·{' '}
                  <Text style={{ color: cur.desk.status === 'RUNNING' ? p.pos : p.warn }}>{cur.desk.status}</Text>
                  {cur.desk.startedAt ? ` · since ${cur.desk.startedAt.slice(0, 10)}` : ''}
                </Text>
              </View>
              <View style={s.controls}>
                {cur.desk.status === 'RUNNING' ? (
                  <Pressable disabled={busy} onPress={() => act('pause')} style={[s.btn, { backgroundColor: p.warn + '1f', borderColor: p.warn + '55', borderWidth: 1 }]}>
                    <Text style={[s.btnText, { color: p.warn }]}>Pause</Text>
                  </Pressable>
                ) : (
                  <Pressable disabled={busy} onPress={() => act('start')} style={[s.btn, { backgroundColor: p.pos + '1f', borderColor: p.pos + '55', borderWidth: 1 }]}>
                    <Text style={[s.btnText, { color: p.pos }]}>{cur.desk.status === 'ENDED' ? 'Reopen' : 'Start'}</Text>
                  </Pressable>
                )}
                <Pressable
                  disabled={busy}
                  onPress={() => act('reset', 'Both arms go back to their starting stake and all trades + history are wiped.')}
                  style={[s.btn, { backgroundColor: p.accent + '1f', borderColor: p.accent + '55', borderWidth: 1 }]}
                >
                  <Text style={[s.btnText, { color: p.accentText }]}>Reset</Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => act('delete', "Removes both arms and all history — can't be undone.")}
                  style={[s.btn, { backgroundColor: p.neg + '1f', borderColor: p.neg + '55', borderWidth: 1 }]}
                >
                  <Text style={[s.btnText, { color: p.neg }]}>Delete</Text>
                </Pressable>
              </View>

              {/* return over time */}
              <SectionTitle sub="both arms, same axis">Return over time</SectionTitle>
              <Card>
                <DeskChart
                  series={cur.arms.map((a) => ({
                    label: a.label,
                    color: ARM_COLORS[a.arm] ?? p.accent,
                    points: a.navHistory ?? [],
                  }))}
                />
              </Card>

              {/* the two arms */}
              <SectionTitle sub="position for position">The two arms</SectionTitle>
              {cur.arms.map((a) => (
                <ArmCard key={a.entrantId} a={a} p={p} deskStake={cur.desk.startingStakeCents} />
              ))}

              {cur.realFundReturnPct != null && (
                <Card style={{ marginBottom: 4 }}>
                  <Text style={[s.meta, { color: p.textMuted, lineHeight: 17 }]}>
                    <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>Reference — the real fund (Opus, live + tooled): </Text>
                    <Text style={[tabular, { color: retColor(cur.realFundReturnPct, p), fontFamily: F.semi }]}>{ret(cur.realFundReturnPct)}</Text>
                    {cur.realFundNavCents != null ? ` on ${money(cur.realFundNavCents)} NAV. ` : '. '}
                    Not directly comparable — shown for context only.
                  </Text>
                </Card>
              )}

              {/* the literacy layer (web's three <details> cards) */}
              <Explainer title="OPTIONS IN FIVE TERMS (FOR CAM & GRAHAM)" p={p}>
                <Bullet head="Option." rest="A contract — the right (not obligation) to buy or sell 100 shares at a fixed price by a fixed date. You pay a price for it called the premium. Options are NOT shorting." p={p} />
                <Bullet head="Call vs put." rest="Buy a call if you think the stock goes UP; buy a put if you think it goes DOWN. A put is how the treatment bets on a decline — something the stock-only fund simply can't do." p={p} />
                <Bullet head="Strike." rest="The fixed price in the contract. A call only pays off above it; a put only below it." p={p} />
                <Bullet head="Premium & max loss." rest="What you pay up front. When you BUY an option (all this desk ever does), that premium is the most you can lose — nothing more. Defined risk." p={p} />
                <Bullet head="Expiry & time decay." rest="Options expire, and they bleed a little value every day the stock sits still. You can be right on direction and still lose by running out of time — watch this play out in the cards above." p={p} />
              </Explainer>

              <Explainer title="HOW THE OPTIONS DESK WORKS" p={p}>
                <Bullet head="Control vs treatment." rest={`Both arms are Opus with the same ${money(cur.desk.startingStakeCents)} stake and the same researched menu. The only difference is the treatment may also buy options — buy-to-open only, never selling/writing, never spreads, so its risk is always defined.`} p={p} />
                <Bullet head="Deterministic contracts." rest="The treatment picks the underlying, the direction, and a coarse bias (at-the-money or slightly out); the desk resolves the exact strike and a ~30–60-day expiry. That keeps the comparison about judgment, not strike-picking." p={p} />
                <Bullet head="A pure sandbox." rest="Every fill lands only in this desk's own book — it never touches the real fund, the order gate, or the broker, and it never trades a real option. The fund's no-options guardrail is unchanged." p={p} />
              </Explainer>

              <Explainer title="WHY THE TEST IS BUILT THIS WAY" p={p}>
                <Bullet head="The one rule." rest="A comparison only means something if exactly one thing differs between the two arms — here, the options power. Everything below either keeps the arms identical, keeps every position defined-risk, or is a limit we chose not to fight yet." p={p} />
                <Bullet head="Phases." rest="0 Design (done) · 1 Engine + desk + this page (live) · 2 Literacy + controls — the expiry punchline card, the decay sparkline, desk controls, the push nudge (live) · 3 Deferred — tooled arms, spreads, an options overlay on the real fund." p={p} />
                <Bullet head="Deliberately in." rest="Two blind arms (same model, stake, menu, cadence, no tools). Calls AND puts — the put tests something the real fund can't do at all. Buy-to-open only, so the most either can lose is the premium. The real fund as a reference line, never scored against." p={p} />
                <Bullet head="Left out — and why." rest="The real agent as control (it differs on two things, not one). Tools for either arm (keeps the test clean and cheap). Selling/writing and spreads (unlimited risk / complexity). Canadian names & real money — the options feed is US-only, and per the guardrail this never trades a real option." p={p} />
              </Explainer>

              <Footnote>
                sandbox · option prices are MODELED (CBOE delayed ~15-min mid, or Black-Scholes from implied
                volatility) — educational, not executable · options are US-only; CA names have none · books are
                CAD; US fills convert at the live FX rate · learn the mechanics in More ▸ Learning ▸ Options
              </Footnote>
            </>
          )}
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  deskRow: { flexDirection: 'row', gap: 6, paddingVertical: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontFamily: F.reg, fontSize: 12.5 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  btnText: { fontFamily: F.semi, fontSize: 12 },
  metaRow: { marginBottom: 8 },
  controls: { flexDirection: 'row', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  armHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  armDot: { width: 10, height: 10, borderRadius: 5 },
  armLabel: { fontFamily: F.semi, fontSize: 14 },
  armRet: { fontFamily: 'System', fontWeight: '800', fontSize: 16 },
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
  meta: { fontFamily: F.reg, fontSize: 11 },
  metaSmall: { fontFamily: F.reg, fontSize: 10, marginTop: 1 },
  optCard: { borderWidth: 1, borderRadius: 12, padding: 10 },
  optHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  optTitle: { fontFamily: F.semi, fontSize: 12.5, flex: 1, lineHeight: 18 },
  teachCard: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 17, marginTop: 6 },
  statLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  stat: { fontFamily: F.reg, fontSize: 9.5 },
  decayNote: { fontFamily: F.reg, fontSize: 9, marginTop: 2 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  sym: { fontFamily: F.semi, fontSize: 13 },
  callRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  callVerb: { fontFamily: F.bold, fontSize: 10.5, width: 52 },
  callBody: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 16, flex: 1 },
  expTitle: { fontFamily: F.semi, fontSize: 10.5, letterSpacing: 1 },
  expBody: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 17 },
});
