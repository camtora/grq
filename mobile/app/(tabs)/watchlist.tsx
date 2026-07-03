import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Divider, Segmented, Footnote, Loading, ErrorNote } from '../../components/Chrome';
import StockLogo from '../../components/StockLogo';
import { usePalette, F, type Palette } from '../../constants/theme';
import { money, signedPctFromBps, pctFromFrac, pnlColor, fmtDate, fmtEps } from '../../lib/format';
import { api } from '../../services/api';
import { useApi } from '../../services/hooks';
import { useAuth } from '../../store/auth';
import type { WatchlistResponse, WatchRow, StockExtras, SymbolMatch } from '../../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

function toneColor(tone: WatchRow['stanceTone'], p: Palette): string {
  if (tone === 'emerald') return p.pos;
  if (tone === 'red') return p.neg;
  if (tone === 'amber') return p.warn;
  return p.accentText;
}

const AVATARS: Record<string, number> = {
  cam: require('../../assets/people/cam.png'),
  graham: require('../../assets/people/graham.png'),
};

/** Watchlist — the names you're watching (web market/watchlist parity, D78).
 * Tabs filter to each member's own watches; a row expands for Alfred's
 * reasoning + the dossier's targets + lazy earnings/analyst extras. */
export default function WatchlistScreen() {
  const { p } = usePalette();
  const { data, error, loading, refreshing, refresh } = useApi<WatchlistResponse>('/api/watchlist');
  const me = useAuth((s) => s.me);
  const myKey = me?.email?.includes('appleby') ? 'graham' : 'cam';

  const [tab, setTab] = useState<'all' | 'cam' | 'graham'>('all');
  const tabInitialized = useRef(false);

  const rows = data?.rows ?? [];
  const counts = {
    all: rows.length,
    cam: rows.filter((r) => r.watchers.some((w) => w.key === 'cam')).length,
    graham: rows.filter((r) => r.watchers.some((w) => w.key === 'graham')).length,
  };

  // Open on the viewer's OWN watches by default (like the web), once data lands.
  useEffect(() => {
    if (!tabInitialized.current && data) {
      tabInitialized.current = true;
      if (counts[myKey as 'cam' | 'graham'] > 0) setTab(myKey as 'cam' | 'graham');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const visible = tab === 'all' ? rows : rows.filter((r) => r.watchers.some((w) => w.key === tab));

  return (
    <Screen title="Watchlist" refreshing={refreshing} onRefresh={refresh}>
      <AddTicker onAdded={refresh} />
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {data && (
        <View>
          <Segmented
            options={[
              { key: 'all', label: `All ${counts.all}` },
              { key: 'cam', label: `Cam ${counts.cam}` },
              { key: 'graham', label: `Graham ${counts.graham}` },
            ]}
            value={tab}
            onChange={setTab}
          />
          {visible.length === 0 ? (
            <Card style={{ marginTop: 12 }}>
              <Text style={[s.empty, { color: p.textMuted }]}>
                Nothing on this list yet — add a ticker above and GRQ starts researching it the
                moment you do.
              </Text>
            </Card>
          ) : (
            <Card style={[s.listCard, { marginTop: 12 }]}>
              {visible.map((r, i) => (
                <View key={r.symbol}>
                  {i > 0 && <Divider />}
                  <WatchRowView r={r} myKey={myKey} onChanged={refresh} />
                </View>
              ))}
            </Card>
          )}
          <Footnote>
            Alfred's call is the verdict · 12-mo is the target upside · tap a row for the reasoning;
            pinned names sort first
          </Footnote>
        </View>
      )}
    </Screen>
  );
}

/* ---------- add a ticker ---------- */

function AddTicker({ onAdded }: { onAdded: () => void }) {
  const { p } = usePalette();
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<SymbolMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const search = async () => {
    const query = q.trim();
    if (!query || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const d = await api<{ matches?: SymbolMatch[]; note?: string }>(
        `/api/symbol-search?q=${encodeURIComponent(query)}`,
      );
      setMatches(d.matches ?? []);
      if (d.note) setMsg(d.note);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  };

  const add = async (m: SymbolMatch) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      // Send the listing the user actually picked (exchange + currency), so the
      // server stores THAT listing — not a ".TO" guess (D24).
      await api('/api/universe', {
        method: 'POST',
        body: JSON.stringify({ action: 'add', symbol: m.symbol, exchange: m.exchange, currency: m.currency, name: m.name }),
      });
      setQ('');
      setMatches(null);
      setMsg(`${m.symbol} is on your watchlist — Alfred's dossiering it now.`);
      onAdded();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Add failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: 8, marginBottom: 12 }}>
      <View style={[s.addBar, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={search}
          placeholder="Add a ticker (AAPL, SHOP, WELL…)"
          placeholderTextColor={p.textMuted + '99'}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          style={[s.addInput, { color: p.textPrimary }]}
        />
        {busy ? (
          <ActivityIndicator color={p.accent} size="small" />
        ) : (
          <Text onPress={search} style={{ color: p.accentText, fontFamily: F.semi, fontSize: 13 }}>
            Search
          </Text>
        )}
      </View>
      {msg && <Text style={[s.addMsg, { color: p.textMuted }]}>{msg}</Text>}
      {matches && matches.length > 0 && (
        <Card style={[s.listCard, { marginTop: 8 }]}>
          {matches.slice(0, 6).map((m, i) => (
            <View key={`${m.symbol}-${i}`}>
              {i > 0 && <Divider />}
              <View style={s.row}>
                <View style={s.rowMain}>
                  <Text style={[s.sym, { color: p.accentText }]}>{m.symbol}</Text>
                  <Text style={[s.name, { color: p.textMuted }]} numberOfLines={1}>
                    {m.name}{m.exchange ? ` · ${m.exchange}` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => add(m)} style={[s.watchBtn, { borderColor: p.cardBorder }]}>
                  <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 12 }}>+ Watch</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

/* ---------- a watchlist row ---------- */

function WatchRowView({ r, myKey, onChanged }: { r: WatchRow; myKey: string; onChanged: () => void }) {
  const { p } = usePalette();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [extras, setExtras] = useState<StockExtras | null>(null);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const iWatch = r.watchers.some((w) => w.key === myKey);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && !extras && !extrasLoading) {
      setExtrasLoading(true);
      api<StockExtras>(`/api/stock-extras/${r.symbol}`)
        .then(setExtras)
        .catch(() => setExtras(null))
        .finally(() => setExtrasLoading(false));
    }
  };

  const toggleWatch = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api('/api/universe', {
        method: 'POST',
        body: JSON.stringify(
          iWatch
            ? { action: 'unwatch', symbol: r.symbol }
            : { action: 'add', symbol: r.symbol, exchange: r.exchange, currency: r.currency, name: r.name },
        ),
      });
      onChanged();
    } catch {
      /* refresh shows truth either way */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable onPress={toggleOpen}>
      <View style={s.row}>
        <StockLogo symbol={r.symbol} logoUrl={r.logoUrl} size={32} />
        <View style={s.rowMain}>
          <View style={s.symRow}>
            <Text style={[s.sym, { color: p.accentText }]}>{r.symbol}</Text>
            {r.pinnedBy && <Text style={s.flag}>📌</Text>}
            {r.status === 'ACTIVE' && (
              <Text style={[s.tag, { color: p.pos }]}>in universe</Text>
            )}
            {r.researchInFlight && <Text style={[s.tag, { color: p.warn }]}>researching…</Text>}
            {r.blocked && <Text style={[s.tag, { color: p.neg }]}>blocked</Text>}
          </View>
          <Text style={[s.name, { color: p.textMuted }]} numberOfLines={1}>{r.name}</Text>
          <View style={s.metaRow}>
            {r.stance && (
              <Text style={[s.call, { color: toneColor(r.stanceTone, p) }]}>{r.stance}</Text>
            )}
            {r.upsidePct != null && (
              <Text style={[s.meta, tabular, { color: p.textMuted }]}>
                12-mo{' '}
                <Text style={{ color: r.upsidePct > 0 ? p.pos : p.neg }}>
                  {r.upsidePct > 0 ? '+' : ''}{pctFromFrac(r.upsidePct)}
                </Text>
              </Text>
            )}
            {r.confidence != null && (
              <Text style={[s.meta, tabular, { color: p.textMuted }]}>conf {r.confidence}%</Text>
            )}
          </View>
        </View>
        <View style={s.rowRight}>
          {r.lastCents != null && (
            <Text style={[s.val, tabular, { color: p.textPrimary }]}>
              {r.currency === 'USD' ? 'US' : ''}{money(r.lastCents)}
            </Text>
          )}
          {r.dayBps != null && (
            <Text style={[s.subPct, tabular, { color: pnlColor(r.dayBps, p) }]}>
              {signedPctFromBps(r.dayBps)}
            </Text>
          )}
          <View style={s.avatars}>
            {r.watchers.map((w) =>
              AVATARS[w.key] ? (
                <Image
                  key={w.key}
                  source={AVATARS[w.key]}
                  style={[s.avatar, { borderColor: p.cardBg }]}
                />
              ) : null,
            )}
          </View>
        </View>
      </View>

      {open && (
        <View style={s.expand}>
          {r.stanceBlurb && (
            <Text style={[s.blurb, { color: p.textMuted }]}>
              Alfred: {r.stance} — {r.stanceBlurb}
            </Text>
          )}
          {r.bottomLine && (
            <Text style={[s.bottomLine, { color: p.textPrimary }]}>{r.bottomLine}</Text>
          )}
          {(r.nearPct != null || r.upsidePct != null) && (
            <Text style={[s.meta, tabular, { color: p.textMuted }]}>
              {r.nearPct != null
                ? `near${r.nearDays ? ` ~${Math.max(1, Math.round(r.nearDays / 5))}w` : ''} ${r.nearPct > 0 ? '+' : ''}${pctFromFrac(r.nearPct)}`
                : ''}
              {r.nearPct != null && r.upsidePct != null ? '  ·  ' : ''}
              {r.upsidePct != null ? `12-mo ${r.upsidePct > 0 ? '+' : ''}${pctFromFrac(r.upsidePct)}` : ''}
            </Text>
          )}
          {extrasLoading && <ActivityIndicator color={p.accent} size="small" style={{ marginTop: 8 }} />}
          {extras?.earnings?.next?.date && (
            <Text style={[s.meta, { color: p.textMuted }]}>
              next report {fmtDate(extras.earnings.next.date)}
            </Text>
          )}
          {extras?.earnings?.last && extras.earnings.last.epsActual != null && (
            <Text style={[s.meta, { color: p.textMuted }]}>
              last report{' '}
              {extras.earnings.last.epsEstimated != null
                ? `${extras.earnings.last.epsActual >= extras.earnings.last.epsEstimated ? 'beat' : 'missed'} (EPS ${fmtEps(extras.earnings.last.epsActual)} vs ${fmtEps(extras.earnings.last.epsEstimated)} est)`
                : `EPS ${fmtEps(extras.earnings.last.epsActual)}`}{' '}
              · {fmtDate(extras.earnings.last.date)}
            </Text>
          )}
          {extras?.grades && (
            <Text style={[s.meta, tabular, { color: p.textMuted }]}>
              analysts {extras.grades.consensus} · SB {extras.grades.strongBuy} / B {extras.grades.buy} / H {extras.grades.hold} / S{' '}
              {extras.grades.sell + extras.grades.strongSell}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Pressable
              onPress={toggleWatch}
              disabled={busy}
              style={[s.watchBtn, { borderColor: p.cardBorder, opacity: busy ? 0.5 : 1 }]}
            >
              <Text style={{ color: iWatch ? p.neg : p.accentText, fontFamily: F.semi, fontSize: 12 }}>
                {busy ? '…' : iWatch ? 'Unwatch' : '+ Watch too'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/stock/${r.symbol}`)}
              style={[s.watchBtn, { borderColor: p.cardBorder }]}
            >
              <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 12 }}>full dossier →</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowMain: { flex: 1, minWidth: 0 },
  rowRight: { alignItems: 'flex-end', gap: 1 },
  symRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sym: { fontFamily: F.semi, fontSize: 14 },
  flag: { fontSize: 10 },
  tag: { fontFamily: F.semi, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontFamily: F.reg, fontSize: 11, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 },
  call: { fontFamily: F.bold, fontSize: 11 },
  meta: { fontFamily: F.reg, fontSize: 11, marginTop: 2 },
  val: { fontFamily: F.semi, fontSize: 13.5 },
  subPct: { fontFamily: F.semi, fontSize: 11 },
  avatars: { flexDirection: 'row', marginTop: 3 },
  avatar: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, marginLeft: -6 },
  expand: { paddingLeft: 42, paddingBottom: 12, gap: 4 },
  blurb: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 12, lineHeight: 17 },
  bottomLine: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  empty: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18 },
  addBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    gap: 8,
  },
  addInput: { flex: 1, fontFamily: F.reg, fontSize: 13.5, paddingVertical: 10 },
  addMsg: { fontFamily: F.reg, fontSize: 11, marginTop: 6, paddingHorizontal: 2 },
  watchBtn: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 5 },
});
