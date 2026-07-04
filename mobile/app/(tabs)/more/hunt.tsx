import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, Footnote, Loading, ErrorNote } from '../../../components/Chrome';
import StockLogo from '../../../components/StockLogo';
import Sparkline from '../../../components/Sparkline';
import ShareButton from '../../../components/ShareButton';
import MdText from '../../../components/MdText';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money, signedPctFromBps } from '../../../lib/format';
import { heatColor, obscurityLabel, previewText } from '../../../lib/hunt';
import { api } from '../../../services/api';
import { useApi } from '../../../services/hooks';
import type { HuntFeed, HuntFind, HuntStatus } from '../../../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

/** The Hunt — the heat board (web /market/hunt, Direction A): 8–12 under-the-radar
 * leads ranked by heat, steerable in plain English (D38). Leads, not verdicts —
 * no Buy/Hold/Sell on a find. */
export default function HuntScreen() {
  const { p } = usePalette();
  const { data, error, loading, refreshing, refresh, reload } = useApi<HuntFeed>('/api/hunt');
  const [brief, setBrief] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // A queued hunt runs on the agent for a few minutes. The poller anchors on
  // latestFindAt — huntRequestedAt clears at the run's START, so only the newest
  // find's timestamp advancing proves fresh names actually landed (web HuntStatus).
  const [pending, setPending] = useState(false);
  const anchor = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    // A hunt queued elsewhere (web, the other phone) shows as pending here too.
    api<HuntStatus>('/api/hunt/status')
      .then((st) => {
        if (!alive || !st.requestedAt) return;
        anchor.current = st.latestFindAt;
        setPending(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    let alive = true;
    const t = setInterval(async () => {
      try {
        const st = await api<HuntStatus>('/api/hunt/status');
        if (!alive) return;
        if (st.latestFindAt && st.latestFindAt !== anchor.current) {
          setPending(false);
          reload();
        }
      } catch {
        /* next tick retries */
      }
    }, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pending, reload]);

  const submit = async () => {
    if (submitting || pending) return;
    setSubmitting(true);
    try {
      const st = await api<HuntStatus>('/api/hunt/status').catch(() => null);
      anchor.current = st?.latestFindAt ?? null;
      await api('/api/hunt/refresh', { method: 'POST', body: JSON.stringify({ brief: brief.trim() }) });
      setPending(true);
    } catch (e) {
      Alert.alert('The Hunt', e instanceof Error ? e.message : 'Could not queue the hunt.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SubScreen title="The Hunt" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {data && (
        <View style={{ marginTop: 8, gap: 10 }}>
          {data.brief && (
            <Card style={{ borderColor: p.warn + '55', paddingVertical: 10 }}>
              <Text style={[s.bannerText, { color: p.textPrimary }]}>
                🎯 <Text style={{ fontFamily: F.semi }}>Directed hunt</Text> — “{data.brief}”
              </Text>
            </Card>
          )}

          {/* Steer the hunt in plain English (D38); a blank submit goes broad. */}
          <View style={s.briefRow}>
            <TextInput
              value={brief}
              onChangeText={setBrief}
              placeholder="steer the hunt — plain English, or blank for broad…"
              placeholderTextColor={p.textMuted}
              style={[s.briefInput, { backgroundColor: p.cardBg, borderColor: p.cardBorder, color: p.textPrimary }]}
              editable={!pending}
              returnKeyType="send"
              onSubmitEditing={submit}
            />
            <Pressable
              onPress={submit}
              disabled={submitting || pending}
              style={[s.huntBtn, { backgroundColor: p.accent + '26', opacity: submitting || pending ? 0.5 : 1 }]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={p.accentText} />
              ) : (
                <Text style={[s.huntBtnText, { color: p.accentText }]}>{brief.trim() ? '🎯 hunt' : '↻ hunt'}</Text>
              )}
            </Pressable>
          </View>

          {pending && (
            <Text style={[s.pendingNote, { color: p.warn }]}>
              Alfred is out hunting — fresh names land here in a few minutes. The board below is the previous run.
            </Text>
          )}

          <View style={{ gap: 10, opacity: pending ? 0.55 : 1 }}>
            {data.finds.map((f, i) => (
              <FindRow key={f.sym} f={f} rank={i + 1} p={p} onChanged={reload} />
            ))}
          </View>

          {!data.finds.length && (
            <Card>
              <Text style={[s.empty, { color: p.textMuted }]}>
                No finds on the board yet — kick a hunt above and Alfred brings back 8–12 under-the-radar names.
              </Text>
            </Card>
          )}

          <Footnote>
            leads, not verdicts — a find gets no Buy/Hold/Sell · heat = conviction + 30-day momentum + obscurity
            (“ready to pop”, not a rating) · watching a find is what tracks it
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

/* ---------- one find, as a heat-board row ---------- */

function FindRow({ f, rank, p, onChanged }: { f: HuntFind; rank: number; p: Palette; onChanged: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [watching, setWatching] = useState(f.watch !== 'none');
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const color = heatColor(f.heat);
  const obs = obscurityLabel(f.obscurity);
  const chg30Bps = f.change30d != null ? Math.round(f.change30d * 10_000) : null;

  const doWatch = async () => {
    if (busy || watching) return;
    setBusy(true);
    try {
      await api('/api/universe', { method: 'POST', body: JSON.stringify({ action: 'add', symbol: f.sym }) });
      setWatching(true);
    } catch (e) {
      Alert.alert('Watch', e instanceof Error ? e.message : 'Could not watch it.');
    } finally {
      setBusy(false);
    }
  };

  const doDismiss = () => {
    Alert.alert(`Dismiss ${f.sym}?`, "Marks it Retired so the hunt won't resurface it.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dismiss',
        style: 'destructive',
        onPress: async () => {
          try {
            await api('/api/universe', {
              method: 'POST',
              body: JSON.stringify({ action: 'dismiss', symbol: f.sym, name: f.name }),
            });
            setDismissed(true);
            onChanged();
          } catch (e) {
            Alert.alert('Dismiss', e instanceof Error ? e.message : 'Could not dismiss it.');
          }
        },
      },
    ]);
  };

  if (dismissed) return null;

  return (
    <Card style={s.findCard}>
      {/* heat-colored left rail — the board's signature */}
      <View style={[s.rail, { backgroundColor: color }]} />
      <Pressable onPress={() => setOpen(!open)} style={s.findBody}>
        <View style={s.headRow}>
          <Text style={[s.rank, tabular, { color }]}>{String(rank).padStart(2, '0')}</Text>
          <Pressable onPress={() => router.push(`/stock/${f.sym}`)} hitSlop={6} style={s.identity}>
            <StockLogo symbol={f.sym} logoUrl={f.logoUrl} size={32} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.symRow}>
                <Text style={[s.sym, { color: p.accentText }]}>{f.sym}</Text>
                {rank === 1 && (
                  <Text style={[s.hottest, { color: p.warn, borderColor: p.warn + '66', backgroundColor: p.warn + '26' }]}>
                    ▲ hottest
                  </Text>
                )}
              </View>
              <Text style={[s.name, { color: p.textMuted }]} numberOfLines={1}>
                {f.name !== f.sym ? f.name : f.tag ?? ''}
              </Text>
            </View>
          </Pressable>
          <View style={s.heatCol}>
            <Text style={[s.heatVal, tabular, { color }]}>{f.heat}</Text>
            <Text style={[s.microLabel, { color: p.textMuted }]}>HEAT</Text>
          </View>
        </View>

        {/* heat meter */}
        <View style={[s.heatTrack, { backgroundColor: p.cardHi }]}>
          <View style={[s.heatFill, { width: `${Math.max(4, f.heat)}%`, backgroundColor: color }]} />
        </View>

        <View style={s.metaRow}>
          {f.cur != null && (
            <Text style={[s.price, tabular, { color: p.textPrimary }]}>
              {f.currency === 'USD' ? 'US' : ''}
              {money(f.cur)}
            </Text>
          )}
          {chg30Bps != null && (
            <Text style={[s.chg, tabular, { color: chg30Bps >= 0 ? p.pos : p.neg }]}>
              {signedPctFromBps(chg30Bps, 0)} / 30d
            </Text>
          )}
          {f.tag && <Text style={[s.tag, { color: p.textMuted }]}>{f.tag}</Text>}
        </View>

        {!open && (
          <Text style={[s.preview, { color: p.textMuted }]} numberOfLines={3}>
            {previewText(f.bottomLine ?? f.body)}
          </Text>
        )}

        <View style={s.badgeRow}>
          {obs && (
            <Text style={[s.obsPill, { color: p.warn, borderColor: p.warn + '40', backgroundColor: p.warn + '14' }]}>
              {obs}
            </Text>
          )}
          {f.confidence != null && (
            <Text style={[s.metaText, tabular, { color: p.textMuted }]}>conviction {f.confidence}%</Text>
          )}
          <Text style={[s.metaText, { color: p.textMuted, marginLeft: 'auto' }]}>{open ? '▾ collapse' : '▸ open'}</Text>
        </View>

        {open && (
          <View style={[s.detail, { borderTopColor: p.cardBorder }]}>
            {f.spark.length >= 2 && (
              <View>
                <Sparkline values={f.spark} height={44} />
                <Text style={[s.microLabel, { color: p.textMuted, textAlign: 'center', marginTop: 2 }]}>30-DAY TREND</Text>
              </View>
            )}
            {(f.targetNearCents != null || f.targetFarCents != null) && (
              <View style={{ gap: 4 }}>
                {f.targetNearCents != null && (
                  <TargetLine
                    label={f.nearDays != null ? `near (~${f.nearDays} trading days)` : 'near target'}
                    cents={f.targetNearCents}
                    bps={f.nearBps}
                    currency={f.currency}
                    p={p}
                  />
                )}
                {f.targetFarCents != null && (
                  <TargetLine label="12-mo target" cents={f.targetFarCents} bps={f.farBps} currency={f.currency} p={p} />
                )}
              </View>
            )}
            <MdText body={f.body} />
            {f.sources.length > 0 && (
              <Text style={[s.metaText, { color: p.textMuted }]}>via {f.sources.slice(0, 3).join(', ')}</Text>
            )}
            <View style={s.actions}>
              <Pressable onPress={() => router.push(`/stock/${f.sym}`)} style={[s.cta, { backgroundColor: p.accent + '26' }]}>
                <Text style={[s.ctaText, { color: p.accentText }]}>full dossier →</Text>
              </Pressable>
              <Pressable onPress={doWatch} disabled={busy || watching} style={[s.cta, { backgroundColor: p.cardHi }]}>
                <Text style={[s.ctaText, { color: watching ? p.textMuted : p.accentText }]}>
                  {watching ? '👀 watched' : busy ? '…' : '＋ watch'}
                </Text>
              </Pressable>
              <ShareButton symbol={f.sym} />
              <Pressable onPress={doDismiss} hitSlop={6} style={{ marginLeft: 'auto' }}>
                <Text style={[s.dismiss, { color: p.textMuted }]}>✕ dismiss</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Pressable>
    </Card>
  );
}

function TargetLine({
  label,
  cents,
  bps,
  currency,
  p,
}: {
  label: string;
  cents: number;
  bps: number | null;
  currency: string | null;
  p: Palette;
}) {
  return (
    <View style={s.targetLine}>
      <Text style={[s.metaText, { color: p.textMuted }]}>{label}</Text>
      <Text style={[s.targetVal, tabular, { color: p.textPrimary }]}>
        {currency === 'USD' ? 'US' : ''}
        {money(cents)}
      </Text>
      {bps != null && (
        <Text style={[s.targetVal, tabular, { color: bps >= 0 ? p.pos : p.neg }]}>{signedPctFromBps(bps, 0)}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bannerText: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18 },
  briefRow: { flexDirection: 'row', gap: 8 },
  briefInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: F.reg,
    fontSize: 13,
  },
  huntBtn: { borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', minWidth: 76, alignItems: 'center' },
  huntBtnText: { fontFamily: F.semi, fontSize: 13 },
  pendingNote: { fontFamily: F.med, fontSize: 12, lineHeight: 17 },
  empty: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18, paddingVertical: 6 },

  findCard: { padding: 0, overflow: 'hidden', flexDirection: 'row' },
  rail: { width: 4, alignSelf: 'stretch' },
  findBody: { flex: 1, minWidth: 0, padding: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { fontFamily: F.bold, fontSize: 20, width: 30, textAlign: 'center' },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  symRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sym: { fontFamily: F.semi, fontSize: 15, textDecorationLine: 'underline' },
  hottest: {
    fontFamily: F.bold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  name: { fontFamily: F.reg, fontSize: 11, marginTop: 1 },
  heatCol: { alignItems: 'center', width: 40 },
  heatVal: { fontFamily: F.bold, fontSize: 18 },
  microLabel: { fontFamily: F.semi, fontSize: 8, letterSpacing: 1 },
  heatTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 8 },
  heatFill: { height: 4, borderRadius: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8 },
  price: { fontFamily: F.semi, fontSize: 14 },
  chg: { fontFamily: F.semi, fontSize: 11.5 },
  tag: { fontFamily: F.reg, fontSize: 10 },
  preview: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  obsPill: {
    fontFamily: F.semi,
    fontSize: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  metaText: { fontFamily: F.reg, fontSize: 11 },
  detail: { borderTopWidth: 1, marginTop: 10, paddingTop: 10, gap: 10 },
  targetLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  targetVal: { fontFamily: F.semi, fontSize: 12.5 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cta: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  ctaText: { fontFamily: F.semi, fontSize: 12 },
  dismiss: { fontFamily: F.semi, fontSize: 11 },
});
