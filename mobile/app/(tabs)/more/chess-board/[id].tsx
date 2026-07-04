import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, Divider, MiniLabel, Loading, ErrorNote } from '../../../../components/Chrome';
import StockLogo from '../../../../components/StockLogo';
import Sparkline from '../../../../components/Sparkline';
import MdText from '../../../../components/MdText';
import ConfidenceGauge from '../../../../components/hunt/ConfidenceGauge';
import HeatMeter from '../../../../components/hunt/HeatMeter';
import { usePalette, F, type Palette } from '../../../../constants/theme';
import { money, signedPctFromBps } from '../../../../lib/format';
import { heatColor, obscurityLabel } from '../../../../lib/hunt';
import { stanceMeta, toneColor } from '../../../../lib/stance';
import { bareChainKey, sliceBoardRange, BOARD_RANGES, type BoardRangeKey, type BoardTrend } from '../../../../lib/chess';
import { api } from '../../../../services/api';
import { useApi } from '../../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

/* ---------- wire (web /chess/[id] parity) ---------- */

type BoardItem = { symbol?: string; name: string; note?: string };
type BoardStage = { label: string; role?: string; items: BoardItem[] };
type BoardLink = { from: string; to: string; label?: string };
type Lever = { gap: string; direction: string; magnitude: string; kind: string; trigger: string; retrievable: boolean };
type Play = {
  id: number;
  symbol: string;
  name: string;
  role: string;
  direction: string; // BENEFICIARY | VICTIM | NEUTRAL
  effectOrder: number;
  thesis: string;
  conviction: number | null;
  obscurity: number | null;
  tag: string | null;
  logoUrl: string | null;
  currency: string | null;
  lastCents: number | null;
  change30d: number | null;
  spark?: number[];
  heat: number;
  tracked: boolean;
  stance: string | null;
};
type BoardWire = {
  id: number;
  title: string;
  anchor: string;
  kind: string;
  status: string;
  thesis: string | null;
  bottomLine: string | null;
  brief?: string | null;
  requestedBy: string | null;
  createdAt?: string;
  agentVersion?: string | null;
  completedAt: string;
  board: { stages: BoardStage[]; links: BoardLink[] };
  levers: Lever[];
  trends?: Record<string, BoardTrend>;
  plays: Play[];
};

const ORDINAL = ['', '1st', '2nd', '3rd'];
const DIR = {
  BENEFICIARY: { icon: '↑', label: 'beneficiary' },
  VICTIM: { icon: '↓', label: 'victim' },
  NEUTRAL: { icon: '↔', label: 'neutral' },
} as const;

function when(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ', ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/* ---------- one heat-ranked play (web PlayCard, phone-sized) ---------- */

function PlayRow({ play, p }: { play: Play; p: Palette }) {
  const router = useRouter();
  const [research, setResearch] = useState<'idle' | 'busy' | 'done' | 'exists'>('idle');
  const color = heatColor(play.heat);
  const dir = DIR[(play.direction as keyof typeof DIR) in DIR ? (play.direction as keyof typeof DIR) : 'NEUTRAL'];
  const dirColor = play.direction === 'BENEFICIARY' ? p.pos : play.direction === 'VICTIM' ? p.neg : p.warn;
  const chg30Bps = play.change30d != null ? Math.round(play.change30d * 10_000) : null;
  const sm = play.stance ? stanceMeta(play.stance) : null;
  const obs = obscurityLabel(play.obscurity);

  const doResearch = async () => {
    if (research === 'busy') return;
    setResearch('busy');
    try {
      const r = await api<{ result?: string }>('/api/chess/research', {
        method: 'POST',
        body: JSON.stringify({ symbol: play.symbol }),
      });
      setResearch(r.result === 'queued' ? 'done' : 'exists');
    } catch (e) {
      setResearch('idle');
      Alert.alert('Research', e instanceof Error ? e.message : 'Could not queue the research.');
    }
  };

  return (
    <Card style={s.playCard}>
      <View style={[s.rail, { backgroundColor: color }]} />
      <View style={s.playBody}>
        <View style={s.playHead}>
          <StockLogo symbol={play.symbol} logoUrl={play.logoUrl} size={30} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={s.playSymRow}>
              <Text
                onPress={() => router.push(`/stock/${play.symbol}`)}
                style={[s.sym, { color: p.accentText, textDecorationLine: 'underline' }]}
              >
                {play.symbol}
              </Text>
              <Text style={[s.pill, { color: dirColor, borderColor: dirColor + '55', backgroundColor: dirColor + '1a' }]}>
                {dir.icon} {dir.label}
              </Text>
              <Text style={[s.metaSmall, { color: p.textMuted }]}>{ORDINAL[play.effectOrder] ?? `${play.effectOrder}th`}-order</Text>
              {sm ? (
                <Text style={[s.pill, { color: toneColor(sm.tone, p), borderColor: toneColor(sm.tone, p) + '55', backgroundColor: toneColor(sm.tone, p) + '1a' }]}>
                  {sm.label}
                </Text>
              ) : (
                <Text style={[s.metaSmall, { color: p.textMuted }]}>lead</Text>
              )}
            </View>
            <Text style={[s.meta, { color: p.textMuted }]} numberOfLines={1}>
              {play.name}
              {play.tag ? ` · ${play.tag}` : ''}
            </Text>
            <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 1 }]} numberOfLines={1}>
              {play.role}
              {obs ? ` · ${obs}` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.meta, tabular, { color: p.textPrimary, fontFamily: F.semi }]}>
              {play.lastCents != null ? `${play.currency === 'USD' ? 'US' : ''}${money(play.lastCents)}` : '—'}
            </Text>
            {chg30Bps != null && (
              <Text style={[s.metaSmall, tabular, { color: chg30Bps >= 0 ? p.pos : p.neg }]}>
                {signedPctFromBps(chg30Bps, 0)} 30d
              </Text>
            )}
          </View>
        </View>

        <View style={{ marginTop: 8 }}>
          <MdText body={play.thesis} foldAt={280} />
        </View>

        <View style={s.playFoot}>
          <ConfidenceGauge value={play.conviction} size={44} label="CONV" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <HeatMeter heat={play.heat} color={color} barHeight={5} />
          </View>
          {(play.spark?.length ?? 0) >= 2 && (
            <View style={{ width: 90 }}>
              <Sparkline values={play.spark!} height={26} />
            </View>
          )}
          <Pressable onPress={doResearch} disabled={research === 'busy'} style={[s.researchBtn, { backgroundColor: p.accent + '26' }]}>
            {research === 'busy' ? (
              <ActivityIndicator size="small" color={p.accentText} />
            ) : (
              <Text style={[s.researchText, { color: p.accentText }]}>
                {research === 'done' ? 'researching…' : research === 'exists' ? 'research ready →' : '🔬 research'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

/* ---------- the page ---------- */

/** One Chess Moves board (web /chess/[id] parity): provenance + the prompt, the
 * take, the position, what would change our mind, the horizontal chain map with
 * per-piece price tapes (shared 1D…1Y toggle), "how it flows", and the
 * heat-ranked ripple plays. Leads, never verdicts. */
export default function ChessBoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { p } = usePalette();
  const router = useRouter();
  const { data: d, error, loading, refreshing, refresh } = useApi<BoardWire>(`/api/chess/${id}`);
  const [range, setRange] = useState<BoardRangeKey>('1D');

  const trends = d?.trends ?? {};
  const hasTrends = Object.keys(trends).length > 0;
  const working = d && d.status !== 'READY' && (d.status === 'PENDING' || d.status === 'RUNNING');

  return (
    <SubScreen title={d?.title ?? 'The board'} refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && d.status !== 'READY' && (
        <Card style={{ marginTop: 8 }}>
          <Text style={[s.bannerText, { color: p.textMuted }]}>
            {working
              ? '♟ Alfred is mapping this board — the chain and the ripple plays land here in a minute or two.'
              : "This board didn't come together — try briefing it again from Chess Moves."}
          </Text>
        </Card>
      )}
      {d && d.status === 'READY' && (
        <View style={{ marginTop: 8, gap: 10 }}>
          {!!d.anchor && <Text style={[s.intro, { color: p.textMuted }]}>{d.anchor}</Text>}

          {/* Provenance — who generated it, when, and the prompt that produced it. */}
          <Card>
            <Text style={[s.metaSmall, { color: p.textMuted }]}>
              Generated by <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>{d.requestedBy ?? 'Alfred'}</Text>
              {' · '}
              {d.kind === 'WEEKLY' ? "Alfred's weekly self-pick" : 'member brief'}
              {d.createdAt ? ` · requested ${when(d.createdAt)}` : ''}
              {d.completedAt ? ` · mapped ${when(d.completedAt)}` : ''}
              {d.agentVersion ? ` · ${d.agentVersion}` : ''}
            </Text>
            <Text style={[s.promptLabel, { color: p.accentText }]}>THE PROMPT</Text>
            {d.brief ? (
              <Text style={[s.prompt, { color: p.textPrimary }]}>“{d.brief}”</Text>
            ) : (
              <Text style={[s.prompt, { color: p.textMuted, fontStyle: 'normal' }]}>
                No brief — Alfred self-picked this board (the weekly board of the week).
              </Text>
            )}
          </Card>

          {d.bottomLine && (
            <View>
              <SectionTitle sub="the plain-English punchline">The take</SectionTitle>
              <Card style={{ borderColor: p.accent + '40' }}>
                <MdText body={d.bottomLine} foldAt={600} />
              </Card>
            </View>
          )}

          {d.thesis && (
            <View>
              <SectionTitle sub="the force in motion">The position</SectionTitle>
              <Card>
                <MdText body={d.thesis} foldAt={600} />
              </Card>
            </View>
          )}

          {d.levers.length > 0 && (
            <View>
              <SectionTitle sub="what's pinning confidence below 100">What would change our mind</SectionTitle>
              <Card style={s.listCard}>
                {d.levers.map((l, i) => (
                  <View key={i}>
                    {i > 0 && <Divider />}
                    <View style={s.leverRow}>
                      <Text style={[s.leverDir, { color: l.direction === 'up' ? p.pos : l.direction === 'down' ? p.neg : p.textMuted }]}>
                        {l.direction === 'up' ? '▲' : l.direction === 'down' ? '▼' : '◆'}
                      </Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.leverGap, { color: p.textPrimary }]}>{l.gap}</Text>
                        <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 3 }]}>
                          {l.kind === 'catalyst' ? '⏱ ' : '🔎 '}
                          {l.trigger} · {l.magnitude} move
                          {l.retrievable ? ' · retrievable now' : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          )}

          {/* The board — the chain map, stages left→right. */}
          {d.board.stages.length > 0 && (
            <View>
              <SectionTitle sub="the value chain, upstream → downstream">The board</SectionTitle>
              {hasTrends && (
                <View style={s.rangeRow}>
                  <Text style={[s.metaSmall, { color: p.textMuted }]}>PRICE MOVE PER NAME</Text>
                  <View style={{ flexDirection: 'row', gap: 4, marginLeft: 'auto' }}>
                    {BOARD_RANGES.map((r) => (
                      <Pressable
                        key={r.key}
                        onPress={() => setRange(r.key)}
                        style={[s.rangeChip, range === r.key && { backgroundColor: p.accent + '26' }]}
                      >
                        <Text style={[tabular, { color: range === r.key ? p.accentText : p.textMuted, fontFamily: range === r.key ? F.semi : F.med, fontSize: 10.5 }]}>
                          {r.key}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 6 }}>
                  {d.board.stages.map((st, i) => (
                    <React.Fragment key={i}>
                      <Card style={s.stageCard}>
                        <Text style={[s.stageLabel, { color: p.textPrimary }]}>{st.label}</Text>
                        {st.role && <Text style={[s.stageRole, { color: p.textMuted }]}>{st.role}</Text>}
                        <View style={{ gap: 8, marginTop: 8 }}>
                          {st.items.map((it, j) => {
                            const trend = it.symbol ? trends[bareChainKey(it.symbol)] : undefined;
                            const tape = trend ? sliceBoardRange(trend.series, range) : null;
                            const changePct =
                              range === '1D' && trend?.todayBps != null ? trend.todayBps / 10_000 : (tape?.changePct ?? null);
                            return (
                              <View key={j}>
                                <Text style={s.itemLine}>
                                  {it.symbol ? (
                                    <Text
                                      onPress={() => router.push(`/stock/${bareChainKey(it.symbol!)}`)}
                                      style={[s.itemSym, { color: p.accentText }]}
                                    >
                                      {it.symbol}{' '}
                                    </Text>
                                  ) : null}
                                  <Text style={[s.itemName, { color: p.textPrimary }]}>{it.name}</Text>
                                </Text>
                                {tape && changePct != null && (
                                  <View style={s.tapeRow}>
                                    <View style={{ width: 76 }}>
                                      <Sparkline values={tape.pts.map((pt) => pt.c)} height={20} />
                                    </View>
                                    <Text style={[s.metaSmall, tabular, { color: changePct >= 0 ? p.pos : p.neg, fontFamily: F.semi }]}>
                                      {changePct >= 0 ? '+' : ''}
                                      {(changePct * 100).toFixed(1)}%
                                    </Text>
                                  </View>
                                )}
                                {it.note && <Text style={[s.itemNote, { color: p.textMuted }]}>{it.note}</Text>}
                              </View>
                            );
                          })}
                          {st.items.length === 0 && <Text style={[s.metaSmall, { color: p.textMuted }]}>—</Text>}
                        </View>
                      </Card>
                      {i < d.board.stages.length - 1 && (
                        <Text style={[s.arrow, { color: p.accentText }]}>→</Text>
                      )}
                    </React.Fragment>
                  ))}
                </View>
              </ScrollView>

              {d.board.links.length > 0 && (
                <Card style={{ marginTop: 8 }}>
                  <MiniLabel>How it flows</MiniLabel>
                  <View style={s.linksWrap}>
                    {d.board.links.map((l, i) => (
                      <Text key={i} style={[s.linkLine, { color: p.textMuted }]}>
                        <Text onPress={() => router.push(`/stock/${bareChainKey(l.from)}`)} style={{ color: p.accentText, fontFamily: F.semi }}>
                          {l.from}
                        </Text>
                        <Text style={{ color: p.accentText }}> → </Text>
                        <Text onPress={() => router.push(`/stock/${bareChainKey(l.to)}`)} style={{ color: p.accentText, fontFamily: F.semi }}>
                          {l.to}
                        </Text>
                        {l.label ? ` · ${l.label}` : ''}
                      </Text>
                    ))}
                  </View>
                </Card>
              )}
            </View>
          )}

          {/* The plays — heat-ranked ripple-effect leads. */}
          <View>
            <SectionTitle sub={`${d.plays.length} ripple-effect leads, heat-ranked`}>The plays</SectionTitle>
            {d.plays.length > 0 ? (
              <View style={{ gap: 10 }}>
                {d.plays.map((play) => (
                  <PlayRow key={play.id} play={play} p={p} />
                ))}
              </View>
            ) : (
              <Card>
                <Text style={[s.bannerText, { color: p.textMuted, paddingVertical: 6 }]}>No plays on this board.</Text>
              </Card>
            )}
          </View>

          <Footnote>
            heat is a derived &ldquo;ready to pop&rdquo; read (conviction + recent momentum + obscurity), not a
            promise · each play is a LEAD — Alfred can&apos;t trade these; a name becomes tradeable only after
            a full dossier clears the same guardrails as everything else
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  bannerText: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18 },
  metaSmall: { fontFamily: F.reg, fontSize: 10, lineHeight: 14 },
  meta: { fontFamily: F.reg, fontSize: 11 },
  promptLabel: { fontFamily: F.bold, fontSize: 9, letterSpacing: 2, marginTop: 10 },
  prompt: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 13, lineHeight: 19, marginTop: 4 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  leverRow: { flexDirection: 'row', gap: 10, paddingVertical: 9 },
  leverDir: { fontFamily: F.bold, fontSize: 13, width: 18, textAlign: 'center', marginTop: 1 },
  leverGap: { fontFamily: F.med, fontSize: 12.5, lineHeight: 18 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  rangeChip: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  stageCard: { width: 190, padding: 12 },
  stageLabel: { fontFamily: F.semi, fontSize: 13 },
  stageRole: { fontFamily: F.semi, fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
  itemLine: { fontSize: 12, lineHeight: 17 },
  itemSym: { fontFamily: F.semi, fontSize: 12, textDecorationLine: 'underline' },
  itemName: { fontFamily: F.reg, fontSize: 12 },
  itemNote: { fontFamily: F.reg, fontSize: 10, lineHeight: 14, marginTop: 2 },
  tapeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  arrow: { alignSelf: 'center', fontSize: 18, paddingHorizontal: 2 },
  linksWrap: { gap: 5, marginTop: 4 },
  linkLine: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  playCard: { padding: 0, overflow: 'hidden', flexDirection: 'row' },
  rail: { width: 4, alignSelf: 'stretch' },
  playBody: { flex: 1, minWidth: 0, padding: 12 },
  playHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  playSymRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  sym: { fontFamily: F.semi, fontSize: 14 },
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
  playFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  researchBtn: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, minWidth: 84, alignItems: 'center' },
  researchText: { fontFamily: F.semi, fontSize: 11 },
});
