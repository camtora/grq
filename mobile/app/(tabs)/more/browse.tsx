import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, Footnote, Divider, Loading, ErrorNote } from '../../../components/Chrome';
import StockLogo from '../../../components/StockLogo';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money } from '../../../lib/format';
import { stanceMeta, toneColor } from '../../../lib/stance';
import { api } from '../../../services/api';
import { useApi, useLiveQuotes } from '../../../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

/* ---------- wire (web /market/browse parity) ---------- */

type BrowseRow = {
  symbol: string;
  bare: string; // the dossier/research/stock-page key
  name: string;
  exchange: string | null;
  sector: string | null;
  country: string | null;
  marketCapM: number | null;
  priceCents: number | null;
  currency: string | null;
  screenScore: number | null;
  tag: string | null; // INTERESTING | WATCH | PASS (untracked triage)
  take: string | null;
  signal: string | null; // the technical read (a formula)
  call: string | null; // Alfred's REAL call when tracked
  logoUrl: string | null;
  agentTracks: boolean;
  watchers: string[]; // member keys
  myWatch: boolean;
  research: 'done' | 'inflight' | 'none';
};

const EXCHANGES = ['TSX', 'TSXV', 'NEO', 'NYSE', 'NASDAQ', 'AMEX'];
const SECTORS = [
  'Technology',
  'Financial Services',
  'Energy',
  'Healthcare',
  'Industrials',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Basic Materials',
  'Real Estate',
  'Utilities',
  'Communication Services',
];
const COUNTRIES = [
  { v: 'CA', l: 'Canada' },
  { v: 'US', l: 'United States' },
];
const CAPS = [
  { v: 'mega', l: 'Mega ≥$200B' },
  { v: 'large', l: 'Large $10–200B' },
  { v: 'mid', l: 'Mid $2–10B' },
  { v: 'small', l: 'Small $300M–2B' },
  { v: 'micro', l: 'Micro <$300M' },
];

const AVATARS: Record<string, number> = {
  cam: require('../../../assets/people/cam.png'),
  graham: require('../../../assets/people/graham.png'),
};
const BULL = require('../../../assets/bull-splash.png');

function capLabel(m: number | null): string {
  if (!m || m <= 0) return '—';
  return m >= 1000 ? `$${Math.round(m / 1000)}B` : `$${m}M`;
}

function tagColor(tag: string, p: Palette): string {
  if (tag === 'INTERESTING') return p.pos;
  if (tag === 'WATCH') return p.warn;
  return p.textMuted;
}

/* ---------- filter chips ---------- */

function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
  p,
}: {
  label: string;
  options: { v: T; l: string }[];
  value: T | '';
  onChange: (v: T | '') => void;
  p: Palette;
}) {
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={[s.filterLabel, { color: p.textMuted }]}>{label.toUpperCase()}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {[{ v: '' as T | '', l: 'Any' }, ...options].map((o) => {
          const on = value === o.v;
          return (
            <Pressable
              key={o.v || 'any'}
              onPress={() => onChange(o.v)}
              style={[
                s.chip,
                { borderColor: on ? p.accent + '88' : p.cardBorder, backgroundColor: on ? p.accent + '26' : p.cardBg },
              ]}
            >
              <Text style={{ color: on ? p.accentText : p.textMuted, fontFamily: on ? F.semi : F.med, fontSize: 11 }}>
                {o.l}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ---------- one row ---------- */

function Row({
  r,
  live,
  p,
  onChanged,
}: {
  r: BrowseRow;
  live: Record<string, { priceCents: number; changeBps: number }>;
  p: Palette;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'watch' | 'research' | null>(null);
  const price = live[r.symbol]?.priceCents ?? r.priceCents;
  const callMeta = r.call ? stanceMeta(r.call) : null;
  const sigMeta = r.signal ? stanceMeta(r.signal) : null;

  const doWatch = async () => {
    if (busy) return;
    setBusy('watch');
    try {
      await api('/api/universe', {
        method: 'POST',
        body: JSON.stringify(
          r.myWatch
            ? { action: 'unwatch', symbol: r.bare }
            : { action: 'add', symbol: r.bare, exchange: r.exchange ?? undefined, currency: r.currency ?? undefined, name: r.name },
        ),
      });
      onChanged();
    } catch (e) {
      Alert.alert('Watch', e instanceof Error ? e.message : 'Could not update the watch.');
    } finally {
      setBusy(null);
    }
  };

  const doResearch = async () => {
    if (busy || r.research !== 'none') return;
    setBusy('research');
    try {
      await api('/api/universe', { method: 'POST', body: JSON.stringify({ action: 'research', symbol: r.bare }) });
      onChanged();
    } catch (e) {
      Alert.alert('Research', e instanceof Error ? e.message : 'Could not queue the research.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Pressable onPress={() => setOpen(!open)} style={s.row}>
      <StockLogo symbol={r.symbol} logoUrl={r.logoUrl} size={28} />
      <View style={s.rowMain}>
        <View style={s.symRow}>
          {/* The symbol is the link (web §1.7); the rest of the row expands. */}
          <Text
            onPress={() => router.push(`/stock/${r.symbol}`)}
            style={[s.sym, { color: p.accentText, textDecorationLine: 'underline' }]}
          >
            {r.symbol}
          </Text>
          {callMeta ? (
            // Tracked → Alfred's real call from the dossier, tone-coded.
            <Text style={[s.pill, { color: toneColor(callMeta.tone, p), borderColor: toneColor(callMeta.tone, p) + '55', backgroundColor: toneColor(callMeta.tone, p) + '1a' }]}>
              {callMeta.label}
            </Text>
          ) : r.tag ? (
            <Text style={[s.pill, { color: tagColor(r.tag, p), borderColor: tagColor(r.tag, p) + '55', backgroundColor: tagColor(r.tag, p) + '1a' }]}>
              {r.tag}
            </Text>
          ) : null}
          {(r.agentTracks || r.watchers.length > 0) && (
            <View style={s.avatars}>
              {r.agentTracks && <Image source={BULL} style={[s.avatar, { borderColor: p.cardBg }]} />}
              {r.watchers.map(
                (k) => AVATARS[k] && <Image key={k} source={AVATARS[k]} style={[s.avatar, { borderColor: p.cardBg, marginLeft: -6 }]} />,
              )}
            </View>
          )}
        </View>
        <Text style={[s.name, { color: p.textMuted }]} numberOfLines={1}>
          {r.name}
          {r.sector ? ` · ${r.sector}` : ''}
          {r.exchange ? ` · ${r.exchange}` : ''}
        </Text>
        {!open && r.take && (
          <Text style={[s.take, { color: p.textMuted }]} numberOfLines={2}>
            {r.take}
          </Text>
        )}
      </View>
      <View style={s.rowRight}>
        {r.screenScore != null && <Text style={[s.score, tabular, { color: p.textPrimary }]}>{r.screenScore}</Text>}
        {price != null && (
          <Text style={[s.meta, tabular, { color: p.textMuted }]}>
            {r.currency === 'USD' ? 'US' : ''}
            {money(price)}
          </Text>
        )}
      </View>

      {open && (
        <View style={[s.expand, { borderTopColor: p.cardBorder }]}>
          {r.take && <Text style={[s.takeFull, { color: p.textMuted }]}>{r.take}</Text>}
          <View style={s.metaLine}>
            {sigMeta && (
              <Text style={[s.meta, { color: p.textMuted }]}>
                technical{' '}
                <Text style={{ color: toneColor(sigMeta.tone, p), fontFamily: F.semi }}>{sigMeta.label}</Text>
                {' '}(the chart&apos;s formula, not Alfred)
              </Text>
            )}
            <Text style={[s.meta, tabular, { color: p.textMuted }]}>
              cap {capLabel(r.marketCapM)}
              {r.country ? ` · ${r.country}` : ''}
            </Text>
          </View>
          <View style={s.actions}>
            {r.research === 'done' ? (
              <Pressable onPress={() => router.push(`/stock/${r.bare}`)} style={[s.cta, { backgroundColor: p.accent + '26' }]}>
                <Text style={[s.ctaText, { color: p.accentText }]}>view dossier →</Text>
              </Pressable>
            ) : r.research === 'inflight' ? (
              <View style={[s.cta, { backgroundColor: p.cardHi, flexDirection: 'row', gap: 6, alignItems: 'center' }]}>
                <ActivityIndicator size="small" color={p.textMuted} />
                <Text style={[s.ctaText, { color: p.textMuted }]}>researching…</Text>
              </View>
            ) : (
              <Pressable onPress={doResearch} disabled={busy === 'research'} style={[s.cta, { backgroundColor: p.accent + '26' }]}>
                <Text style={[s.ctaText, { color: p.accentText }]}>{busy === 'research' ? '…' : '🔬 research'}</Text>
              </Pressable>
            )}
            <Pressable onPress={doWatch} disabled={busy === 'watch'} style={[s.cta, { backgroundColor: p.cardHi }]}>
              <Text style={[s.ctaText, { color: r.myWatch ? p.textMuted : p.accentText }]}>
                {busy === 'watch' ? '…' : r.myWatch ? '✕ unwatch' : '＋ watch'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </Pressable>
  );
}

/* ---------- the page ---------- */

type SortKey = 'score' | 'cap' | 'price' | 'ticker';

/** Browse — the whole investable market (web /market/browse parity): a name/
 * ticker search + exchange/sector/country/cap filters over the Market Base
 * Layer's Tier-0 ranking, Alfred's real call on tracked names vs the Haiku
 * triage tag, live prices, and Research/Watch straight from the row. */
export default function BrowseScreen() {
  const { p } = usePalette();
  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [exchange, setExchange] = useState('');
  const [sector, setSector] = useState('');
  const [country, setCountry] = useState('');
  const [cap, setCap] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' });

  const path = useMemo(() => {
    const sp = new URLSearchParams();
    if (submittedQ) sp.set('q', submittedQ);
    if (exchange) sp.set('exchange', exchange);
    if (sector) sp.set('sector', sector);
    if (country) sp.set('country', country);
    if (cap) sp.set('cap', cap);
    const qs = sp.toString();
    return `/api/browse${qs ? `?${qs}` : ''}`;
  }, [submittedQ, exchange, sector, country, cap]);

  const { data: d, error, loading, refreshing, refresh, reload } = useApi<{ rows: BrowseRow[]; total: number; note?: string }>(path);
  const live = useLiveQuotes((d?.rows ?? []).map((r) => r.symbol));

  const activeFilters = [exchange, sector, country, cap].filter(Boolean).length;

  const tapSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'ticker' ? 'asc' : 'desc' },
    );
  };

  const rows = useMemo(() => {
    const list = [...(d?.rows ?? [])];
    const metric = (r: BrowseRow): number | string | null =>
      sort.key === 'score' ? r.screenScore : sort.key === 'cap' ? r.marketCapM : sort.key === 'price' ? (live[r.symbol]?.priceCents ?? r.priceCents) : r.symbol;
    list.sort((a, b) => {
      const av = metric(a);
      const bv = metric(b);
      if (typeof av === 'string' || typeof bv === 'string') {
        const c = String(av ?? '').localeCompare(String(bv ?? ''));
        return sort.dir === 'asc' ? c : -c;
      }
      const missing = sort.dir === 'desc' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
      return sort.dir === 'desc' ? ((bv as number) ?? missing) - ((av as number) ?? missing) : ((av as number) ?? missing) - ((bv as number) ?? missing);
    });
    return list;
  }, [d, sort, live]);

  const sortChips: { key: SortKey; label: string }[] = [
    { key: 'score', label: sort.key === 'score' && sort.dir === 'asc' ? 'Score ↑' : 'Score ↓' },
    { key: 'cap', label: sort.key === 'cap' && sort.dir === 'asc' ? 'Cap ↑' : 'Cap ↓' },
    { key: 'price', label: sort.key === 'price' && sort.dir === 'asc' ? 'Price ↑' : 'Price ↓' },
    { key: 'ticker', label: sort.key === 'ticker' && sort.dir === 'desc' ? 'Z–A' : 'A–Z' },
  ];

  return (
    <SubScreen title="Browse" refreshing={refreshing} onRefresh={refresh}>
      <View style={{ marginTop: 8 }}>
        <Text style={[s.intro, { color: p.textMuted }]}>
          The whole investable market — an automated first-pass scan of every non-ETF name (NASDAQ · NYSE ·
          AMEX · TSX · TSXV · NEO), NOT the researched watchlist. Search or screen, then dig in.
        </Text>

        {/* search + filters */}
        <View style={s.searchRow}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="name or ticker — e.g. Shopify, ANET"
            placeholderTextColor={p.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => setSubmittedQ(q.trim())}
            style={[s.searchInput, { backgroundColor: p.cardBg, borderColor: p.cardBorder, color: p.textPrimary }]}
          />
          {(q || submittedQ) ? (
            <Pressable
              onPress={() => {
                setQ('');
                setSubmittedQ('');
              }}
              style={[s.smallBtn, { backgroundColor: p.cardHi }]}
            >
              <Text style={[s.smallBtnText, { color: p.textMuted }]}>clear</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setShowFilters(!showFilters)} style={[s.smallBtn, { backgroundColor: p.accent + '26' }]}>
            <Text style={[s.smallBtnText, { color: p.accentText }]}>
              filters{activeFilters ? ` · ${activeFilters}` : ''} {showFilters ? '▴' : '▾'}
            </Text>
          </Pressable>
        </View>

        {showFilters && (
          <Card style={{ paddingVertical: 8, marginTop: 8 }}>
            <ChipRow label="Exchange" options={EXCHANGES.map((e) => ({ v: e, l: e }))} value={exchange} onChange={setExchange} p={p} />
            <ChipRow label="Sector" options={SECTORS.map((x) => ({ v: x, l: x }))} value={sector} onChange={setSector} p={p} />
            <ChipRow label="Country" options={COUNTRIES} value={country} onChange={setCountry} p={p} />
            <ChipRow label="Cap" options={CAPS} value={cap} onChange={setCap} p={p} />
          </Card>
        )}

        {/* sort */}
        <View style={s.sortRow}>
          <Text style={[s.filterLabel, { color: p.textMuted }]}>SORT</Text>
          {sortChips.map((o) => (
            <Pressable
              key={o.key}
              onPress={() => tapSort(o.key)}
              style={[
                s.chip,
                { borderColor: sort.key === o.key ? p.accent + '88' : p.cardBorder, backgroundColor: sort.key === o.key ? p.accent + '26' : p.cardBg },
              ]}
            >
              <Text style={{ color: sort.key === o.key ? p.accentText : p.textMuted, fontFamily: sort.key === o.key ? F.semi : F.med, fontSize: 11 }}>
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading && <Loading />}
        {error && !loading && <ErrorNote message={error} />}
        {d?.note ? (
          <Card>
            <Text style={[s.empty, { color: p.textMuted }]}>{d.note}</Text>
          </Card>
        ) : d && rows.length === 0 ? (
          <Card>
            <Text style={[s.empty, { color: p.textMuted }]}>
              {submittedQ ? `No matches for “${submittedQ}” — try the company name or a different ticker.` : 'No matches — loosen the filters.'}
            </Text>
          </Card>
        ) : d ? (
          <View style={{ marginTop: 8 }}>
            <Card style={s.listCard}>
              {rows.map((r, i) => (
                <View key={`${r.symbol}-${r.exchange}`}>
                  {i > 0 && <Divider />}
                  <Row r={r} live={live} p={p} onChanged={reload} />
                </View>
              ))}
            </Card>
            <Footnote>
              {submittedQ
                ? `search matches · the dropdown filters still apply`
                : `top ${rows.length} of ${d.total.toLocaleString()} screened companies`}
              {' · '}Score = a deterministic 0–100 quality/liquidity rank — it de-junks the long tail, NOT a buy
              signal · the pill = Alfred&apos;s real call for a tracked name, else Haiku&apos;s first-pass triage
              (INTERESTING worth a look · WATCH wait for a catalyst · PASS skip) · technical = the chart&apos;s
              formula · prices live, in each listing&apos;s native currency · Research queues a full dossier
              without adding the name anywhere; Watch adds it to your watchlist — trading still needs promotion
              into the universe
            </Footnote>
          </View>
        ) : null}
      </View>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: F.reg,
    fontSize: 13,
  },
  smallBtn: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  smallBtnText: { fontFamily: F.semi, fontSize: 11.5 },
  filterLabel: { fontFamily: F.semi, fontSize: 9, letterSpacing: 1.2 },
  chipRow: { flexDirection: 'row', gap: 6, paddingVertical: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, flexWrap: 'wrap' },
  rowMain: { flex: 1, minWidth: 0 },
  symRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
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
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5 },
  name: { fontFamily: F.reg, fontSize: 10.5, marginTop: 2 },
  take: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 11, lineHeight: 15, marginTop: 3 },
  takeFull: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 11.5, lineHeight: 16 },
  rowRight: { alignItems: 'flex-end' },
  score: { fontFamily: F.semi, fontSize: 13.5 },
  meta: { fontFamily: F.reg, fontSize: 10.5, marginTop: 1 },
  metaLine: { gap: 3, marginTop: 8 },
  expand: { flexBasis: '100%', borderTopWidth: 1, marginTop: 8, paddingTop: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  cta: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  ctaText: { fontFamily: F.semi, fontSize: 12 },
  empty: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, paddingVertical: 8 },
});
