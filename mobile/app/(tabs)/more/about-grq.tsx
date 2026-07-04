import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, Divider, MiniLabel, Loading, ErrorNote } from '../../../components/Chrome';
import MdText from '../../../components/MdText';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money } from '../../../lib/format';
import { api } from '../../../services/api';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

/* ---------- wire (web /how-it-works parity) ---------- */

type Manual = {
  navCents: number;
  costUsdCentsPerMonth: number;
  hurdlePct: number;
  riskLevel: string;
  dials: { k: string; v: string; gloss: string }[];
  guardrails: string[];
  rhythm: { t: string; d: string }[];
  learns: string[];
  changelog: { date: string; title: string; what: string; why: string; tag: string; dRef: string | null }[];
  persona: string;
  ruleNumbers: string;
};
type Decision = { n: number; title: string; meta: string | null; body: string };
type DecisionsWire = { total: number; offset: number; decisions: Decision[] };
type DiaryWire = { reports: { id: string; title: string; dateISO: string; summary: string }[] };

const TAG_COLOR = (tag: string, p: Palette) => (tag === 'Strategy' ? p.pos : tag === 'Guardrail' ? p.accentText : p.textMuted);

const TABS = [
  { key: 'manual', label: 'Manual' },
  { key: 'diary', label: 'Daily report' },
  { key: 'decisions', label: 'Decision log' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** One owner-dashboard link row (Traffic · Token usage — web settings-page parity). */
function DashLink({ title, desc, href, p }: { title: string; desc: string; href: string; p: Palette }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(href)}>
      <Card style={{ paddingVertical: 11 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: p.textPrimary, fontFamily: F.semi, fontSize: 13.5 }}>{title}</Text>
            <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 2 }]}>{desc}</Text>
          </View>
          <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 13 }}>→</Text>
        </View>
      </Card>
    </Pressable>
  );
}

/* ---------- the decision log (paged) ---------- */

function DecisionLog({ p }: { p: Palette }) {
  const { data: first, error, loading } = useApi<DecisionsWire>('/api/how-it-works?tab=decisions');
  const [extra, setExtra] = useState<Decision[]>([]);
  const [openN, setOpenN] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  if (!first) return null;

  const all = [...first.decisions, ...extra];
  const remaining = first.total - all.length;

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await api<DecisionsWire>(`/api/how-it-works?tab=decisions&offset=${all.length}`);
      setExtra((prev) => [...prev, ...d.decisions]);
    } catch {
      /* tap again to retry */
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.metaSmall, { color: p.textMuted }]}>
        {first.total} decisions on record — the complete engineering record, newest first, with its rationale.
      </Text>
      {all.map((d) => {
        const open = openN === d.n;
        return (
          <Card key={d.n}>
            <Pressable onPress={() => setOpenN(open ? null : d.n)}>
              <Text style={[s.decTitle, { color: p.textPrimary }]}>
                <Text style={[tabular, { color: p.accentText }]}>D{d.n}</Text> — {d.title}
                {d.meta ? <Text style={[s.metaSmall, { color: p.textMuted }]}> {d.meta}</Text> : null}
              </Text>
            </Pressable>
            {open && (
              <View style={{ marginTop: 8 }}>
                <MdText body={d.body} foldAt={100_000} />
              </View>
            )}
          </Card>
        );
      })}
      {remaining > 0 && (
        <Pressable onPress={loadMore} style={[s.moreBtn, { backgroundColor: p.accent + '26' }]}>
          <Text style={[s.btnText, { color: p.accentText }]}>{loadingMore ? '…' : `load ${Math.min(30, remaining)} more (${remaining} left)`}</Text>
        </Pressable>
      )}
    </View>
  );
}

/* ---------- the daily build diary (reuses the Reports feed) ---------- */

function Diary({ p }: { p: Palette }) {
  const router = useRouter();
  const { data, error, loading } = useApi<DiaryWire>('/api/reports?tab=diary');
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.metaSmall, { color: p.textMuted }]}>
        The daily build diary — a plain-English rundown of what changed in the app each day, written
        automatically at 3am ET so the two of us stay on the same page.
      </Text>
      {(data?.reports ?? []).length === 0 && (
        <Card>
          <Text style={[s.empty, { color: p.textMuted }]}>No diary entries yet — the first lands at 3am ET.</Text>
        </Card>
      )}
      {(data?.reports ?? []).map((r) => (
        <Card key={r.id}>
          <Pressable onPress={() => router.push(`/more/report/${r.id}`)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[s.decTitle, { color: p.textPrimary, flex: 1 }]} numberOfLines={2}>
                {r.title}
              </Text>
              <Text style={[s.metaSmall, { color: p.textMuted }]}>{r.dateISO}</Text>
            </View>
            <Text style={[s.body, { color: p.textMuted, marginTop: 4 }]} numberOfLines={3}>
              {r.summary}
            </Text>
            <Text style={[s.readLink, { color: p.accentText }]}>read in full →</Text>
          </Pressable>
        </Card>
      ))}
    </View>
  );
}

/* ---------- the page ---------- */

/** About GRQ — the web /how-it-works page in its entirety (More ▸ Learning):
 * the plain-English operating manual (numbers pulled LIVE from the same policy
 * the agent obeys, so it can't drift), the daily build diary, and the complete
 * engineering decision record. Owners only. */
export default function AboutGrqScreen() {
  const { p } = usePalette();
  const [tab, setTab] = useState<TabKey>('manual');
  const { data: m, error, loading, refreshing, refresh } = useApi<Manual>('/api/how-it-works');
  const [showPersona, setShowPersona] = useState(false);
  const [showRules, setShowRules] = useState(false);

  return (
    <SubScreen title="About GRQ" refreshing={refreshing} onRefresh={refresh}>
      <View style={{ marginTop: 8 }}>
        <Text style={[s.intro, { color: p.textMuted }]}>
          The plain-English operating manual. The rules and numbers below are pulled live from the same code
          the agent obeys — so this page can&apos;t drift out of sync with reality.
        </Text>

        {/* Owner dashboards (moved here from Settings — Cam 2026-07-04). */}
        <View style={{ marginTop: 10, gap: 8 }}>
          <DashLink title="Traffic" desc="who's using GRQ, and which sections get the views" href="/traffic" p={p} />
          <DashLink title="Token usage" desc="what the agent spends of the shared Claude Max quota" href="/tokens" p={p} />
        </View>

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

        {tab === 'diary' && <Diary p={p} />}
        {tab === 'decisions' && <DecisionLog p={p} />}
        {tab === 'manual' && (
          <>
            {loading && <Loading />}
            {error && !loading && <ErrorNote message={error} />}
            {m && (
              <View style={{ gap: 10 }}>
                {/* The bar */}
                <View>
                  <SectionTitle sub="clearing our own running costs">The bar we&apos;re aiming at</SectionTitle>
                  <Card>
                    <Text style={[s.body, { color: p.textMuted }]}>
                      The goal is NOT simply to beat the TSX — anyone can roughly match the index with one
                      click. The real bar is clearing the fund&apos;s own running costs: about{' '}
                      <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>
                        US{money(m.costUsdCentsPerMonth)}/month
                      </Text>{' '}
                      for its market-data and AI subscriptions. Until monthly P&amp;L clears that, the fund
                      hasn&apos;t genuinely made money.
                    </Text>
                    <View style={[s.hurdleBox, { borderColor: p.cardBorder, backgroundColor: p.cardHi + '44' }]}>
                      <Text style={[s.hurdleBig, tabular, { color: p.textPrimary }]}>~{m.hurdlePct.toFixed(1)}%/yr</Text>
                      <Text style={[s.metaSmall, { color: p.textMuted }]}>
                        cost hurdle at today&apos;s {money(m.navCents)} fund size — steep while small, shrinking
                        as it grows. The fix is scale and patient compounding, never oversized risk.
                      </Text>
                    </View>
                  </Card>
                </View>

                {/* Money rules */}
                <View>
                  <SectionTitle sub="the agent can never break these">The money rules</SectionTitle>
                  <Card>
                    {m.guardrails.map((g, i) => (
                      <Text key={i} style={[s.body, { color: p.textMuted }, i > 0 && { marginTop: 8 }]}>
                        <Text style={{ color: p.accentText }}>◆ </Text>
                        {g}
                      </Text>
                    ))}
                  </Card>
                </View>

                {/* The current dials */}
                <View>
                  <SectionTitle sub={`risk setting: ${m.riskLevel} · adjustable on Settings`}>The current dials</SectionTitle>
                  <Card style={s.listCard}>
                    {m.dials.map((r, i) => (
                      <View key={r.k}>
                        {i > 0 && <Divider />}
                        <View style={{ paddingVertical: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                            <Text style={[s.dialK, { color: p.textPrimary, flex: 1 }]}>{r.k}</Text>
                            <Text style={[s.dialV, tabular, { color: p.accentText }]}>{r.v}</Text>
                          </View>
                          <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 3 }]}>{r.gloss}</Text>
                        </View>
                      </View>
                    ))}
                  </Card>
                </View>

                {/* Daily rhythm */}
                <View>
                  <SectionTitle sub="the agent's day">The daily rhythm</SectionTitle>
                  <Card style={s.listCard}>
                    {m.rhythm.map((r, i) => (
                      <View key={r.t}>
                        {i > 0 && <Divider />}
                        <View style={{ paddingVertical: 8 }}>
                          <Text style={[s.dialV, tabular, { color: p.accentText }]}>{r.t}</Text>
                          <Text style={[s.body, { color: p.textMuted, marginTop: 3 }]}>{r.d}</Text>
                        </View>
                      </View>
                    ))}
                  </Card>
                </View>

                {/* How it learns */}
                <View>
                  <SectionTitle sub="theses, retros, lessons, source grades">How it learns</SectionTitle>
                  <Card>
                    {m.learns.map((l, i) => (
                      <Text key={i} style={[s.body, { color: p.textMuted }, i > 0 && { marginTop: 8 }]}>
                        <Text style={{ color: p.accentText }}>→ </Text>
                        {l}
                      </Text>
                    ))}
                  </Card>
                </View>

                {/* What's changed */}
                <View>
                  <SectionTitle sub="the owner-language changelog">What&apos;s changed</SectionTitle>
                  <View style={{ gap: 8 }}>
                    {m.changelog.map((c, i) => (
                      <Card key={i}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={[s.pill, { color: TAG_COLOR(c.tag, p), borderColor: TAG_COLOR(c.tag, p) + '55', backgroundColor: TAG_COLOR(c.tag, p) + '1a' }]}>
                            {c.tag}
                          </Text>
                          <Text style={[s.decTitle, { color: p.textPrimary, flex: 1 }]}>{c.title}</Text>
                          <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>
                            {c.date}
                            {c.dRef ? ` · ${c.dRef}` : ''}
                          </Text>
                        </View>
                        <Text style={[s.body, { color: p.textMuted, marginTop: 8 }]}>
                          <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>What: </Text>
                          {c.what}
                        </Text>
                        <Text style={[s.body, { color: p.textMuted, marginTop: 6 }]}>
                          <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>Why: </Text>
                          {c.why}
                        </Text>
                      </Card>
                    ))}
                  </View>
                </View>

                {/* Under the hood */}
                <View>
                  <SectionTitle sub="the raw materials, for full transparency">Under the hood</SectionTitle>
                  <Card>
                    <Pressable onPress={() => setShowPersona(!showPersona)}>
                      <Text style={[s.foldLink, { color: p.accentText }]}>
                        {showPersona ? '▾' : '▸'} The agent&apos;s actual standing instructions
                      </Text>
                    </Pressable>
                    {showPersona && (
                      <View style={[s.preBox, { backgroundColor: p.cardHi, borderColor: p.cardBorder }]}>
                        <Text style={[s.pre, { color: p.textMuted }]}>{m.persona}</Text>
                      </View>
                    )}
                    <Pressable onPress={() => setShowRules(!showRules)} style={{ marginTop: 10 }}>
                      <Text style={[s.foldLink, { color: p.accentText }]}>
                        {showRules ? '▾' : '▸'} The exact rule numbers
                      </Text>
                    </Pressable>
                    {showRules && (
                      <View style={[s.preBox, { backgroundColor: p.cardHi, borderColor: p.cardBorder }]}>
                        <Text style={[s.pre, tabular, { color: p.textMuted }]}>{m.ruleNumbers}</Text>
                      </View>
                    )}
                  </Card>
                </View>
              </View>
            )}
          </>
        )}

        <Footnote>
          exactly what the agent is told and the exact numbers it&apos;s bound by — nothing on this page is
          hand-copied, it all reads the live policy
        </Footnote>
      </View>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  tabRow: { flexDirection: 'row', gap: 6, paddingVertical: 10, flexWrap: 'wrap' },
  tabChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6 },
  body: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 19 },
  metaSmall: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 15 },
  empty: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, paddingVertical: 8 },
  hurdleBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  hurdleBig: { fontFamily: 'System', fontWeight: '800', fontSize: 24 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  dialK: { fontFamily: F.semi, fontSize: 12.5 },
  dialV: { fontFamily: F.semi, fontSize: 12.5 },
  decTitle: { fontFamily: F.semi, fontSize: 13, lineHeight: 18 },
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
  foldLink: { fontFamily: F.semi, fontSize: 12 },
  preBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8, maxHeight: 420 },
  pre: { fontFamily: F.reg, fontSize: 10, lineHeight: 15 },
  readLink: { fontFamily: F.semi, fontSize: 12, marginTop: 6 },
  moreBtn: { borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  btnText: { fontFamily: F.semi, fontSize: 12 },
});
