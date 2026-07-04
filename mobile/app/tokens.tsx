import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SubScreen, Card, SectionTitle, Footnote, Divider, Loading, ErrorNote } from '../components/Chrome';
import { usePalette, F, type Palette } from '../constants/theme';
import { useApi } from '../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

/* ---------- wire (web /tokens parity) ---------- */

type TokensWire = {
  dateStr: string;
  isToday: boolean;
  generatedAt: string;
  maxFiveH: number | null;
  windowStart: string | null;
  totals: { calls: number; total: number; input: number; output: number; cacheWrite: number; cacheRead: number; costMicroUsd: number };
  byGroup: { group: string; calls: number; total: number }[];
  byModel: { group: string; label: string; openRouter: boolean; calls: number; total: number; costMicroUsd: number }[];
  rolling5h: { total: number; calls: number };
  recent: {
    id: number;
    at: string;
    label: string;
    numTurns: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    total: number;
    durationMs: number | null;
    status: string;
  }[];
};

function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
}
const fmtUsd = (micro: number) => `$${(micro / 1e6).toFixed(2)}`;
const fmtDur = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)}m` : `${Math.round(ms / 1000)}s`);

function etTime(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

// The ET-day changer (yesterday ← date → tomorrow, capped at today).
function shiftDay(dateStr: string, delta: number): string {
  return new Date(Date.parse(`${dateStr}T12:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
}

/** Token usage (web /tokens parity, owner-only): what the autonomous agent spends
 * of Cam's shared Claude Max quota — the day's totals, the rolling 5-hour window
 * vs the clock, by session type, by model (real OpenRouter $ vs Max-flat-fee
 * equivalents), and every logged session. */
export default function TokensScreen() {
  const { p } = usePalette();
  const [d8, setD8] = useState<string | null>(null); // null = today
  const { data: d, error, loading, refreshing, refresh } = useApi<TokensWire>(`/api/tokens${d8 ? `?d=${d8}` : ''}`);

  const dayTotal = Math.max(1, d?.totals.total ?? 1);
  // Rolling window math (web RollingWindowPanel, simplified): burn vs the clock.
  const winStart = d?.windowStart ? Date.parse(d.windowStart) : null;
  const elapsedPct = winStart != null ? Math.min(100, Math.round(((Date.now() - winStart) / (5 * 3_600_000)) * 100)) : null;
  const burnPct = d?.maxFiveH ? Math.min(100, Math.round((d.rolling5h.total / d.maxFiveH) * 100)) : null;

  return (
    <SubScreen title="Token usage" refreshing={refreshing} onRefresh={refresh}>
      <View style={{ marginTop: 8, gap: 10 }}>
        <Text style={[s.intro, { color: p.textMuted }]}>
          What the autonomous agent spends of Cam&apos;s shared Claude Max quota — this burn competes with
          interactive Claude Code usage.
        </Text>

        {/* day changer */}
        {d && (
          <View style={s.dayRow}>
            <Pressable onPress={() => setD8(shiftDay(d.dateStr, -1))} style={[s.chip, { borderColor: p.cardBorder, backgroundColor: p.cardBg }]}>
              <Text style={[s.chipText, { color: p.accentText }]}>← {shiftDay(d.dateStr, -1)}</Text>
            </Pressable>
            <Text style={[s.dayLabel, tabular, { color: p.textPrimary }]}>{d.dateStr}</Text>
            {!d.isToday && (
              <>
                <Pressable onPress={() => setD8(shiftDay(d.dateStr, 1))} style={[s.chip, { borderColor: p.cardBorder, backgroundColor: p.cardBg }]}>
                  <Text style={[s.chipText, { color: p.accentText }]}>{shiftDay(d.dateStr, 1)} →</Text>
                </Pressable>
                <Pressable onPress={() => setD8(null)} style={[s.chip, { borderColor: p.accent + '88', backgroundColor: p.accent + '26' }]}>
                  <Text style={[s.chipText, { color: p.accentText }]}>today</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {loading && <Loading />}
        {error && !loading && <ErrorNote message={error} />}
        {d && d.totals.calls === 0 && (
          <Card>
            <Text style={[s.empty, { color: p.textMuted }]}>
              No agent sessions logged {d.isToday ? 'yet today' : `on ${d.dateStr}`} — logging started 2026-06-25.
            </Text>
          </Card>
        )}
        {d && d.totals.calls > 0 && (
          <>
            {/* headline numbers */}
            <Card style={s.statGrid}>
              {(
                [
                  [d.isToday ? 'TOKENS TODAY' : 'TOKENS THAT DAY', fmtTokens(d.totals.total), `${d.totals.calls} sessions`],
                  ['FRESH INPUT', fmtTokens(d.totals.input), null],
                  ['OUTPUT', fmtTokens(d.totals.output), null],
                  ['CACHE W / R', `${fmtTokens(d.totals.cacheWrite)} / ${fmtTokens(d.totals.cacheRead)}`, 'reads are cheap, still count'],
                  ['EST. COST', d.totals.costMicroUsd > 0 ? fmtUsd(d.totals.costMicroUsd) : '—', d.totals.costMicroUsd > 0 ? 'if metered' : 'Max token: unmetered'],
                  ...(d.isToday ? ([['THIS 5H WINDOW', fmtTokens(d.rolling5h.total), `${d.rolling5h.calls} sessions`]] as const) : []),
                ] as readonly (readonly [string, string, string | null])[]
              ).map(([k, v, note]) => (
                <View key={k} style={s.statCell}>
                  <Text style={[s.statLabel, { color: p.textMuted }]}>{k}</Text>
                  <Text style={[s.statValue, tabular, { color: p.textPrimary }]}>{v}</Text>
                  {note ? <Text style={[s.statNote, { color: p.textMuted }]}>{note}</Text> : null}
                </View>
              ))}
            </Card>

            {/* the rolling 5h window — burn vs the clock */}
            {d.isToday && (
              <View>
                <SectionTitle sub="the thing that trips the Max limit">Rolling 5-hour window</SectionTitle>
                <Card>
                  {elapsedPct != null && (
                    <View style={{ marginBottom: 10 }}>
                      <View style={s.barHead}>
                        <Text style={[s.metaSmall, { color: p.textMuted }]}>TIME ELAPSED</Text>
                        <Text style={[s.metaSmall, tabular, { color: p.textPrimary }]}>{elapsedPct}%</Text>
                      </View>
                      <View style={[s.track, { backgroundColor: p.cardHi }]}>
                        <View style={[s.fill, { width: `${elapsedPct}%`, backgroundColor: p.accent + '88' }]} />
                      </View>
                    </View>
                  )}
                  <View style={s.barHead}>
                    <Text style={[s.metaSmall, { color: p.textMuted }]}>TOKENS BURNED</Text>
                    <Text style={[s.metaSmall, tabular, { color: p.textPrimary }]}>
                      {fmtTokens(d.rolling5h.total)}
                      {d.maxFiveH ? ` of ~${fmtTokens(d.maxFiveH)} (${burnPct}%)` : ''}
                    </Text>
                  </View>
                  <View style={[s.track, { backgroundColor: p.cardHi }]}>
                    <View
                      style={[
                        s.fill,
                        {
                          width: `${burnPct ?? Math.min(100, Math.round((d.rolling5h.total / 5e6) * 100))}%`,
                          backgroundColor: burnPct != null && elapsedPct != null && burnPct > elapsedPct ? p.warn : p.pos,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 6 }]}>
                    {burnPct != null && elapsedPct != null
                      ? burnPct > elapsedPct
                        ? 'spending AHEAD of the clock — the agent may hit the window cap'
                        : 'spending behind the clock — comfortable'
                      : 'the token bar is our own measured burn against a configurable estimate (GRQ_MAX_5H_TOKENS), not a number Anthropic reports'}
                  </Text>
                </Card>
              </View>
            )}

            {/* by session type */}
            <View>
              <SectionTitle sub="where the day's tokens went">By session type</SectionTitle>
              <Card style={s.listCard}>
                {d.byGroup.map((g, i) => {
                  const pct = Math.round((g.total / dayTotal) * 100);
                  return (
                    <View key={g.group}>
                      {i > 0 && <Divider />}
                      <View style={{ paddingVertical: 8 }}>
                        <View style={s.barHead}>
                          <Text style={[s.rowLabel, { color: p.textPrimary, flex: 1 }]}>{g.group}</Text>
                          <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>
                            {g.calls}× · {fmtTokens(g.total)} · avg {fmtTokens(Math.round(g.total / Math.max(1, g.calls)))}
                          </Text>
                        </View>
                        <View style={[s.track, { backgroundColor: p.cardHi, marginTop: 5 }]}>
                          <View style={[s.fill, { width: `${Math.max(2, pct)}%`, backgroundColor: p.accent + '66' }]} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </Card>
            </View>

            {/* by model */}
            <View>
              <SectionTitle sub="Max flat fee vs real OpenRouter $">By model</SectionTitle>
              <Card style={s.listCard}>
                {d.byModel.map((m, i) => (
                  <View key={m.group}>
                    {i > 0 && <Divider />}
                    <View style={s.modelRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.rowLabel, { color: p.textPrimary }]}>
                          {m.label}{' '}
                          <Text style={[s.pill, { color: m.openRouter ? p.warn : p.textMuted, borderColor: (m.openRouter ? p.warn : p.textMuted) + '55', backgroundColor: (m.openRouter ? p.warn : p.textMuted) + '1a' }]}>
                            {m.openRouter ? 'OPENROUTER' : 'MAX'}
                          </Text>
                        </Text>
                        <Text style={[s.metaSmall, tabular, { color: p.textMuted, marginTop: 2 }]}>
                          {m.calls} calls · {fmtTokens(m.total)}
                        </Text>
                      </View>
                      <Text style={[s.rowLabel, tabular, { color: m.openRouter ? p.textPrimary : p.textMuted }]}>
                        {m.costMicroUsd > 0 ? fmtUsd(m.costMicroUsd) : '—'}
                        {!m.openRouter && m.costMicroUsd > 0 ? <Text style={[s.metaSmall, { color: p.textMuted }]}> if metered</Text> : null}
                      </Text>
                    </View>
                  </View>
                ))}
                {(() => {
                  const real = d.byModel.filter((m) => m.openRouter).reduce((sum, m) => sum + m.costMicroUsd, 0);
                  return real > 0 ? (
                    <Text style={[s.metaSmall, { color: p.textMuted, paddingVertical: 8 }]}>
                      real OpenRouter spend: <Text style={{ color: p.textPrimary, fontFamily: F.semi }}>{fmtUsd(real)}</Text>
                    </Text>
                  ) : null;
                })()}
              </Card>
            </View>

            {/* recent sessions */}
            <View>
              <SectionTitle sub={`every logged call · ${d.recent.length}`}>Recent sessions</SectionTitle>
              <Card style={s.listCard}>
                {d.recent.map((r, i) => (
                  <View key={r.id}>
                    {i > 0 && <Divider />}
                    <View style={{ paddingVertical: 8 }}>
                      <View style={s.barHead}>
                        <Text style={[s.rowLabel, { color: p.textPrimary, flex: 1 }]} numberOfLines={1}>
                          {r.label}
                        </Text>
                        <Text style={[s.metaSmall, tabular, { color: r.status === 'success' ? p.pos : p.neg }]}>{r.status}</Text>
                      </View>
                      <Text style={[s.metaSmall, tabular, { color: p.textMuted, marginTop: 2 }]}>
                        {etTime(r.at)} ET{r.durationMs ? ` · ${fmtDur(r.durationMs)}` : ''} · {r.numTurns} turns · in{' '}
                        {fmtTokens(r.inputTokens)} · out {fmtTokens(r.outputTokens)} · cache {fmtTokens(r.cacheReadTokens)} ·{' '}
                        <Text style={{ color: p.textPrimary, fontFamily: F.semi }}>{fmtTokens(r.total)}</Text>
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          </>
        )}
        <Footnote>
          one row per Claude session, summed across subagent fan-out · times Eastern · Claude models ride the
          Max flat fee (their $ is the metered-equivalent); slash-named challengers bill real $ on OpenRouter
        </Footnote>
      </View>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dayLabel: { fontFamily: F.semi, fontSize: 13 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontFamily: F.semi, fontSize: 11 },
  empty: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, paddingVertical: 8 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '50%', paddingVertical: 6, paddingRight: 6 },
  statLabel: { fontFamily: F.semi, fontSize: 8, letterSpacing: 0.8 },
  statValue: { fontFamily: F.semi, fontSize: 14, marginTop: 2 },
  statNote: { fontFamily: F.reg, fontSize: 9, marginTop: 1 },
  barHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  fill: { height: 8, borderRadius: 4 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  rowLabel: { fontFamily: F.semi, fontSize: 12.5 },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  metaSmall: { fontFamily: F.reg, fontSize: 10, lineHeight: 14 },
  pill: {
    fontFamily: F.bold,
    fontSize: 7.5,
    letterSpacing: 0.6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
});
