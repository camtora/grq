import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SubScreen, Card, SectionTitle, Footnote, Divider, Loading, ErrorNote, Bounded, Grid } from '../../../components/Chrome';
import Sparkline from '../../../components/Sparkline';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { useResponsive } from '../../../constants/layout';
import { signedMoney, pnlColor, fmtDate } from '../../../lib/format';
import { useApi } from '../../../services/hooks';
import {
  tabular, Pill, Stat, BookList, fmtBps, etToday,
  type RaceModel, type RaceDayRollup,
} from '../../../components/race/shared';

type RaceResponse = {
  fxUsdCad: number | null;
  asOf?: string;
  today?: string;
  models: RaceModel[];
  days?: RaceDayRollup[];
};

function dayHref(today: string, m: RaceModel): string {
  // Tap a model → today's race with that challenger already on the compare
  // (the champion is pinned, so its tile just opens the day).
  return m.role === 'champion'
    ? `/more/race-day/${today}`
    : `/more/race-day/${today}?vs=${encodeURIComponent(m.model)}`;
}

/** One model's scorecard tile (web ModelTile). Champion flagged regardless of rank. */
function ModelTile({ m, rank, today }: { m: RaceModel; rank: number; today: string }) {
  const { p } = usePalette();
  const router = useRouter();
  const champ = m.role === 'champion';
  const idle = m.totalCalls === 0; // configured but hasn't raced yet — fade it
  const c = m.counts;
  const vsColor =
    m.vsBenchmarkBps == null ? p.textMuted : m.vsBenchmarkBps >= 0 ? p.pos : p.neg;
  return (
    <Pressable onPress={() => router.push(dayHref(today, m))}>
      <Card style={[champ && { borderColor: p.accent + '66' }, idle && { opacity: 0.45 }]}>
        <View style={s.head}>
          <Text style={[s.rank, tabular, { color: p.textMuted }]}>#{rank}</Text>
          <Text numberOfLines={1} style={[s.label, { color: p.textPrimary, flex: 1 }]}>{m.label}</Text>
          <Pill text={champ ? 'Champion' : 'Shadow'} color={champ ? p.accentText : p.textMuted} />
        </View>

        <View style={s.pnlRow}>
          <View>
            <Text style={[s.miniLabel, { color: p.textMuted }]}>Paper P&L</Text>
            {m.scoredCalls ? (
              <Text style={[s.pnl, tabular, { color: pnlColor(m.pnlCadCents, p) }]}>
                {signedMoney(m.pnlCadCents)}
              </Text>
            ) : (
              <Text style={[s.pnl, { color: p.textMuted, opacity: 0.5 }]}>—</Text>
            )}
          </View>
          <View style={{ width: 96, height: 32 }}>
            <Sparkline values={m.spark} height={32} />
          </View>
        </View>

        <View style={s.stats}>
          <Stat
            label="Hit rate"
            value={m.hitRate != null ? `${Math.round(m.hitRate * 100)}%` : '—'}
            sub={`${m.greens}/${m.scoredCalls}`}
          />
          <Stat label="vs XIC" value={fmtBps(m.vsBenchmarkBps)} color={vsColor} />
          <Stat label="Conviction" value={m.avgConfidence != null ? `${m.avgConfidence}%` : '—'} />
        </View>

        <Text style={[s.countsLine, tabular, { color: p.textMuted }]}>
          {idle
            ? 'awaiting first session'
            : c
              ? `${c.BUY} buy · ${c.SELL} sell · ${c.HOLD} hold · ${c.NONE} stand-down`
              : `${m.totalCalls} calls`}
        </Text>

        {m.positions && m.positions.length > 0 ? (
          <View style={[s.book, { borderTopColor: p.cardBorder }]}>
            <Text style={[s.miniLabel, { color: p.textMuted, marginBottom: 5 }]}>
              Book — what it holds on a $50k virtual stake
            </Text>
            <BookList positions={m.positions} />
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

/** The web page's "How Second Opinions works" disclosure, ported. */
function HowItWorks({ fx }: { fx: number | null }) {
  const { p } = usePalette();
  const [open, setOpen] = useState(false);
  const B = ({ lead, children }: { lead: string; children: React.ReactNode }) => (
    <Text style={[s.howBody, { color: p.textMuted }]}>
      <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>{lead}</Text> {children}
    </Text>
  );
  return (
    <Card style={{ marginTop: 16 }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={s.howHead} hitSlop={6}>
        <Text style={[s.howTitle, { color: p.textMuted }]}>How Second Opinions works</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={p.textMuted} />
      </Pressable>
      {open && (
        <View style={{ gap: 8, marginTop: 10 }}>
          <B lead="Same data, every mind.">
            At each session — the morning plan, the check-ins, the EOD — every model gets the EXACT
            same frozen prompt. Only Opus (the champion) actually trades; the rest are shadow-only
            and never touch the trade gate.
          </B>
          <B lead="A “call” is a decision to act now">
            — buy / sell / hold / stand-down — not a conditional “I’d buy if X happens.” The
            champion’s call is the order it actually places (whether or not the gate lets it
            through), so it’s measured the same way as a shadow that can never reach the gate.
          </B>
          <B lead="Every session re-asks “what now?”">
            A model that still wants a name re-calls it each check-in, and for the scorecard every
            call is scored on its own — snapshotted the moment it’s made and marked to the live
            price. The same ticker can appear several times: that’s repeated conviction, counted
            each time.
          </B>
          <B lead="The book is a real $50k virtual portfolio.">
            Separately, each mind’s calls are replayed through a fixed $50k stake to get the
            holdings and P&L you see — bounded, like a real account. A re-called name isn’t bought
            twice, a buy can only spend the cash on hand, and there’s no shorting.
          </B>
          <B lead="Not a perfectly level field — and we say so.">
            Every model gets the same frozen snapshot, but only the champion can use tools
            mid-session — web search, full dossier reads, fresh quotes. The shadows answer from the
            snapshot alone, one shot. The race compares judgment on the same seed; the champion
            also gets to dig deeper.
          </B>
          <B lead="Hypothetical, and honest about it.">
            No lane faces real slippage — even the champion’s here is its proposal, not its
            executed trade (its real fund P&L lives on the dashboard). A SELL is scored
            directionally, holds and stand-downs don’t score, and the book is long-only with a
            light IBKR commission. P&L is shown in CAD{fx ? `, USD calls converted at ~${fx.toFixed(2)} CAD/USD` : ''}.
          </B>
        </View>
      )}
    </Card>
  );
}

/** Bounds to the reading column only on a wide (iPad) layout — phone unchanged. */
function BoundedIf({ wide, children }: { wide: boolean; children: React.ReactNode }) {
  return wide ? <Bounded>{children}</Bounded> : <>{children}</>;
}

/** Second Opinions — the model bake-off on the fund's REAL calls (web /race).
 * Every decision session the live agent (the champion — Opus, the only model
 * that trades) and the shadow challengers get the EXACT same frozen prompt;
 * challengers only say what they WOULD do. No separate portfolio. */
export default function RaceScreen() {
  const { p } = usePalette();
  const { isWide } = useResponsive();
  const router = useRouter();
  const { data: d, error, loading, refreshing, refresh } = useApi<RaceResponse>('/api/race');

  const today = d?.today ?? etToday();
  const models = d?.models ?? []; // server order: active by P&L, then not-yet-raced
  const days = d?.days ?? [];

  return (
    <SubScreen title="Second Opinions" wide={isWide} refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View>
          {/* The lead + Today's-race button span the full width (matching the scorecard
              grid below); a phone keeps the reading column (docs/MOBILE-DESIGN.md §9). */}
          <Text style={[s.lead, { color: p.textMuted }]}>
            What other minds would do — on the SAME real call. At every decision the champion and
            the challengers get the exact same frozen prompt; the challengers are shadow-only,
            snapshotted and marked to the live price. It scores judgment on the fund's actual
            decisions — there's no separate portfolio.
          </Text>

          <Pressable
            onPress={() => router.push(`/more/race-day/${today}`)}
            style={[s.todayBtn, { borderColor: p.accent + '44', backgroundColor: p.accent + '14' }]}
          >
            <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 12.5 }}>Today's race →</Text>
          </Pressable>

          {models.length === 0 ? (
            <BoundedIf wide={isWide}>
            <Card style={{ marginTop: 16 }}>
              <Text style={[s.emptyTitle, { color: p.textPrimary }]}>No races yet</Text>
              <Text style={[s.howBody, { color: p.textMuted, marginTop: 4 }]}>
                The next morning plan, intraday check-in, and EOD report will each run the
                challengers on the same data and land here.
              </Text>
            </Card>
            </BoundedIf>
          ) : (
            <View>
              <SectionTitle sub="every mind ranked on the fund's real decisions — tap one to compare it with ★ Opus today">
                The scorecard
              </SectionTitle>
              <Grid min={320} gap={10} style={{ marginBottom: 10 }}>
              {models.map((m, i) => (
                <ModelTile key={m.model} m={m} rank={i + 1} today={today} />
              ))}
              </Grid>
            </View>
          )}

          {days.length > 0 && (
            <BoundedIf wide={isWide}>
            <View>
              <SectionTitle sub="a race = one trading day — tap for the session-by-session calls">
                Race days
              </SectionTitle>
              <Card>
                {days.map((day, i) => (
                  <View key={day.date}>
                    {i > 0 && <Divider />}
                    <Pressable onPress={() => router.push(`/more/race-day/${day.date}`)} style={s.dayRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.dayDate, { color: p.textPrimary }]}>{fmtDate(day.date)}</Text>
                        <Text style={[s.dayMeta, tabular, { color: p.textMuted }]}>
                          {day.sessions} session{day.sessions === 1 ? '' : 's'} · {day.calls} call{day.calls === 1 ? '' : 's'}
                        </Text>
                      </View>
                      {day.leader && (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[s.dayLeader, { color: p.textPrimary }]}>
                            {day.leader.role === 'champion' ? '★ ' : ''}{day.leader.label}
                          </Text>
                          <Text style={[s.dayMeta, tabular, { color: pnlColor(day.leader.pnlCadCents, p) }]}>
                            {signedMoney(day.leader.pnlCadCents)}
                          </Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={14} color={p.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </Card>
            </View>
            </BoundedIf>
          )}

          <BoundedIf wide={isWide}>
          <HowItWorks fx={d.fxUsdCad} />

          <Pressable onPress={() => router.push('/more/bulls')} style={{ marginTop: 10 }} hitSlop={6}>
            <Text style={[s.crossRef, { color: p.accentText }]}>
              models running their OWN $50k paper books → Bull Race
            </Text>
          </Pressable>

          <Footnote>
            every model sees the same decision sessions as the live agent and files its own call —
            no shadow ever touches the order gate
          </Footnote>
          </BoundedIf>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  lead: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, marginTop: 4 },
  todayBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank: { fontFamily: 'System', fontWeight: '800', fontSize: 13 },
  label: { fontFamily: F.semi, fontSize: 14.5 },
  pnlRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  miniLabel: { fontFamily: F.semi, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.8 },
  pnl: { fontFamily: 'System', fontWeight: '800', fontSize: 18, marginTop: 2 },
  stats: { flexDirection: 'row', marginTop: 10 },
  countsLine: { fontFamily: F.reg, fontSize: 10.5, textAlign: 'center', marginTop: 8 },
  book: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 8 },
  howHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  howTitle: { fontFamily: F.semi, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1 },
  howBody: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  emptyTitle: { fontFamily: F.semi, fontSize: 13.5 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  dayDate: { fontFamily: F.semi, fontSize: 13 },
  dayMeta: { fontFamily: F.reg, fontSize: 10.5, marginTop: 1 },
  dayLeader: { fontFamily: F.med, fontSize: 11.5 },
  crossRef: { fontFamily: F.semi, fontSize: 12 },
});
