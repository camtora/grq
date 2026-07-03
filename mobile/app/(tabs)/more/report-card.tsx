import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, Divider, Loading, ErrorNote } from '../../../components/Chrome';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { signedPctFromBps, pnlColor } from '../../../lib/format';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

type CardRow = {
  id: number;
  source: string;
  symbol: string;
  direction: string; // UP | DOWN
  label: string | null;
  conviction: number | null;
  context: string | null;
  predictedAt: string;
  calledReturnBps: number | null;
  isGreen: boolean;
  ageDays: number;
};
type ReportCard = {
  overall: { graded: number; pending: number; green: number; hitRate: number; avgCalledReturnBps: number };
  bySource: { source: string; graded: number; green: number; hitRate: number; avgCalledReturnBps: number }[];
  rows: CardRow[];
};

function Stat({ label, value, p }: { label: string; value: string; p: Palette }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statLabel, { color: p.textMuted }]}>{label}</Text>
      <Text style={[s.statValue, tabular, { color: p.textPrimary }]}>{value}</Text>
    </View>
  );
}

/** Report Card — how every call actually did, graded with receipts (D93-era). */
export default function ReportCardScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const { data: d, error, loading, refreshing, refresh } = useApi<ReportCard>('/api/report-card');

  return (
    <SubScreen title="Report Card" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View>
          <SectionTitle sub="every prediction, marked to market">The record</SectionTitle>
          <Card style={s.statRow}>
            <Stat label="graded" value={d.overall.graded.toLocaleString()} p={p} />
            <Stat label="green" value={`${(d.overall.hitRate * 100).toFixed(0)}%`} p={p} />
            <Stat label="avg call" value={`${d.overall.avgCalledReturnBps} bps`} p={p} />
            <Stat label="pending" value={String(d.overall.pending)} p={p} />
          </Card>

          {d.bySource.length > 0 && (
            <View>
              <SectionTitle sub="who's earning their keep">By source</SectionTitle>
              <Card style={s.listCard}>
                {d.bySource.map((sv, i) => (
                  <View key={sv.source}>
                    {i > 0 && <Divider />}
                    <View style={s.row}>
                      <Text style={[s.sourceName, { color: p.textPrimary }]}>{sv.source}</Text>
                      <Text style={[s.meta, tabular, { color: p.textMuted }]}>
                        {sv.green}/{sv.graded} green ({(sv.hitRate * 100).toFixed(0)}%) · avg {sv.avgCalledReturnBps} bps
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          )}

          <SectionTitle sub="the latest calls">The ledger</SectionTitle>
          <Card style={s.listCard}>
            {d.rows.slice(0, 25).map((r, i) => (
              <View key={r.id}>
                {i > 0 && <Divider />}
                <Pressable onPress={() => router.push(`/stock/${r.symbol}`)} style={s.row}>
                  <View style={[s.greenDot, { backgroundColor: r.isGreen ? p.pos : p.textMuted + '55' }]} />
                  <Text style={[s.sym, { color: p.accentText, width: 62 }]}>{r.symbol}</Text>
                  <Text style={[s.dir, { color: r.direction === 'UP' ? p.pos : p.neg }]}>
                    {r.direction === 'UP' ? '▲' : '▼'}
                  </Text>
                  <Text style={[s.meta, { color: p.textMuted, flex: 1 }]} numberOfLines={1}>
                    {r.label ?? r.context ?? r.source}{r.conviction != null ? ` · ${r.conviction}%` : ''}
                  </Text>
                  {r.calledReturnBps != null && (
                    <Text style={[s.meta, tabular, { color: pnlColor(r.calledReturnBps, p) }]}>
                      {signedPctFromBps(r.calledReturnBps)}
                    </Text>
                  )}
                  <Text style={[s.meta, tabular, { color: p.textMuted, width: 28, textAlign: 'right' }]}>
                    {r.ageDays}d
                  </Text>
                </Pressable>
              </View>
            ))}
          </Card>
          <Footnote>
            green = the call is up vs its entry mark · a young call isn't a verdict yet — the rate
            matters more than any single row
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  statRow: { flexDirection: 'row', paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { fontFamily: F.med, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontFamily: F.display, fontSize: 16, marginTop: 3 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  sourceName: { fontFamily: F.semi, fontSize: 13, flex: 1, textTransform: 'capitalize' },
  greenDot: { width: 7, height: 7, borderRadius: 4 },
  sym: { fontFamily: F.semi, fontSize: 12.5 },
  dir: { fontFamily: F.bold, fontSize: 10 },
  meta: { fontFamily: F.reg, fontSize: 10.5 },
});
