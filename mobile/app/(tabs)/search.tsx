import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Divider, Footnote, Loading, ErrorNote } from '../../components/Chrome';
import { usePalette, F, type Palette } from '../../constants/theme';
import { useApi } from '../../services/hooks';
import type { StockIndexItem } from '../../services/types';

/** Search — the web's bottom-right jump-to-stock, as a page. Filters a local
 * index of every name GRQ already covers (universe · watches · research ·
 * retired · the market screen) and opens the stock page. Whole-market ADD
 * lives on the Watchlist page; this is fast, quota-free navigation. */

const KIND_META: Record<StockIndexItem['kind'], { label: string; color: (p: Palette) => string; rank: number }> = {
  active: { label: 'Active', color: (p) => p.pos, rank: 4 },
  watching: { label: 'Watching', color: (p) => p.accentText, rank: 3 },
  researched: { label: 'Researched', color: (p) => p.accent, rank: 2 },
  retired: { label: 'Retired', color: (p) => p.textMuted, rank: 1 },
  screened: { label: 'Screened', color: (p) => p.textMuted, rank: 0 },
};

const MAX_RESULTS = 12;

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mirror of the web's scorer: symbol beats name; prefix beats substring.
function score(item: StockIndexItem, q: string): number {
  const sym = item.symbol.toUpperCase();
  const name = item.name.toUpperCase();
  if (sym === q) return 1000;
  if (sym.startsWith(q)) return 900 - Math.min(sym.length, 50);
  if (name.startsWith(q)) return 700;
  if (new RegExp(`\\b${escapeRegExp(q)}`).test(name)) return 600;
  if (sym.includes(q)) return 500;
  if (name.includes(q)) return 400;
  return -1;
}

export default function SearchScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const { data, error, loading, refreshing, refresh } = useApi<{ stocks: StockIndexItem[] }>('/api/stock-index');
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const index = data?.stocks ?? [];
    const q = query.trim().toUpperCase();
    // No query → the most-recently-accessed names (recency-sorted by the API).
    if (!q) return index.slice(0, MAX_RESULTS);
    return index
      .map((item) => ({ item, sc: score(item, q) }))
      .filter((r) => r.sc >= 0)
      .sort(
        (a, b) =>
          b.sc - a.sc ||
          b.item.seenAt - a.item.seenAt ||
          KIND_META[b.item.kind].rank - KIND_META[a.item.kind].rank,
      )
      .slice(0, MAX_RESULTS)
      .map((r) => r.item);
  }, [data, query]);

  return (
    <Screen title="Search" refreshing={refreshing} onRefresh={refresh}>
      <View style={[s.searchBar, { backgroundColor: p.cardBg, borderColor: p.cardBorder, marginTop: 8 }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Ticker or company name…"
          placeholderTextColor={p.textMuted + '99'}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => results[0] && router.push(`/stock/${results[0].symbol}`)}
          style={[s.input, { color: p.textPrimary }]}
        />
        {query.length > 0 && (
          <Text onPress={() => setQuery('')} style={{ color: p.textMuted, fontFamily: F.semi, fontSize: 13 }}>
            ✕
          </Text>
        )}
      </View>

      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {data && (
        <View style={{ marginTop: 12 }}>
          {!query && (
            <Text style={[s.recentLabel, { color: p.textMuted }]}>RECENTLY VIEWED</Text>
          )}
          {results.length === 0 ? (
            <Card>
              <Text style={[s.empty, { color: p.textMuted }]}>
                No covered name matches "{query.trim()}" — to research something brand new, add it
                on the Watchlist page and Alfred will dossier it.
              </Text>
            </Card>
          ) : (
            <Card style={s.listCard}>
              {results.map((item, i) => {
                const km = KIND_META[item.kind];
                return (
                  <View key={item.symbol}>
                    {i > 0 && <Divider />}
                    <Pressable onPress={() => router.push(`/stock/${item.symbol}`)} style={s.row}>
                      <View style={s.rowMain}>
                        <Text style={[s.sym, { color: p.accentText }]}>{item.symbol}</Text>
                        <Text style={[s.name, { color: p.textMuted }]} numberOfLines={1}>{item.name}</Text>
                      </View>
                      <Text style={[s.kind, { color: km.color(p) }]}>{km.label}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          )}
          <Footnote>
            every name GRQ holds information on — {data.stocks.length.toLocaleString()} covered ·
            quota-free · whole-market adds live on Watchlist
          </Footnote>
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  input: { flex: 1, fontFamily: F.reg, fontSize: 14.5, paddingVertical: 11 },
  recentLabel: {
    fontFamily: F.semi,
    fontSize: 10.5,
    letterSpacing: 1,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  rowMain: { flex: 1, minWidth: 0 },
  sym: { fontFamily: F.semi, fontSize: 14 },
  name: { fontFamily: F.reg, fontSize: 11, marginTop: 1 },
  kind: { fontFamily: F.semi, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  empty: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18 },
});
