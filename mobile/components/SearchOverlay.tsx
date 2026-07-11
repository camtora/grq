import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePalette, F, type Palette } from '../constants/theme';
import { api } from '../services/api';
import { useAuth } from '../store/auth';
import type { StockIndexItem } from '../services/types';

const AVATARS: Record<string, number> = {
  cam: require('../assets/people/cam.png'),
  graham: require('../assets/people/graham.png'),
};

/** The jump-to-stock search as a floating overlay (the web's round search
 * button, mobile edition): a FAB above the tab bar opens a scrimmed field +
 * tappable result list. Filters the covered-names index locally — quota-free. */

const KIND_META: Record<StockIndexItem['kind'], { label: string; color: (p: Palette) => string; rank: number }> = {
  active: { label: 'Active', color: (p) => p.pos, rank: 4 },
  watching: { label: 'Watching', color: (p) => p.accentText, rank: 3 },
  researched: { label: 'Researched', color: (p) => p.accent, rank: 2 },
  retired: { label: 'Retired', color: (p) => p.textMuted, rank: 1 },
  screened: { label: 'Screened', color: (p) => p.textMuted, rank: 0 },
};

const MAX_RESULTS = 10;

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

export default function SearchOverlay() {
  const { p } = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.me);
  const myKey = me?.email?.includes('appleby') ? 'graham' : 'cam';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<StockIndexItem[] | null>(null);
  const [watchBusy, setWatchBusy] = useState<string | null>(null);

  // Watch/unwatch straight from a result row (optimistic; Cam 2026-07-03).
  const toggleWatch = async (item: StockIndexItem) => {
    if (watchBusy) return;
    const watching = (item.watchers ?? []).includes(myKey);
    setWatchBusy(item.symbol);
    setIndex((prev) =>
      prev
        ? prev.map((it) =>
            it.symbol === item.symbol
              ? { ...it, watchers: watching ? (it.watchers ?? []).filter((k) => k !== myKey) : [...(it.watchers ?? []), myKey] }
              : it,
          )
        : prev,
    );
    try {
      await api('/api/universe', {
        method: 'POST',
        body: JSON.stringify(watching ? { action: 'unwatch', symbol: item.symbol } : { action: 'add', symbol: item.symbol, name: item.name }),
      });
    } catch {
      // revert on failure
      setIndex((prev) =>
        prev
          ? prev.map((it) =>
              it.symbol === item.symbol
                ? { ...it, watchers: watching ? [...(it.watchers ?? []), myKey] : (it.watchers ?? []).filter((k) => k !== myKey) }
                : it,
            )
          : prev,
      );
    } finally {
      setWatchBusy(null);
    }
  };

  const openSearch = () => {
    setOpen(true);
    setQuery('');
    // Lazily load the index once, on first open (like the web).
    if (!index) {
      api<{ stocks: StockIndexItem[] }>('/api/stock-index')
        .then((d) => setIndex(d.stocks))
        .catch(() => setIndex([]));
    }
  };

  const go = (symbol: string) => {
    setOpen(false);
    router.push(`/stock/${symbol}`);
  };

  const results = useMemo(() => {
    if (!index) return [];
    const q = query.trim().toUpperCase();
    if (!q) return index.slice(0, MAX_RESULTS); // recency-sorted by the API
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
  }, [index, query]);

  // The tab bar is ~49 + the home-indicator inset; float just above it.
  const fabBottom = 49 + insets.bottom + 14;

  return (
    <>
      {!open && (
        <Pressable
          onPress={openSearch}
          style={[s.fab, { bottom: fabBottom, backgroundColor: p.cardBg, borderColor: p.accent + '66' }]}
        >
          <Ionicons name="search" size={22} color={p.accentText} />
        </Pressable>
      )}

      {open && (
        <View style={StyleSheet.absoluteFill}>
          {/* Scrim — tap anywhere off the panel to dismiss. */}
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: p.bodyBg + 'e6' }]} onPress={() => setOpen(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={s.panelWrap}
            pointerEvents="box-none"
          >
            <View style={[s.panel, { marginTop: insets.top + 14 }]} pointerEvents="box-none">
              <View style={[s.field, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>
                <Ionicons name="search" size={17} color={p.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Ticker or company name…"
                  placeholderTextColor={p.textMuted + '99'}
                  autoFocus
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={() => results[0] && go(results[0].symbol)}
                  style={[s.input, { color: p.textPrimary }]}
                />
                <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                  <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 13 }}>Cancel</Text>
                </Pressable>
              </View>

              <View style={[s.results, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>
                {!index ? (
                  <Text style={[s.hint, { color: p.textMuted }]}>loading the index…</Text>
                ) : results.length === 0 ? (
                  <Text style={[s.hint, { color: p.textMuted }]}>
                    No covered name matches — add brand-new names on Watchlist.
                  </Text>
                ) : (
                  <FlatList
                    data={results}
                    keyExtractor={(it) => it.symbol}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item, index: i }) => {
                      const km = KIND_META[item.kind];
                      const watching = (item.watchers ?? []).includes(myKey);
                      return (
                        <Pressable
                          onPress={() => go(item.symbol)}
                          style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.cardBorder }]}
                        >
                          <View style={s.rowMain}>
                            <Text style={[s.sym, { color: p.accentText }]}>{item.symbol}</Text>
                            <Text style={[s.name, { color: p.textMuted }]} numberOfLines={1}>
                              {item.name}
                              <Text style={{ color: km.color(p) }}>  · {km.label.toLowerCase()}</Text>
                            </Text>
                          </View>
                          {/* who's watching */}
                          <View style={s.avatars}>
                            {(item.watchers ?? []).map((k) =>
                              AVATARS[k] ? (
                                <Image key={k} source={AVATARS[k]} style={[s.avatar, { borderColor: p.cardBg }]} />
                              ) : null,
                            )}
                          </View>
                          {/* the watch toggle */}
                          <Pressable
                            onPress={() => toggleWatch(item)}
                            hitSlop={10}
                            style={{ opacity: watchBusy === item.symbol ? 0.4 : 1 }}
                          >
                            <Ionicons name={watching ? 'eye' : 'eye-outline'} size={18} color={watching ? p.accent : p.textMuted} />
                          </Pressable>
                        </Pressable>
                      );
                    }}
                  />
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#14b8a6',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  panelWrap: { flex: 1, paddingHorizontal: 16 },
  panel: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  input: { flex: 1, fontFamily: F.reg, fontSize: 15, paddingVertical: 11 },
  results: { borderWidth: 1, borderRadius: 14, marginTop: 8, maxHeight: 420, overflow: 'hidden' },
  hint: { fontFamily: F.reg, fontSize: 12, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  rowMain: { flex: 1, minWidth: 0 },
  sym: { fontFamily: F.semi, fontSize: 14 },
  name: { fontFamily: F.reg, fontSize: 11, marginTop: 1 },
  kind: { fontFamily: F.semi, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  avatars: { flexDirection: 'row', marginRight: 2 },
  avatar: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, marginLeft: -6 },
});
