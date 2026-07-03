import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, Footnote, Divider, Loading, ErrorNote } from '../../../components/Chrome';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money } from '../../../lib/format';
import { useApi } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

type BrowseRow = {
  symbol: string;
  name: string;
  exchange: string;
  sector: string | null;
  marketCapM: number | null;
  priceCents: number | null;
  currency: string | null;
  screenScore: number;
  tag: string | null; // INTERESTING | WATCH | PASS
  take: string | null;
};

function tagColor(tag: string | null, p: Palette): string {
  if (tag === 'INTERESTING') return p.pos;
  if (tag === 'WATCH') return p.warn;
  return p.textMuted;
}

/** Browse — the Market Base Layer: every screened company ranked by the
 * Tier-0 deterministic score, with the Tier-1 Haiku take where tagged. */
export default function BrowseScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const { data: d, error, loading, refreshing, refresh } = useApi<{ rows: BrowseRow[]; total: number }>('/api/browse');

  return (
    <SubScreen title="Browse" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View style={{ marginTop: 8 }}>
          <Card style={s.listCard}>
            {d.rows.map((r, i) => (
              <View key={r.symbol}>
                {i > 0 && <Divider />}
                <Pressable onPress={() => router.push(`/stock/${r.symbol}`)} style={s.row}>
                  <Text style={[s.rank, tabular, { color: p.textMuted }]}>{i + 1}</Text>
                  <View style={s.rowMain}>
                    <View style={s.symRow}>
                      <Text style={[s.sym, { color: p.accentText }]}>{r.symbol}</Text>
                      {r.tag && <Text style={[s.tag, { color: tagColor(r.tag, p) }]}>{r.tag.toLowerCase()}</Text>}
                    </View>
                    <Text style={[s.name, { color: p.textMuted }]} numberOfLines={1}>
                      {r.name}{r.sector ? ` · ${r.sector}` : ''} · {r.exchange}
                    </Text>
                    {r.take && (
                      <Text style={[s.take, { color: p.textMuted }]} numberOfLines={2}>{r.take}</Text>
                    )}
                  </View>
                  <View style={s.rowRight}>
                    <Text style={[s.score, tabular, { color: p.textPrimary }]}>{r.screenScore}</Text>
                    {r.priceCents != null && (
                      <Text style={[s.meta, tabular, { color: p.textMuted }]}>
                        {r.currency === 'USD' ? 'US' : ''}{money(r.priceCents)}
                      </Text>
                    )}
                  </View>
                </Pressable>
              </View>
            ))}
          </Card>
          <Footnote>
            top {d.rows.length} of {d.total.toLocaleString()} screened companies · score = the
            deterministic Tier-0 screen (no LLM) · the tag/take is Haiku's first pass · add a new
            name to research on Watchlist
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rank: { fontFamily: F.reg, fontSize: 10.5, width: 22, textAlign: 'right' },
  rowMain: { flex: 1, minWidth: 0 },
  symRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sym: { fontFamily: F.semi, fontSize: 14 },
  tag: { fontFamily: F.bold, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontFamily: F.reg, fontSize: 10.5, marginTop: 1 },
  take: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 11, lineHeight: 15, marginTop: 3 },
  rowRight: { alignItems: 'flex-end' },
  score: { fontFamily: F.semi, fontSize: 13.5 },
  meta: { fontFamily: F.reg, fontSize: 10, marginTop: 1 },
});
