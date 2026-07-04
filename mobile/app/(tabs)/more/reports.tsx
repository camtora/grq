import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, Footnote, Divider, Loading, ErrorNote, MiniLabel } from '../../../components/Chrome';
import MdText from '../../../components/MdText';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

/* ---------- wire (web /reports hub parity) ---------- */

type Counts = { daily: number; weekly: number; diary: number; smart: number; retros: number; lessons: number; conviction: number };
type DayCard = { dateISO: string; dayLabel: string; plan: string | null; premarket: string | null; close: string | null; intraday: number; eodId: string | null };
type HubReport = { id: string; title: string; dateISO: string; summary: string; stats: Record<string, string | number> | null };
type HubEntry = { id: string; kind: string; symbol: string | null; title: string; body: string; at: string; agentVersion: string; confidence: number | null };
type ConvictionData = {
  gatePct: number;
  summary: { buys: number; clearedGate: number; filled: number; avgTrade: number | null; avgDossier: number | null; avgGap: number | null };
  proposals: {
    at: string;
    symbol: string;
    side: string;
    tradeConfidence: number | null;
    dossierConfidence: number | null;
    dossierStance: string | null;
    accepted: boolean;
    status: string;
    convictionBlocked: boolean;
  }[];
};
type TabPayload = { counts: Counts; days?: DayCard[]; reports?: HubReport[]; entries?: HubEntry[] } & Partial<ConvictionData>;

const TABS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'diary', label: 'Build diary' },
  { key: 'smart', label: 'Smart Money' },
  { key: 'retros', label: 'Retros' },
  { key: 'lessons', label: 'Lessons' },
  { key: 'conviction', label: 'Conviction' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function when(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ', ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Reports — the web hub: the daily plan & close, the Saturday review, Graham's
 * build diary, smart-money roundups, post-mortems, lessons, and the conviction
 * tally (every BUY the gate saw, cleared or not). */
export default function ReportsScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('daily');
  const { data: d, error, loading, refreshing, refresh } = useApi<TabPayload>(`/api/reports?tab=${tab}`);

  return (
    <SubScreen title="Reports" refreshing={refreshing} onRefresh={refresh}>
      <View style={{ marginTop: 8 }}>
        <Text style={[s.intro, { color: p.textMuted }]}>
          Every report the fund files — the daily plan &amp; close, the Saturday review, the build diary,
          smart-money roundups, post-mortems, and lessons.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabRow}>
          {TABS.map((t) => {
            const on = t.key === tab;
            const n = d?.counts?.[t.key];
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[s.tabChip, { borderColor: on ? p.accent + '88' : p.cardBorder, backgroundColor: on ? p.accent + '26' : p.cardBg }]}
              >
                <Text style={{ color: on ? p.accentText : p.textMuted, fontFamily: on ? F.semi : F.med, fontSize: 11.5 }}>
                  {t.label}
                  {n != null ? <Text style={{ fontSize: 10 }}> {n}</Text> : null}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading && <Loading />}
        {error && !loading && <ErrorNote message={error} />}

        {d && tab === 'daily' && (
          <View style={{ gap: 10 }}>
            {(d.days ?? []).length === 0 && (
              <Card>
                <Text style={[s.empty, { color: p.textMuted }]}>
                  No daily reports yet — the morning plan and EOD close pair up here each market day.
                </Text>
              </Card>
            )}
            {(d.days ?? []).map((day) => (
              <Card key={day.dateISO}>
                <View style={s.dayHead}>
                  <Text style={[s.dayTitle, { color: p.textPrimary }]}>{day.dayLabel}</Text>
                  {day.intraday > 0 && (
                    <Text style={[s.pill, { color: p.textMuted, borderColor: p.cardBorder, backgroundColor: p.cardHi }]}>
                      {day.intraday} intraday
                    </Text>
                  )}
                  {day.eodId && (
                    <Text
                      onPress={() => router.push(`/more/report/${day.eodId}`)}
                      style={[s.readLink, { color: p.accentText }]}
                    >
                      view report →
                    </Text>
                  )}
                </View>
                <View style={{ gap: 6, marginTop: 8 }}>
                  <Text style={[s.dayLine, { color: p.textMuted }]}>
                    <Text style={[s.dayLabel, { color: p.textMuted }]}>MORNING </Text>
                    {day.plan ?? 'no plan filed'}
                  </Text>
                  {day.premarket && (
                    <Text style={[s.dayLine, s.premarket, { color: p.textMuted, borderLeftColor: p.cardBorder }]}>
                      <Text style={[s.dayLabel, { color: p.textMuted }]}>PRE-MARKET </Text>
                      {day.premarket}
                    </Text>
                  )}
                  <Text style={[s.dayLine, { color: p.textMuted }]}>
                    <Text style={[s.dayLabel, { color: p.textMuted }]}>CLOSE </Text>
                    {day.close ?? 'no close filed'}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        )}

        {d && (tab === 'weekly' || tab === 'diary') && (
          <View style={{ gap: 10 }}>
            {(d.reports ?? []).length === 0 && (
              <Card>
                <Text style={[s.empty, { color: p.textMuted }]}>
                  {tab === 'weekly'
                    ? 'No weekly reviews yet — the Saturday deep review lands once a full week is in the books.'
                    : "No diary entries yet — Alfred's 3am plain-English changelog of what we shipped."}
                </Text>
              </Card>
            )}
            {(d.reports ?? []).map((r) => (
              <Card key={r.id}>
                <Pressable onPress={() => router.push(`/more/report/${r.id}`)}>
                  <View style={s.dayHead}>
                    <Text style={[s.dayTitle, { color: p.textPrimary, flex: 1 }]} numberOfLines={2}>
                      {r.title}
                    </Text>
                    <Text style={[s.meta, { color: p.textMuted }]}>{r.dateISO}</Text>
                  </View>
                  {r.stats && (
                    <View style={s.statsRow}>
                      {Object.entries(r.stats).map(([k, v]) => (
                        <Text key={k} style={[s.stat, tabular, { color: p.textMuted }]}>
                          <Text style={{ fontSize: 9, letterSpacing: 0.5 }}>{k.replace(/_/g, ' ').toUpperCase()} </Text>
                          <Text style={{ color: p.textPrimary, fontFamily: F.semi }}>{String(v)}</Text>
                        </Text>
                      ))}
                    </View>
                  )}
                  <Text style={[s.summary, { color: p.textMuted }]} numberOfLines={3}>
                    {r.summary}
                  </Text>
                  <Text style={[s.readLink, { color: p.accentText, marginTop: 6 }]}>read in full →</Text>
                </Pressable>
              </Card>
            ))}
          </View>
        )}

        {d && (tab === 'smart' || tab === 'retros' || tab === 'lessons') && (
          <View style={{ gap: 10 }}>
            {(d.entries ?? []).length === 0 && (
              <Card>
                <Text style={[s.empty, { color: p.textMuted }]}>
                  {tab === 'smart'
                    ? "No smart-money roundups yet — Alfred files one when 13F / institutional moves are worth flagging."
                    : tab === 'retros'
                      ? 'No retros yet — after a thesis resolves, Alfred writes the post-mortem and grades the sources it cited.'
                      : 'No lessons yet — durable patterns get filed here and re-read before every decision. Alfred has to earn them.'}
                </Text>
              </Card>
            )}
            {(d.entries ?? []).map((j) => (
              <Card key={j.id}>
                <View style={s.dayHead}>
                  <Text style={[s.pill, { color: p.accentText, borderColor: p.accent + '55', backgroundColor: p.accent + '1a' }]}>
                    {j.kind}
                  </Text>
                  {j.symbol && (
                    <Text
                      onPress={() => router.push(`/stock/${j.symbol}`)}
                      style={[s.sym, { color: p.accentText, textDecorationLine: 'underline' }]}
                    >
                      {j.symbol}
                    </Text>
                  )}
                  <Text style={[s.meta, { color: p.textMuted, marginLeft: 'auto' }]}>
                    {when(j.at)}
                    {j.confidence != null ? ` · conf ${j.confidence}%` : ''}
                  </Text>
                </View>
                <Text style={[s.dayTitle, { color: p.textPrimary, marginTop: 6 }]}>{j.title}</Text>
                <View style={{ marginTop: 6 }}>
                  <MdText body={j.body} foldAt={600} />
                </View>
              </Card>
            ))}
          </View>
        )}

        {d && tab === 'conviction' && d.summary && (
          <View style={{ gap: 10 }}>
            <Card>
              <View style={s.statsRow}>
                {(
                  [
                    ['BUY PROPOSALS', String(d.summary.buys)],
                    [`CLEARED ${d.gatePct}% GATE`, `${d.summary.clearedGate}/${d.summary.buys}`],
                    ['ACTUALLY TRADED', `${d.summary.filled}/${d.summary.buys}`],
                    ['AVG TRADE CONF', d.summary.avgTrade != null ? `${d.summary.avgTrade}%` : '—'],
                    ['AVG DOSSIER CONF', d.summary.avgDossier != null ? `${d.summary.avgDossier}%` : '—'],
                    ['AVG GAP', d.summary.avgGap != null ? `${d.summary.avgGap > 0 ? '+' : ''}${d.summary.avgGap} pts` : '—'],
                  ] as const
                ).map(([k, v]) => (
                  <Text key={k} style={[s.stat, tabular, { color: p.textMuted }]}>
                    <Text style={{ fontSize: 9, letterSpacing: 0.5 }}>{k} </Text>
                    <Text style={{ color: p.textPrimary, fontFamily: F.semi }}>{v}</Text>
                  </Text>
                ))}
              </View>
              <Text style={[s.meta, { color: p.textMuted, marginTop: 8, lineHeight: 15 }]}>
                A persistently negative gap means Alfred rates names highly in research but talks himself below
                the {d.gatePct}% bar at the trigger — the pattern we&apos;re watching for.
              </Text>
            </Card>
            <MiniLabel>Every proposal, newest first</MiniLabel>
            <Card style={s.listCard}>
              {(d.proposals ?? []).map((pr, i) => {
                const gap = pr.tradeConfidence != null && pr.dossierConfidence != null ? pr.tradeConfidence - pr.dossierConfidence : null;
                return (
                  <View key={`${pr.symbol}-${pr.at}`}>
                    {i > 0 && <Divider />}
                    <Pressable onPress={() => router.push(`/stock/${pr.symbol}`)} style={s.propRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={s.dayHead}>
                          <Text style={[s.sym, { color: p.accentText }]}>{pr.symbol}</Text>
                          <Text style={[s.pill, { color: pr.side === 'BUY' ? p.pos : p.textMuted, borderColor: (pr.side === 'BUY' ? p.pos : p.textMuted) + '55', backgroundColor: (pr.side === 'BUY' ? p.pos : p.textMuted) + '1a' }]}>
                            {pr.side}
                          </Text>
                          <Text style={[s.meta, { color: p.textMuted }]}>{when(pr.at)}</Text>
                        </View>
                        <Text style={[s.meta, tabular, { color: p.textMuted, marginTop: 3 }]}>
                          trade {pr.tradeConfidence != null ? `${pr.tradeConfidence}%` : '—'} · dossier{' '}
                          {pr.dossierConfidence != null ? `${pr.dossierConfidence}%${pr.dossierStance ? ` (${pr.dossierStance})` : ''}` : '—'}
                          {gap != null && (
                            <Text style={{ color: gap < 0 ? p.neg : p.pos }}>
                              {' '}· gap {gap > 0 ? '+' : ''}{gap}
                            </Text>
                          )}
                        </Text>
                      </View>
                      <Text
                        style={[
                          s.verdict,
                          { color: pr.accepted ? p.pos : pr.convictionBlocked ? p.warn : p.neg },
                        ]}
                      >
                        {pr.accepted ? pr.status.toLowerCase() : pr.convictionBlocked ? `below ${d.gatePct}%` : 'rejected'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          </View>
        )}

        <Footnote>
          the daily card pairs the ~9:00 plan with the ~16:15 close (intraday updates live on Portfolio ▸ From
          the desk) · retros grade the sources a thesis cited — those grades build the scoreboard · the
          conviction tally logs every BUY the {d?.gatePct ?? 70}% gate saw, cleared or not
        </Footnote>
      </View>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  tabRow: { flexDirection: 'row', gap: 6, paddingVertical: 10 },
  tabChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dayTitle: { fontFamily: F.semi, fontSize: 13.5 },
  readLink: { fontFamily: F.semi, fontSize: 12, marginLeft: 'auto' },
  dayLine: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  dayLabel: { fontFamily: F.semi, fontSize: 9, letterSpacing: 1 },
  premarket: { borderLeftWidth: 2, paddingLeft: 8 },
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
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  stat: { fontFamily: F.reg, fontSize: 11 },
  summary: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, marginTop: 6 },
  sym: { fontFamily: F.semi, fontSize: 13.5 },
  meta: { fontFamily: F.reg, fontSize: 10.5 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  propRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  verdict: { fontFamily: F.semi, fontSize: 11 },
  empty: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, paddingVertical: 8 },
});
