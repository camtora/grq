import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, Footnote, Divider, Loading, ErrorNote } from '../../../components/Chrome';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { useApi } from '../../../services/hooks';

type ReportRow = { id: string; kind: string; dateISO: string; title: string; summary: string };

const KIND_META: Record<string, { label: string; color: (p: Palette) => string }> = {
  EOD: { label: 'Evening', color: (p) => p.pos },
  WEEKLY: { label: 'Weekly', color: (p) => p.accentText },
  CHANGE: { label: 'Build diary', color: (p) => p.warn },
};

/** Reports — EOD closes, weekly reviews, and Graham's plain-English build diary. */
export default function ReportsScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const { data: d, error, loading, refreshing, refresh } = useApi<{ reports: ReportRow[] }>('/api/reports');

  return (
    <SubScreen title="Reports" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View style={{ marginTop: 8 }}>
          <Card style={s.listCard}>
            {d.reports.map((r, i) => {
              const meta = KIND_META[r.kind] ?? { label: r.kind, color: (pp: Palette) => pp.textMuted };
              return (
                <View key={r.id}>
                  {i > 0 && <Divider />}
                  <Pressable onPress={() => router.push(`/more/report/${r.id}`)} style={s.row}>
                    <View style={s.rowMain}>
                      <View style={s.head}>
                        <Text style={[s.kind, { color: meta.color(p) }]}>{meta.label}</Text>
                        <Text style={[s.date, { color: p.textMuted }]}>{r.dateISO}</Text>
                      </View>
                      <Text style={[s.summary, { color: p.textMuted }]} numberOfLines={2}>{r.summary}</Text>
                    </View>
                    <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 12 }}>read</Text>
                  </Pressable>
                </View>
              );
            })}
          </Card>
          <Footnote>the build diary is Alfred's 3am plain-English changelog of what we shipped</Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowMain: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  kind: { fontFamily: F.bold, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5 },
  date: { fontFamily: F.reg, fontSize: 10.5 },
  summary: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
