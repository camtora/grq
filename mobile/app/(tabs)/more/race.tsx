import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SubScreen, Card, SectionTitle, Footnote, Divider, Loading, ErrorNote } from '../../../components/Chrome';
import Sparkline from '../../../components/Sparkline';
import { usePalette, F } from '../../../constants/theme';
import { money, signedMoney, pnlColor } from '../../../lib/format';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

type RaceModel = {
  model: string;
  label: string;
  role: string; // incumbent | challenger
  pnlCadCents: number;
  scoredCalls: number;
  greens: number;
  hitRate: number;
  avgReturnBps: number;
  vsBenchmarkBps: number;
  totalCalls: number;
  avgConfidence: number;
  spark: number[];
};

/** Second Opinions — shadow models judge the fund's REAL calls (no separate
 * book): same check-ins, same information, scored on what each would have done. */
export default function RaceScreen() {
  const { p } = usePalette();
  const { data: d, error, loading, refreshing, refresh } = useApi<{ models: RaceModel[] }>('/api/race');

  const models = [...(d?.models ?? [])].sort((a, b) => b.pnlCadCents - a.pnlCadCents);

  return (
    <SubScreen title="Second Opinions" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View>
          <SectionTitle sub="virtual $1k per scored call — judgment, not a book">The scorecard</SectionTitle>
          {models.map((m) => (
            <Card key={m.model} style={{ marginBottom: 10 }}>
              <View style={s.head}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: p.textPrimary }]}>{m.label}</Text>
                  <Text style={[s.role, { color: m.role === 'incumbent' ? p.accentText : p.textMuted }]}>
                    {m.role === 'incumbent' ? '★ the incumbent (Opus — the live agent)' : 'challenger'}
                  </Text>
                </View>
                <Text style={[s.pnl, tabular, { color: pnlColor(m.pnlCadCents, p) }]}>
                  {signedMoney(m.pnlCadCents)}
                </Text>
              </View>
              {m.spark.length >= 2 && <Sparkline values={m.spark} height={36} />}
              <Text style={[s.meta, tabular, { color: p.textMuted }]}>
                {m.greens}/{m.scoredCalls} green ({(m.hitRate * 100).toFixed(0)}%) · avg {m.avgReturnBps} bps ·
                vs bench {m.vsBenchmarkBps > 0 ? '+' : ''}{m.vsBenchmarkBps} bps · {m.totalCalls} calls · conf {m.avgConfidence}%
              </Text>
            </Card>
          ))}
          <Footnote>
            every model sees the SAME check-ins as the live agent and files its own call; each call
            gets a virtual $1k and is marked to market — no shadow ever touches the order gate
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  label: { fontFamily: F.semi, fontSize: 14.5 },
  role: { fontFamily: F.reg, fontSize: 10.5, marginTop: 1 },
  pnl: { fontFamily: 'System', fontWeight: '800', fontSize: 16 },
  meta: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 15, marginTop: 8 },
});
