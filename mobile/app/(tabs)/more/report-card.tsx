import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, Divider, Loading, ErrorNote } from '../../../components/Chrome';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money } from '../../../lib/format';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

/* ---------- wire (web /report-card parity; optional fields tolerate the old payload) ---------- */

type Tally = {
  graded: number;
  pending: number;
  green: number;
  hitRate: number | null;
  avgCalledReturnBps: number | null;
};
type CardRow = {
  id: number;
  source: string; // chess | call | hunt
  symbol: string;
  currency: string | null;
  direction: string; // UP | DOWN
  label: string | null;
  conviction: number | null;
  context: string | null;
  predictedAt: string;
  entryPriceCents: number;
  markCents: number | null;
  calledReturnBps: number | null;
  isGreen: boolean | null; // null = pending (no mark yet)
  ageDays: number;
};
type ReportCard = {
  asOf: string;
  overall: Tally;
  bySource: { source: string; label: string; tally: Tally }[];
  byEffectOrder?: { order: number; tally: Tally }[];
  totalRows?: number;
  rows: CardRow[];
};

/* ---------- helpers (web page fmtBps/hitRateStr) ---------- */

const SOURCE_LABEL: Record<string, string> = { call: "Alfred's calls", hunt: 'Hunt leads', chess: 'Chess plays' };
const ORDINAL = ['', '1st', '2nd', '3rd'];

function fmtBps(bps: number | null): string {
  return bps == null ? '—' : `${bps >= 0 ? '+' : ''}${(bps / 100).toFixed(1)}%`;
}
function retColor(bps: number | null, p: Palette): string {
  return bps == null ? p.textMuted : bps > 0 ? p.pos : bps < 0 ? p.neg : p.warn;
}
function sourceColor(source: string, p: Palette): string {
  return source === 'chess' ? p.accentText : source === 'call' ? p.pos : p.textMuted;
}
function when(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ', ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Hit-rate stat card (web TallyCard): % colored by ≥50%, "G/N right · avg · pending" note. */
function TallyCard({ label, t }: { label: string; t: Tally }) {
  const { p } = usePalette();
  const color = t.hitRate == null ? p.textMuted : t.hitRate >= 0.5 ? p.pos : p.neg;
  return (
    <Card style={s.tally}>
      <Text numberOfLines={1} style={[s.tallyLabel, { color: p.textMuted }]}>{label}</Text>
      <Text style={[s.tallyValue, tabular, { color }]}>
        {t.hitRate == null ? '—' : `${Math.round(t.hitRate * 100)}%`}
      </Text>
      <Text numberOfLines={1} style={[s.tallyNote, tabular, { color: p.textMuted }]}>
        {t.green}/{t.graded} right · avg {fmtBps(t.avgCalledReturnBps)}
        {t.pending ? ` · ${t.pending} pending` : ''}
      </Text>
    </Card>
  );
}

/** Filter pill (web's pill buttons). */
function FilterPill({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  const { p } = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.pill,
        { borderColor: p.cardBorder, backgroundColor: p.cardBg },
        active && { borderColor: p.accent + '88', backgroundColor: p.accent + '1f' },
      ]}
    >
      <Text style={{ fontFamily: active ? F.semi : F.med, fontSize: 11.5, color: active ? p.accentText : p.textMuted }}>
        {text}
      </Text>
    </Pressable>
  );
}

type SourceFilter = 'all' | 'call' | 'hunt' | 'chess';
type VerdictFilter = 'all' | 'right' | 'wrong' | 'pending';
const PAGE = 50;

/** Report Card — the forward-test ledger (web /report-card): every dated, directional
 * prediction (Chess plays · Alfred's calls · Hunt leads) snapshotted at the price it was
 * made and graded on ABSOLUTE direction against the tape. Read-only over the experiments. */
export default function ReportCardScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const { data: d, error, loading, refreshing, refresh } = useApi<ReportCard>('/api/report-card');

  const [source, setSourceRaw] = useState<SourceFilter>('all');
  const [verdict, setVerdictRaw] = useState<VerdictFilter>('all');
  const [q, setQRaw] = useState('');
  const [latestOnly, setLatestOnlyRaw] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  // Any filter change rewinds the paging window.
  const setSource = (v: SourceFilter) => { setSourceRaw(v); setLimit(PAGE); };
  const setVerdict = (v: VerdictFilter) => { setVerdictRaw(v); setLimit(PAGE); };
  const setQ = (v: string) => { setQRaw(v); setLimit(PAGE); };
  const setLatestOnly = (v: boolean) => { setLatestOnlyRaw(v); setLimit(PAGE); };

  const rows = d?.rows ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, call: 0, hunt: 0, chess: 0 };
    for (const r of rows) c[r.source] = (c[r.source] ?? 0) + 1;
    return c;
  }, [rows]);

  // The web table's filter logic, verbatim.
  const filtered = useMemo(() => {
    let rs = rows;
    if (source !== 'all') rs = rs.filter((r) => r.source === source);
    if (verdict === 'right') rs = rs.filter((r) => r.isGreen === true);
    else if (verdict === 'wrong') rs = rs.filter((r) => r.isGreen === false);
    else if (verdict === 'pending') rs = rs.filter((r) => r.isGreen == null);
    const term = q.trim().toUpperCase();
    if (term) rs = rs.filter((r) => r.symbol.toUpperCase().includes(term));
    if (latestOnly) {
      // rows arrive newest-first, so the first row per name+source is the latest call of that kind
      const seen = new Set<string>();
      rs = rs.filter((r) => {
        const k = `${r.symbol}|${r.source}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    return rs;
  }, [rows, source, verdict, q, latestOnly]);

  const shown = filtered.slice(0, limit);

  return (
    <SubScreen title="Report Card" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View>
          <Text style={[s.lead, { color: p.textMuted }]}>
            Were the calls right? Every dated, directional prediction — a Chess play, an Alfred
            call, a Hunt lead — is snapshotted at the price it was made and marked to the tape.
            Graded on absolute direction: an UP call scores when the price rose, a DOWN call when
            it fell.
          </Text>

          {rows.length === 0 ? (
            <Card style={{ marginTop: 14 }}>
              <Text style={[s.emptyTitle, { color: p.textPrimary }]}>No predictions on the board yet</Text>
              <Text style={[s.lead, { color: p.textMuted, marginTop: 4 }]}>
                Once Alfred maps a Chess board, sets a call on a dossier, or surfaces a Hunt lead,
                it lands here and starts getting graded against the tape.
              </Text>
            </Card>
          ) : (
            <View>
              {/* Overall + per-source hit rates (web tally-card grid) */}
              <View style={s.tallyGrid}>
                <TallyCard label="Overall hit rate" t={d.overall} />
                {d.bySource.map((sv) => (
                  <TallyCard key={sv.source} label={sv.label} t={sv.tally} />
                ))}
              </View>

              {/* Does the ripple pay? — chess plays by effect-order */}
              {(d.byEffectOrder?.length ?? 0) > 0 && (
                <View>
                  <SectionTitle sub="chess plays by effect-order">Does the ripple pay?</SectionTitle>
                  <View style={s.tallyGrid}>
                    {d.byEffectOrder!.map((e) => (
                      <TallyCard key={e.order} label={`${ORDINAL[e.order] ?? `${e.order}th`}-order`} t={e.tally} />
                    ))}
                  </View>
                </View>
              )}

              {/* Every call — the filterable ledger */}
              <SectionTitle sub="newest first · green = the call paid">Every call</SectionTitle>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillRow}>
                {(['all', 'call', 'hunt', 'chess'] as SourceFilter[]).map((v) => (
                  <FilterPill
                    key={v}
                    text={`${v === 'all' ? 'All' : SOURCE_LABEL[v]} ${counts[v] ?? 0}`}
                    active={source === v}
                    onPress={() => setSource(v)}
                  />
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillRow}>
                {(['all', 'right', 'wrong', 'pending'] as VerdictFilter[]).map((v) => (
                  <FilterPill
                    key={v}
                    text={v === 'all' ? 'Any' : v === 'right' ? '✓ right' : v === 'wrong' ? '✗ wrong' : 'pending'}
                    active={verdict === v}
                    onPress={() => setVerdict(v)}
                  />
                ))}
                <FilterPill text="latest per name" active={latestOnly} onPress={() => setLatestOnly(!latestOnly)} />
              </ScrollView>

              <View style={s.searchRow}>
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder="Search ticker…"
                  placeholderTextColor={p.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={[s.searchInput, { backgroundColor: p.cardBg, borderColor: p.cardBorder, color: p.textPrimary }]}
                />
                <Text style={[s.countNote, tabular, { color: p.textMuted }]}>
                  {filtered.length === rows.length ? `${rows.length} calls` : `${filtered.length} of ${rows.length}`}
                </Text>
              </View>

              <Card style={s.listCard}>
                {shown.length === 0 ? (
                  <Text style={[s.lead, { color: p.textMuted, textAlign: 'center', paddingVertical: 18 }]}>
                    No calls match these filters.
                  </Text>
                ) : (
                  shown.map((r, i) => (
                    <View key={r.id}>
                      {i > 0 && <Divider />}
                      <Pressable onPress={() => router.push(`/stock/${r.symbol}`)} style={s.row}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={s.rowHead}>
                            <Text style={[s.sym, { color: p.accentText }]}>{r.symbol}</Text>
                            <Text style={[s.srcPill, { color: sourceColor(r.source, p), borderColor: sourceColor(r.source, p) + '55' }]}>
                              {r.source}
                            </Text>
                          </View>
                          <Text numberOfLines={1} style={[s.callLine, { color: p.textMuted }]}>
                            <Text style={{ color: r.direction === 'UP' ? p.pos : p.neg }}>
                              {r.direction === 'UP' ? '▲' : '▼'}
                            </Text>
                            {r.label ? ` ${r.label}` : ''}
                            {r.conviction != null ? ` · ${r.conviction}` : ''}
                          </Text>
                          {r.context ? (
                            <Text numberOfLines={1} style={[s.context, { color: p.textMuted }]}>{r.context}</Text>
                          ) : null}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[s.called, tabular, { color: retColor(r.calledReturnBps, p) }]}>
                            {fmtBps(r.calledReturnBps)}
                          </Text>
                          <Text style={[s.verdict, { color: r.isGreen == null ? p.textMuted : r.isGreen ? p.pos : p.neg }]}>
                            {r.isGreen == null ? 'pending' : r.isGreen ? '✓ right' : '✗ wrong'}
                          </Text>
                          <Text style={[s.priceLine, tabular, { color: p.textMuted }]}>
                            {money(r.entryPriceCents)}
                            {r.markCents != null ? ` → ${money(r.markCents)}` : ''}
                            {r.currency && r.currency !== 'CAD' ? ` ${r.currency}` : ''} · {r.ageDays}d
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  ))
                )}
                {filtered.length > limit && (
                  <View>
                    <Divider />
                    <Pressable onPress={() => setLimit((l) => l + 100)} style={s.moreBtn}>
                      <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 12 }}>
                        Show more ({filtered.length - limit} left)
                      </Text>
                    </Pressable>
                  </View>
                )}
              </Card>

              <Footnote>
                marked to the live quote (or the last close when the market's shut), as of {when(d.asOf)} ·
                "called" is the return oriented to the bet — a correct DOWN call shows green · each
                prediction is scored on its own from the moment it was filed · grading judgment ≠
                trading: a call becomes tradeable only after a full dossier clears the same
                guardrails as everything else
              </Footnote>
            </View>
          )}
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  lead: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, marginTop: 4 },
  emptyTitle: { fontFamily: F.semi, fontSize: 13.5 },
  tallyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tally: { flexBasis: '47%', flexGrow: 1, paddingVertical: 12 },
  tallyLabel: { fontFamily: F.semi, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.8 },
  tallyValue: { fontFamily: 'System', fontWeight: '800', fontSize: 20, marginTop: 3 },
  tallyNote: { fontFamily: F.reg, fontSize: 9.5, marginTop: 3 },
  pillRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 8 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: F.med,
    fontSize: 13,
  },
  countNote: { fontFamily: F.reg, fontSize: 10.5 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sym: { fontFamily: F.semi, fontSize: 13 },
  srcPill: {
    fontFamily: F.med,
    fontSize: 8.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  callLine: { fontFamily: F.med, fontSize: 11.5, marginTop: 2 },
  context: { fontFamily: F.reg, fontSize: 10, marginTop: 1 },
  called: { fontFamily: 'System', fontWeight: '800', fontSize: 14 },
  verdict: { fontFamily: F.semi, fontSize: 10, marginTop: 1 },
  priceLine: { fontFamily: F.reg, fontSize: 9.5, marginTop: 2 },
  moreBtn: { alignItems: 'center', paddingVertical: 10 },
});
