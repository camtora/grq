import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SubScreen, Card, Segmented, Footnote, Loading, ErrorNote } from '../../../components/Chrome';
import HuntRow, { type LiveQuoteMap } from '../../../components/hunt/HuntRow';
import HuntHero from '../../../components/hunt/HuntHero';
import HuntGridCard from '../../../components/hunt/HuntGridCard';
import ScannerTable from '../../../components/hunt/ScannerTable';
import { usePalette, F } from '../../../constants/theme';
import { HEAT_TIP } from '../../../lib/hunt';
import { api } from '../../../services/api';
import { useApi, useLiveQuotes } from '../../../services/hooks';
import type { HuntFeed, HuntStatus } from '../../../services/types';

const VIEW_KEY = 'grq_hunt_view';
type HuntView = 'board' | 'top' | 'scanner';

// Pending-hunt watcher (web HuntStatus parity): poll 20s, give up after 5 min,
// flash "fresh finds" for 6s when the newest dossier timestamp advances.
const POLL_MS = 20_000;
const GIVE_UP_MS = 5 * 60_000;

function relTime(iso: string): string {
  const d = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

/** The Hunt — Alfred's search for under-the-radar names (web /market parity):
 * heat-ranked leads in three layouts (Heat Board · Top Pick · Scanner) behind a
 * persisted switcher, steerable in plain English (D38). Leads, not verdicts. */
export default function HuntScreen() {
  const { p } = usePalette();
  const { data, error, loading, refreshing, refresh, reload } = useApi<HuntFeed>('/api/hunt');
  const [view, setView] = useState<HuntView>('board');
  const [brief, setBrief] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // One quote poll for every find (the web's LiveQuotesProvider).
  const finds = (data?.finds ?? []).filter((f) => !dismissed.has(f.sym));
  const live: LiveQuoteMap = useLiveQuotes(finds.map((f) => f.quoteSymbol ?? f.sym));

  // Restore the saved layout after mount (web persists this in localStorage).
  useEffect(() => {
    AsyncStorage.getItem(VIEW_KEY)
      .then((v) => {
        if (v === 'board' || v === 'top' || v === 'scanner') setView(v);
      })
      .catch(() => {});
  }, []);
  const pickView = (v: HuntView) => {
    setView(v);
    AsyncStorage.setItem(VIEW_KEY, v).catch(() => {});
  };

  /* ---- pending / fresh / gave-up (web HuntStatus) ---- */
  const [pending, setPending] = useState(false);
  const [flash, setFlash] = useState<'fresh' | 'gaveup' | null>(null);
  const anchor = useRef<{ latest: string | null; submittedAt: number } | null>(null);

  const startWatching = (latest: string | null) => {
    anchor.current = { latest, submittedAt: Date.now() };
    setFlash(null);
    setPending(true);
  };

  useEffect(() => {
    let alive = true;
    // A hunt queued elsewhere (web, the other phone) shows as pending here too.
    api<HuntStatus>('/api/hunt/status')
      .then((st) => {
        if (alive && st.requestedAt) startWatching(st.latestFindAt);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    let alive = true;
    const tick = async () => {
      const a = anchor.current;
      if (!a) return;
      if (Date.now() - a.submittedAt > GIVE_UP_MS) {
        if (alive) {
          setPending(false);
          setFlash('gaveup');
        }
        return;
      }
      try {
        const st = await api<HuntStatus>('/api/hunt/status');
        if (!alive) return;
        const landed = st.latestFindAt != null && (a.latest == null || st.latestFindAt > a.latest);
        if (landed) {
          setPending(false);
          setFlash('fresh');
          reload();
        }
      } catch {
        /* transient — next tick retries */
      }
    };
    const t = setInterval(tick, POLL_MS);
    // Coming back from another app is the moment fresh finds most likely landed.
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void tick();
    });
    return () => {
      alive = false;
      clearInterval(t);
      sub.remove();
    };
  }, [pending, reload]);

  useEffect(() => {
    if (flash !== 'fresh') return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  const submit = async () => {
    if (submitting || pending) return;
    setSubmitting(true);
    try {
      const st = await api<HuntStatus>('/api/hunt/status').catch(() => null);
      await api('/api/hunt/refresh', { method: 'POST', body: JSON.stringify({ brief: brief.trim() }) });
      setBrief('');
      startWatching(st?.latestFindAt ?? null);
    } catch (e) {
      Alert.alert('The Hunt', e instanceof Error ? e.message : 'Could not queue the hunt.');
    } finally {
      setSubmitting(false);
    }
  };

  const onDismissed = (sym: string) => setDismissed((prev) => new Set(prev).add(sym));

  return (
    <SubScreen title="The Hunt" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {data && (
        <View style={{ marginTop: 8, gap: 10 }}>
          <Text style={[s.intro, { color: p.textMuted }]}>
            Alfred&apos;s search for under-the-radar names — earlier-stage leads, ranked by heat. Proposals only:
            watch the ones you like, dismiss the ones you don&apos;t.
          </Text>

          {/* Brief bar — steer the hunt in plain English (D38); blank goes broad. */}
          <View style={s.briefRow}>
            <TextInput
              value={brief}
              onChangeText={setBrief}
              placeholder="Brief the hunt — e.g. 'emerging medical names about to post trial data'"
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
                <Text style={[s.huntBtnText, { color: p.accentText }]}>⚡ Hunt</Text>
              )}
            </Pressable>
          </View>
          <Text style={[s.briefCaption, { color: p.textMuted }]}>
            Alfred web-searches North America for names that fit your brief — results land in a minute or two;
            this page checks automatically. Leave it blank to go broad.
          </Text>

          {data.brief && (
            <Card style={{ borderColor: p.warn + '55', paddingVertical: 10 }}>
              <Text style={[s.bannerText, { color: p.textPrimary }]}>
                🎯 <Text style={{ fontFamily: F.semi }}>Directed hunt</Text> — “{data.brief}”
                <Text style={{ color: p.textMuted }}> · focused results below; a blank ⚡ Hunt goes broad again</Text>
              </Text>
            </Card>
          )}

          {pending && (
            <Card style={{ borderColor: p.accent + '40', paddingVertical: 10 }}>
              <View style={s.pendingRow}>
                <ActivityIndicator size="small" color={p.accentText} />
                <Text style={[s.bannerText, { color: p.textPrimary, flex: 1 }]}>
                  🔭 {data.brief ? `Hunting for “${data.brief}”` : 'Refreshing the hunt'} — new names land in a
                  minute or two.{' '}
                  {finds.length > 0 ? (
                    <Text style={{ color: p.textMuted }}>
                      The board below is the previous run
                      {anchor.current?.latest ? ` (${relTime(anchor.current.latest)})` : ''}; checking automatically.
                    </Text>
                  ) : (
                    <Text style={{ color: p.textMuted }}>The first names appear here automatically.</Text>
                  )}
                </Text>
              </View>
            </Card>
          )}
          {flash === 'fresh' && (
            <Card style={{ borderColor: p.pos + '55', paddingVertical: 10 }}>
              <Text style={[s.bannerText, { color: p.pos, fontFamily: F.semi }]}>✓ Fresh finds in.</Text>
            </Card>
          )}
          {flash === 'gaveup' && (
            <Card style={{ borderColor: p.warn + '55', paddingVertical: 10 }}>
              <Text style={[s.bannerText, { color: p.textPrimary }]}>
                The hunt didn&apos;t return new names — try a broader brief, or a blank ⚡ Hunt to go broad again.
              </Text>
            </Card>
          )}

          {/* Layout switcher (persisted) + the heat-sorted count line */}
          <Segmented
            options={[
              { key: 'board', label: '⚡ Heat Board' },
              { key: 'top', label: '★ Top Pick' },
              { key: 'scanner', label: '▤ Scanner' },
            ]}
            value={view}
            onChange={pickView}
          />
          {finds.length > 0 && (
            <Text style={[s.countLine, { color: p.textMuted }]}>
              <Text style={{ fontFamily: F.semi, color: p.textPrimary }}>{finds.length}</Text> hot{' '}
              {finds.length === 1 ? 'name' : 'names'} · sorted by{' '}
              <Text
                onPress={() => Alert.alert('Heat', HEAT_TIP)}
                style={{ fontFamily: F.semi, color: p.accentText, textDecorationLine: 'underline' }}
              >
                HEAT
              </Text>
            </Text>
          )}

          <View style={{ gap: 10, opacity: pending ? 0.55 : 1 }}>
            {view === 'board' &&
              finds.map((f, i) => (
                <HuntRow key={f.sym} f={f} rank={i + 1} live={live} onChanged={reload} onDismissed={onDismissed} />
              ))}

            {view === 'top' && finds.length > 0 && (
              <>
                <HuntHero f={finds[0]} live={live} onChanged={reload} onDismissed={onDismissed} />
                {finds.slice(1).map((f) => (
                  <HuntGridCard key={f.sym} f={f} live={live} onChanged={reload} />
                ))}
              </>
            )}

            {view === 'scanner' && finds.length > 0 && <ScannerTable finds={finds} live={live} />}
          </View>

          {!finds.length && !pending && (
            <Card>
              <Text style={[s.empty, { color: p.textMuted }]}>
                No finds on the board yet — brief the hunt above (or a blank ⚡ Hunt) and Alfred brings back 8–12
                under-the-radar names.
              </Text>
            </Card>
          )}

          <Footnote>
            Alfred can&apos;t add or trade these itself — nothing trades outside the guardrailed universe. Heat is a
            derived &ldquo;ready to pop&rdquo; read (conviction + recent momentum + obscurity), not a promise; a track
            record builds as the calls resolve. Watching a find is what tracks it.
          </Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
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
  briefCaption: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 14, marginTop: -4 },
  bannerText: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18 },
  pendingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  countLine: { fontFamily: F.reg, fontSize: 11.5 },
  empty: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18, paddingVertical: 6 },
});
