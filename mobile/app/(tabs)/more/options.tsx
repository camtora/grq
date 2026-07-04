import React, { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, MiniLabel, Loading, ErrorNote } from '../../../components/Chrome';
import PayoffChart from '../../../components/options/PayoffChart';
import Sparkline from '../../../components/Sparkline';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money, signedMoney, pnlColor } from '../../../lib/format';
import { useApi, useLiveQuote } from '../../../services/hooks';
import { STRATEGY_LIST, STRATEGIES, seedLegs, buildStrategyLegs, optionTemplates, type StrategyKey, type LegValue } from '../../../lib/options/strategies';
import { payoffStats } from '../../../lib/options/payoff';
import { probOfProfit } from '../../../lib/options/probability';
import { netGreeks } from '../../../lib/options/greeks';

const tabular = { fontVariant: ['tabular-nums' as const] };

/* ---------- tap-to-explain terms (the literacy pillar; web <Term> parity) ---------- */

const TERMS: Record<string, string> = {
  option: 'A contract: the right — not the obligation — to buy or sell 100 shares at a fixed price by a fixed date. You pay a price for it called the premium.',
  call: "The right to BUY 100 shares at the strike. You buy a call when you think the stock goes UP.",
  put: "The right to SELL 100 shares at the strike. You buy a put when you think the stock goes DOWN — the bearish trade a stock-only fund can't make.",
  premium: "The price of the option itself. When you BUY an option, the premium is the most you can lose.",
  strike: 'The fixed price written into the contract. A call only pays off above it; a put only below it.',
  moneyness: 'Whether the stock is past the strike: in the money (past it), at the money (right at it), or out of the money (not yet).',
  'intrinsic value': "The exercise-right-now value — how far the option is in the money. Zero if it isn't.",
  'time value': 'The rest of the premium — what you pay for the time and uncertainty left. An at-the-money option is ALL time value.',
  'time decay': 'Options bleed a little value every day the stock sits still, faster near expiry. You can be right on direction and still lose to the clock.',
  expiry: 'The date the contract dies. After it, an option is worth only its intrinsic value — often nothing.',
  delta: 'How much the premium moves per $1 move in the stock — and a rough read on its odds of finishing in the money.',
  gamma: 'How fast delta itself changes as the stock moves — the acceleration. Highest near the money, close to expiry.',
  theta: 'The dollars an option loses per day to time decay. The rent you pay to hold the bet.',
  vega: 'How much the premium moves when implied volatility shifts by one point.',
  'implied volatility': "The market's guess at how much the stock will move, backed out of option prices. Higher IV = pricier options.",
  'covered call': 'Own 100 shares and sell a call against them for income — you keep the premium but cap your upside at the strike.',
  'cash-secured put': 'Sell a put and hold the cash to honour it — you get paid to maybe buy the stock at a lower price.',
};

function T({ k, children, p }: { k: string; children?: React.ReactNode; p: Palette }) {
  return (
    <Text
      onPress={() => Alert.alert(k[0].toUpperCase() + k.slice(1), TERMS[k] ?? '')}
      style={{ color: p.accentText, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}
    >
      {children ?? k}
    </Text>
  );
}

/* ---------- Learn (the five lessons, web OptionsLearn parity) ---------- */

function Learn({ p, goCalc }: { p: Palette; goCalc: () => void }) {
  const L = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ marginTop: 4 }}>
      <MiniLabel>{title}</MiniLabel>
      <Card>
        <Text style={[s.lesson, { color: p.textMuted }]}>{children}</Text>
      </Card>
    </View>
  );
  return (
    <View style={{ gap: 10 }}>
      <Card>
        <Text style={[s.lesson, { color: p.textMuted }]}>
          An <T k="option" p={p} /> is a contract: the right — not the obligation — to buy or sell 100 shares at a
          fixed price by a fixed date. You pay a price for it called the <T k="premium" p={p} />. That&apos;s the whole
          idea. The rest is learning where each one pays off, what eats its value, and how to read the picture. Tap
          any dotted term for what it means, and head to the{' '}
          <Text onPress={goCalc} style={{ color: p.accentText, fontFamily: F.semi }}>
            Calculator
          </Text>{' '}
          to watch it play out.
        </Text>
      </Card>
      <L title="1 · Calls and puts">
        Buy a <T k="call" p={p} /> if you think the stock goes UP; buy a <T k="put" p={p} /> if you think it goes DOWN.
        A put is how you bet on a decline — exactly the trade the stock-only fund can&apos;t make.{'\n\n'}Each contract
        controls 100 shares, so a premium quoted at $2.50 costs you $250. When you buy an option, that premium is the
        most you can lose — defined risk. (You can also sell options for income, which flips the risk around —
        that&apos;s the <T k="covered call" p={p} /> and <T k="cash-secured put" p={p} /> on the calculator.)
      </L>
      <L title="2 · Strike, and what the premium is made of">
        The <T k="strike" p={p} /> is the fixed price in the contract. A call only pays off above it; a put only below
        it. Whether the stock is past the strike is its <T k="moneyness" p={p} />.{'\n\n'}A premium is two parts:{' '}
        <T k="intrinsic value" p={p} /> (real, exercise-now value if it&apos;s in the money) plus{' '}
        <T k="time value" p={p} /> (what you pay for the time and uncertainty left). An at-the-money option is ALL time
        value — which is why it has the most to lose to the clock.
      </L>
      <L title="3 · The two ways to lose: direction and time">
        You can be wrong on direction — that&apos;s obvious. But you can also be RIGHT and still lose, because options
        bleed value every day through <T k="time decay" p={p} />. The closer to <T k="expiry" p={p} />, the faster the
        bleed.{'\n\n'}That&apos;s the trade-off options make you confront: leverage and defined risk, but on a
        deadline. The calculator&apos;s dashed &ldquo;today&rdquo; line versus the solid &ldquo;at expiry&rdquo; line
        shows exactly how much the clock is costing you.
      </L>
      <L title="4 · The Greeks — the dashboard">
        The four Greeks describe how an option reacts before the stock even moves:{'\n\n'}
        <T k="delta" p={p}>Delta</T> — how much the premium moves per $1 in the stock (and a rough read on its odds of
        finishing in the money).{'\n'}
        <T k="gamma" p={p}>Gamma</T> — how fast delta itself changes; the acceleration, highest near the money close to
        expiry.{'\n'}
        <T k="theta" p={p}>Theta</T> — the dollars lost per day to time decay. The rent you pay to hold the bet.{'\n'}
        <T k="vega" p={p}>Vega</T> — how much the premium moves when <T k="implied volatility" p={p} /> shifts a point.
      </L>
      <L title="5 · The eight strategies on the calculator">
        Two you buy (defined risk): long call, long put. Two you sell (income, different risk):{' '}
        <T k="covered call" p={p} />, <T k="cash-secured put" p={p} />. Plus four combinations: the bull call spread and
        bear put spread (cheaper, capped), and the straddle and strangle (big-move bets, either direction).
        {'\n\n'}The fund itself only ever BUYS options (defined risk) and never sells/writes them — the income
        strategies are here to teach the other side. The Options Desk experiment is watching whether adding options
        actually compounds better than stock alone.
      </L>
    </View>
  );
}

/* ---------- Calculator ---------- */

type CalcState = {
  strat: StrategyKey;
  sym: string;
  spotCents: number;
  ivPct: number;
  dte: number;
  contracts: number;
  legs: LegValue[];
};

function NumInput({
  label,
  value,
  onChange,
  p,
  width = 86,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  p: Palette;
  width?: number;
}) {
  return (
    <View style={{ width }}>
      <Text style={[s.inputLabel, { color: p.textMuted }]}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        style={[s.input, tabular, { backgroundColor: p.cardHi, borderColor: p.cardBorder, color: p.textPrimary }]}
      />
    </View>
  );
}

function Calculator({ calc, setCalc, p }: { calc: CalcState; setCalc: (c: CalcState) => void; p: Palette }) {
  const spec = STRATEGIES[calc.strat];
  const legsDirty = useRef(false);
  const live = useLiveQuote(calc.sym.trim() ? calc.sym.trim().toUpperCase() : null);

  const reseed = (next: Partial<CalcState>) => {
    const merged = { ...calc, ...next };
    const seeded = seedLegs(STRATEGIES[merged.strat], merged.spotCents, merged.ivPct / 100, merged.dte);
    legsDirty.current = false;
    setCalc({ ...merged, legs: seeded });
  };

  const built = useMemo(
    () =>
      buildStrategyLegs(spec, {
        spotCents: calc.spotCents,
        ivFrac: calc.ivPct / 100,
        dte: calc.dte,
        contracts: calc.contracts,
        legs: calc.legs,
      }),
    [spec, calc],
  );
  const stats = useMemo(() => payoffStats(built, calc.spotCents), [built, calc.spotCents]);
  const pop = useMemo(
    () => probOfProfit(built, calc.spotCents, calc.ivPct / 100, calc.dte / 365),
    [built, calc.spotCents, calc.ivPct, calc.dte],
  );
  const greeks = useMemo(
    () =>
      netGreeks(
        built.map((l) =>
          l.kind === 'STOCK'
            ? { kind: 'STOCK' as const, action: l.action, qty: l.qty }
            : { kind: l.kind, action: l.action, qty: l.qty, strikeCents: l.strikeCents, ivFrac: l.ivFrac, daysLeft: l.dteAtEntry },
        ),
        calc.spotCents,
      ),
    [built, calc.spotCents],
  );
  const tpls = optionTemplates(spec);
  const $ = (c: number) => (c / 100).toFixed(2);

  return (
    <View style={{ gap: 10 }}>
      {/* strategy picker */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {STRATEGY_LIST.map((st) => {
          const on = st.key === calc.strat;
          const oc = st.outlook === 'bullish' ? p.pos : st.outlook === 'bearish' ? p.neg : p.warn;
          return (
            <Pressable
              key={st.key}
              onPress={() => reseed({ strat: st.key })}
              style={[s.chip, { borderColor: on ? p.accent + '88' : p.cardBorder, backgroundColor: on ? p.accent + '26' : p.cardBg }]}
            >
              <Text style={{ color: on ? p.accentText : p.textMuted, fontFamily: on ? F.semi : F.med, fontSize: 11.5 }}>
                <Text style={{ color: oc }}>●</Text> {st.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={[s.tagline, { color: p.textMuted }]}>{spec.tagline}</Text>

      {/* inputs */}
      <Card>
        <View style={s.inputRow}>
          <View style={{ width: 86 }}>
            <Text style={[s.inputLabel, { color: p.textMuted }]}>SYMBOL (OPT)</Text>
            <TextInput
              value={calc.sym}
              onChangeText={(v) => setCalc({ ...calc, sym: v })}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="AAPL"
              placeholderTextColor={p.textMuted}
              style={[s.input, { backgroundColor: p.cardHi, borderColor: p.cardBorder, color: p.textPrimary }]}
            />
          </View>
          <NumInput label="Spot $" value={$(calc.spotCents)} onChange={(v) => reseed({ spotCents: Math.max(100, Math.round((parseFloat(v) || 0) * 100)) })} p={p} />
          <NumInput label="IV %" value={String(calc.ivPct)} onChange={(v) => reseed({ ivPct: Math.max(1, Math.min(400, Math.round(parseFloat(v) || 0))) })} p={p} width={64} />
          <NumInput label="Days" value={String(calc.dte)} onChange={(v) => reseed({ dte: Math.max(0, Math.min(1095, Math.round(parseFloat(v) || 0))) })} p={p} width={64} />
          <NumInput label="Contracts" value={String(calc.contracts)} onChange={(v) => setCalc({ ...calc, contracts: Math.max(1, Math.min(999, Math.round(parseFloat(v) || 1))) })} p={p} width={78} />
        </View>
        {live && (
          <Pressable onPress={() => reseed({ spotCents: live.priceCents })}>
            <Text style={[s.liveLine, { color: p.accentText }]}>
              {calc.sym.trim().toUpperCase()} live {money(live.priceCents)} — tap to use as spot
            </Text>
          </Pressable>
        )}
        {/* per-leg strike/premium */}
        <View style={[s.inputRow, { marginTop: 10 }]}>
          {tpls.map((tpl, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <NumInput
                label={`${tpl.action === 'SELL' ? 'sell ' : ''}${tpl.label} $`}
                value={$(calc.legs[i]?.strikeCents ?? 0)}
                onChange={(v) => {
                  const legs = calc.legs.map((l, j) => (j === i ? { ...l, strikeCents: Math.max(100, Math.round((parseFloat(v) || 0) * 100)) } : l));
                  legsDirty.current = true;
                  setCalc({ ...calc, legs });
                }}
                p={p}
                width={110}
              />
              <NumInput
                label="Premium $"
                value={$(calc.legs[i]?.premiumCents ?? 0)}
                onChange={(v) => {
                  const legs = calc.legs.map((l, j) => (j === i ? { ...l, premiumCents: Math.max(1, Math.round((parseFloat(v) || 0) * 100)) } : l));
                  legsDirty.current = true;
                  setCalc({ ...calc, legs });
                }}
                p={p}
                width={90}
              />
            </View>
          ))}
        </View>
        <Pressable onPress={() => reseed({})}>
          <Text style={[s.liveLine, { color: p.textMuted }]}>↻ reseed strikes & premiums from spot (Black-Scholes)</Text>
        </Pressable>
      </Card>

      {/* the picture */}
      <Card>
        <PayoffChart legs={built} spotCents={calc.spotCents} daysLeft={calc.dte} breakevens={stats.breakevensCents} />
      </Card>

      {/* the numbers */}
      <Card>
        <View style={s.statsRow}>
          <Stat k={stats.netDebitCents >= 0 ? 'YOU PAY' : 'YOU RECEIVE'} v={money(Math.abs(stats.netDebitCents))} p={p} />
          <Stat k="MAX PROFIT" v={stats.maxProfitCents == null ? 'unlimited' : money(stats.maxProfitCents)} p={p} tone={p.pos} />
          <Stat k="MAX LOSS" v={stats.maxLossCents == null ? 'unlimited' : money(Math.abs(stats.maxLossCents))} p={p} tone={p.neg} />
          <Stat k="BREAK-EVEN" v={stats.breakevensCents.length ? stats.breakevensCents.map((b) => money(b)).join(' · ') : '—'} p={p} />
          <Stat k="PROB OF PROFIT" v={`${Math.round(pop * 100)}%`} p={p} />
        </View>
        <Text style={[s.greeksLine, tabular, { color: p.textMuted }]}>
          net greeks · delta {greeks.delta.toFixed(0)} sh · gamma {greeks.gamma.toFixed(1)} · theta ${greeks.theta.toFixed(0)}/day · vega ${greeks.vega.toFixed(0)}/pt
        </Text>
      </Card>

      {/* the teaching panel */}
      <Card>
        <Text style={[s.teach, { color: p.textMuted }]}>{spec.teach}</Text>
        <View style={{ gap: 6, marginTop: 10 }}>
          <TeachLine k="The view" v={spec.view} p={p} />
          <TeachLine k="You profit when" v={spec.profitWhen} p={p} />
          <TeachLine k="You lose when" v={spec.lossWhen} p={p} />
          <TeachLine k="Time decay" v={spec.decay} p={p} />
          <TeachLine k="Worked example" v={spec.example} p={p} />
          <TeachLine k="Best for" v={spec.bestFor} p={p} />
        </View>
        <Text style={[s.riskNote, { color: p.warn }]}>{spec.riskNote}</Text>
      </Card>
    </View>
  );
}

function Stat({ k, v, p, tone }: { k: string; v: string; p: Palette; tone?: string }) {
  return (
    <Text style={[s.stat, tabular, { color: p.textMuted }]}>
      <Text style={{ fontSize: 9, letterSpacing: 0.5 }}>{k} </Text>
      <Text style={{ color: tone ?? p.textPrimary, fontFamily: F.semi }}>{v}</Text>
    </Text>
  );
}

function TeachLine({ k, v, p }: { k: string; v: string; p: Palette }) {
  return (
    <Text style={[s.teachLine, { color: p.textMuted }]}>
      <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>{k}. </Text>
      {v}
    </Text>
  );
}

/* ---------- Experiment (the desk's real fake contracts) ---------- */

type DeskWire = {
  current: {
    arms: {
      arm: string;
      holdings: {
        kind: string; underlying: string; qty: number; mvCadCents: number; unrealCadCents?: number | null;
        strikeCents?: number | null; expiry?: string | null; daysLeft?: number | null; card?: string | null;
        avgCostCents?: number; decay?: number[] | null;
      }[];
      resolved: { kind: string; underlying: string; returnPct: number | null; realizedPnlCents: number | null; card: string | null }[];
    }[];
  } | null;
};

function Experiment({ p, onLoad }: { p: Palette; onLoad: (c: Partial<CalcState>) => void }) {
  const { data: d, error, loading } = useApi<DeskWire>('/api/desk');
  const treatment = d?.current?.arms.find((a) => a.arm === 'treatment');
  const options = (treatment?.holdings ?? []).filter((h) => h.kind === 'CALL' || h.kind === 'PUT');
  const resolved = (treatment?.resolved ?? []).filter((r) => r.kind === 'CALL' || r.kind === 'PUT');

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;

  return (
    <View style={{ gap: 10 }}>
      <Text style={[s.tagline, { color: p.textMuted }]}>
        The Options Desk&apos;s ACTUAL modeled contracts — the treatment Opus&apos;s open calls and puts. Load one into
        the calculator to dissect it.
      </Text>
      {options.length === 0 && (
        <Card>
          <Text style={[s.tagline, { color: p.textMuted, paddingVertical: 6 }]}>
            No open option positions right now — check the Options Desk for the full experiment.
          </Text>
        </Card>
      )}
      {options.map((h, i) => (
        <Card key={i} style={{ borderColor: p.warn + '33' }}>
          <Text style={[s.optTitle, { color: p.textPrimary }]}>
            {h.underlying} {h.expiry?.slice(5) ?? ''} {h.strikeCents != null ? money(h.strikeCents) : ''}{' '}
            <Text style={{ color: h.kind === 'CALL' ? p.pos : p.warn }}>{h.kind}</Text>{' '}
            <Text style={{ color: p.textMuted }}>×{h.qty}</Text>
          </Text>
          {h.card && <Text style={[s.teach, { color: p.textMuted, marginTop: 6 }]}>{h.card}</Text>}
          <Text style={[s.greeksLine, tabular, { color: p.textMuted }]}>
            {money(h.mvCadCents)} CAD{h.unrealCadCents != null ? ` · ${signedMoney(h.unrealCadCents)}` : ''}
            {h.daysLeft != null ? ` · ${h.daysLeft}d left` : ''}
          </Text>
          {h.decay && h.decay.length >= 2 && (
            <View style={{ marginTop: 6, maxWidth: 220 }}>
              <Sparkline values={h.decay} height={26} />
              <Text style={[s.decayNote, { color: p.textMuted }]}>premium vs entry — time decay at work</Text>
            </View>
          )}
          <Pressable
            onPress={() =>
              onLoad({
                strat: h.kind === 'CALL' ? 'long-call' : 'long-put',
                sym: h.underlying,
                spotCents: h.strikeCents ?? 10000,
                dte: Math.max(1, h.daysLeft ?? 30),
                contracts: h.qty,
                legs: [{ strikeCents: h.strikeCents ?? 10000, premiumCents: h.avgCostCents ?? 100 }],
              })
            }
          >
            <Text style={[s.liveLine, { color: p.accentText }]}>Load into calculator →</Text>
          </Pressable>
        </Card>
      ))}
      {resolved.length > 0 && (
        <View>
          <MiniLabel>Resolved — the punchlines</MiniLabel>
          <View style={{ gap: 8 }}>
            {resolved.map((r, i) => (
              <Card key={i}>
                <Text style={[s.optTitle, { color: p.textPrimary }]}>
                  {r.underlying} <Text style={{ color: r.kind === 'CALL' ? p.pos : p.warn }}>{r.kind}</Text>{' '}
                  {r.realizedPnlCents != null && (
                    <Text style={[tabular, { color: pnlColor(r.realizedPnlCents, p) }]}>{signedMoney(r.realizedPnlCents)}</Text>
                  )}
                  {r.returnPct != null && (
                    <Text style={[tabular, { color: r.returnPct >= 0 ? p.pos : p.neg, fontSize: 11 }]}>
                      {' '}({r.returnPct >= 0 ? '+' : ''}{r.returnPct.toFixed(0)}%)
                    </Text>
                  )}
                </Text>
                {r.card && <Text style={[s.teach, { color: p.textMuted, marginTop: 6 }]}>{r.card}</Text>}
              </Card>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/* ---------- the page ---------- */

const TABS = [
  { key: 'learn', label: 'Learn' },
  { key: 'calculator', label: 'Calculator' },
  { key: 'experiment', label: 'Experiment' },
  { key: 'ask', label: 'Ask' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** Options — the education portal (web /options, D100): plain-English lessons, an
 * OPC-style payoff calculator on the ported pure-cents engines, the desk's live
 * modeled contracts, and Alfred to ask. EDUCATION ONLY — modeled, never executable;
 * the live fund is code-blocked from options. */
export default function OptionsLearningScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('learn');
  const [calc, setCalc] = useState<CalcState>(() => ({
    strat: 'long-call',
    sym: '',
    spotCents: 10000,
    ivPct: 35,
    dte: 45,
    contracts: 1,
    legs: seedLegs(STRATEGIES['long-call'], 10000, 0.35, 45),
  }));

  const loadIntoCalc = (partial: Partial<CalcState>) => {
    setCalc((prev) => ({ ...prev, ivPct: 35, ...partial }));
    setTab('calculator');
  };

  return (
    <SubScreen title="Options">
      <View style={{ marginTop: 8 }}>
        <Text style={[s.intro, { color: p.textMuted }]}>
          Learn how options actually work — lessons, a payoff calculator, and the desk experiment&apos;s real
          (modeled) contracts. Educational only: the live fund holds no options, by guardrail.
        </Text>

        <View style={s.tabRow}>
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[s.tabChip, { borderColor: on ? p.accent + '88' : p.cardBorder, backgroundColor: on ? p.accent + '26' : p.cardBg }]}
              >
                <Text style={{ color: on ? p.accentText : p.textMuted, fontFamily: on ? F.semi : F.med, fontSize: 12 }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'learn' && <Learn p={p} goCalc={() => setTab('calculator')} />}
        {tab === 'calculator' && <Calculator calc={calc} setCalc={setCalc} p={p} />}
        {tab === 'experiment' && <Experiment p={p} onLoad={loadIntoCalc} />}
        {tab === 'ask' && (
          <View style={{ gap: 10 }}>
            <Card>
              <Text style={[s.lesson, { color: p.textMuted }]}>
                Ask Alfred anything about options — what a term means, why a strategy fits (or doesn&apos;t), or what
                the desk experiment is holding and why. He can read the desk&apos;s live book.
              </Text>
              <Pressable onPress={() => router.push('/chat')} style={[s.askBtn, { backgroundColor: p.accent + '26' }]}>
                <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 13 }}>Ask Alfred →</Text>
              </Pressable>
            </Card>
            <Card>
              <Text style={[s.lesson, { color: p.textMuted }]}>
                Good starters: &ldquo;Explain the desk&apos;s open put like I&apos;m new to this.&rdquo; ·
                &ldquo;When would a covered call beat just holding?&rdquo; · &ldquo;What&apos;s implied volatility
                and why does it matter for the premium?&rdquo;
              </Text>
            </Card>
          </View>
        )}

        <Footnote>
          everything here is modeled (Black-Scholes / delayed quotes), never executable · prices education, not
          advice · the Options Desk experiment (More ▸ Options Desk) is the live A/B this teaches from
        </Footnote>
      </View>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  tabRow: { flexDirection: 'row', gap: 6, paddingVertical: 10, flexWrap: 'wrap' },
  tabChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6 },
  lesson: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 19 },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  tagline: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 16 },
  inputRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inputLabel: { fontFamily: F.semi, fontSize: 8, letterSpacing: 0.8, marginBottom: 3 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontFamily: F.reg, fontSize: 12.5 },
  liveLine: { fontFamily: F.semi, fontSize: 11, marginTop: 8 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { fontFamily: F.reg, fontSize: 11 },
  greeksLine: { fontFamily: F.reg, fontSize: 10, marginTop: 8 },
  teach: { fontFamily: F.reg, fontSize: 12, lineHeight: 18 },
  teachLine: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 17 },
  riskNote: { fontFamily: F.semi, fontSize: 11, marginTop: 10 },
  optTitle: { fontFamily: F.semi, fontSize: 13 },
  decayNote: { fontFamily: F.reg, fontSize: 9, marginTop: 2 },
  askBtn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginTop: 10 },
});
