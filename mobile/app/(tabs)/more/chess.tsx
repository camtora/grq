import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, Footnote, Loading, ErrorNote, Bounded, Grid } from '../../../components/Chrome';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { useResponsive } from '../../../constants/layout';
import { api } from '../../../services/api';
import { useApi } from '../../../services/hooks';

/* ---------- wire (web /chess list parity; optional fields degrade pre-deploy) ---------- */

type ThemePlay = { symbol: string; direction: string };
type ChessTheme = {
  id: number;
  title: string;
  anchor: string;
  kind: string; // BRIEF | WEEKLY
  status: string; // READY | PENDING | RUNNING | FAILED
  bottomLine: string | null;
  brief?: string | null;
  requestedBy: string | null;
  createdAt: string;
  playCount: number;
  tickers: string[];
  plays?: ThemePlay[];
};
type ChessStatusWire = { pending: boolean; activeStatus: string | null; latestReadyAt: string | null };

const STATUS_LABEL: Record<string, string> = { READY: 'ready', PENDING: 'queued', RUNNING: 'mapping…', FAILED: 'no board' };

function statusColor(status: string, p: Palette): string {
  if (status === 'READY') return p.pos;
  if (status === 'PENDING' || status === 'RUNNING') return p.accentText;
  if (status === 'FAILED') return p.neg;
  return p.textMuted;
}

// First readable line of an agent markdown block — the one-line gist.
const firstLine = (s: string | null | undefined): string | null =>
  s ? ((s.split('\n').find((l) => l.trim()) ?? '').replace(/^[-*]\s*/, '').replace(/[*_`#>]/g, '').trim() || null) : null;

function when(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ', ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// The pending-board watcher (web ChessStatus): poll 15s, give up after 8 min.
const POLL_MS = 15_000;
const GIVE_UP_MS = 8 * 60_000;

/** Bounds to the reading column only on a wide (iPad) layout — phone unchanged. */
function BoundedIf({ wide, children }: { wide: boolean; children: React.ReactNode }) {
  return wide ? <Bounded>{children}</Bounded> : <>{children}</>;
}

/** Chess Moves (D94) — thematic / supply-chain second-order reasoning. A member
 * briefs an industry or chain; Alfred names the force in motion and traces who
 * wins vs who loses, 2–3 ripples deep. Leads, never verdicts. */
export default function ChessScreen() {
  const { p } = usePalette();
  const { isWide } = useResponsive();
  const router = useRouter();
  const { data: d, error, loading, refreshing, refresh, reload } = useApi<{ themes: ChessTheme[] }>('/api/chess');
  const [brief, setBrief] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(false);
  const [flash, setFlash] = useState<'fresh' | 'gaveup' | null>(null);
  const anchorRef = useRef<{ latest: string | null; submittedAt: number } | null>(null);

  const startWatching = (latest: string | null) => {
    anchorRef.current = { latest, submittedAt: Date.now() };
    setFlash(null);
    setPending(true);
  };

  useEffect(() => {
    let alive = true;
    // A board queued elsewhere (web, the other phone) shows as pending here too.
    api<ChessStatusWire>('/api/chess/status')
      .then((st) => {
        if (alive && st.pending) startWatching(st.latestReadyAt);
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
      const a = anchorRef.current;
      if (!a) return;
      if (Date.now() - a.submittedAt > GIVE_UP_MS) {
        if (alive) {
          setPending(false);
          setFlash('gaveup');
        }
        return;
      }
      try {
        const st = await api<ChessStatusWire>('/api/chess/status');
        if (!alive) return;
        const landed = !st.pending && st.latestReadyAt != null && (a.latest == null || st.latestReadyAt > a.latest);
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
    const b = brief.trim();
    if (submitting || pending) return;
    if (b.length < 3) {
      Alert.alert('Chess Moves', 'Name a theme or chain to map.');
      return;
    }
    setSubmitting(true);
    try {
      const st = await api<ChessStatusWire>('/api/chess/status').catch(() => null);
      const res = await api<{ queued: boolean; note?: string }>('/api/chess', {
        method: 'POST',
        body: JSON.stringify({ brief: b }),
      });
      if (!res.queued) {
        Alert.alert('Chess Moves', res.note ?? 'A board is already being mapped — give it a minute.');
      } else {
        setBrief('');
        startWatching(st?.latestReadyAt ?? null);
      }
    } catch (e) {
      Alert.alert('Chess Moves', e instanceof Error ? e.message : 'Could not queue the board.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SubScreen title="Chess Moves" wide={isWide} refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View style={{ marginTop: 8, gap: 10 }}>
          {/* Prose + controls span the full width (matching the boards grid below);
              on a phone this is just the reading column (docs/MOBILE-DESIGN.md §9). */}
          <View style={{ gap: 10 }}>
          <Text style={[s.intro, { color: p.textMuted }]}>
            Name an industry or a chain of companies. Alfred spots the force already in motion, then traces
            who wins and who loses two to three moves out — the second-order plays, before the market
            reprices them.
          </Text>

          {/* What is this — the 3-step explainer (web parity). */}
          <Card>
            {[
              { n: '1', t: 'Pick a board', x: 'A “board” is one industry or chain — e.g. “apparel & tariffs” or “the uranium squeeze.” Brief it in plain English, or Alfred picks a timely one each week.' },
              { n: '2', t: 'Alfred maps it', x: 'He names the force already in motion, draws the value chain, and tags every company a winner (▲) or loser (▼) by how many ripples out it sits.' },
              { n: '3', t: 'Follow the leads', x: 'Each name is a lead, not a buy — a hunch about who moves next. Open one to research it; only then can it ever clear the fund’s gate.' },
            ].map((step, i) => (
              <View key={step.n} style={[s.stepRow, i > 0 && { marginTop: 10 }]}>
                <View style={[s.stepNum, { backgroundColor: p.accent + '26' }]}>
                  <Text style={{ color: p.accentText, fontFamily: F.bold, fontSize: 11 }}>{step.n}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.stepTitle, { color: p.textPrimary }]}>{step.t}</Text>
                  <Text style={[s.stepBody, { color: p.textMuted }]}>{step.x}</Text>
                </View>
              </View>
            ))}
            <Text style={[s.stepFoot, { color: p.textMuted, borderTopColor: p.cardBorder }]}>
              <Text style={{ fontFamily: F.semi }}>The point:</Text> spot the second-order winners and losers
              before the market does. It&apos;s Alfred&apos;s reasoning, not a data feed — treat every play as a
              probabilistic bet, never a fact.
            </Text>
          </Card>

          {/* The brief bar (web ChessBar). */}
          <View style={s.briefRow}>
            <TextInput
              value={brief}
              onChangeText={setBrief}
              placeholder="Name a theme or chain — e.g. “uranium supply squeeze”"
              placeholderTextColor={p.textMuted}
              editable={!pending}
              returnKeyType="send"
              onSubmitEditing={submit}
              style={[s.briefInput, { backgroundColor: p.cardBg, borderColor: p.cardBorder, color: p.textPrimary }]}
            />
            <Pressable
              onPress={submit}
              disabled={submitting || pending}
              style={[s.mapBtn, { backgroundColor: p.accent + '26', opacity: submitting || pending ? 0.5 : 1 }]}
            >
              {submitting ? <ActivityIndicator size="small" color={p.accentText} /> : <Text style={[s.mapBtnText, { color: p.accentText }]}>♟ Map it</Text>}
            </Pressable>
          </View>
          <Text style={[s.briefCaption, { color: p.textMuted }]}>
            Alfred maps the value chain, names the force in motion, and traces the ripple-effect plays — the
            board lands in a minute or two; this page checks automatically.
          </Text>

          {pending && (
            <Card style={{ borderColor: p.accent + '40', paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator size="small" color={p.accentText} />
                <Text style={[s.bannerText, { color: p.textPrimary, flex: 1 }]}>
                  ♟ Mapping the board — Alfred is tracing the chain and the ripple plays. It lands here
                  automatically in a minute or two.
                </Text>
              </View>
            </Card>
          )}
          {flash === 'fresh' && (
            <Card style={{ borderColor: p.pos + '55', paddingVertical: 10 }}>
              <Text style={[s.bannerText, { color: p.pos, fontFamily: F.semi }]}>✓ The board is in.</Text>
            </Card>
          )}
          {flash === 'gaveup' && (
            <Card style={{ borderColor: p.warn + '55', paddingVertical: 10 }}>
              <Text style={[s.bannerText, { color: p.textPrimary }]}>
                Still working, or the board didn&apos;t come together — check back shortly.
              </Text>
            </Card>
          )}

          {/* The boards. */}
          {d.themes.length === 0 && (
            <Card>
              <Text style={[s.bannerText, { color: p.textMuted, paddingVertical: 6 }]}>
                No boards yet — name a theme or chain above and Alfred will map it.
              </Text>
            </Card>
          )}
          </View>

          {d.themes.length > 0 && (
            <Grid min={320} gap={10}>
          {d.themes.map((t) => {
            const ready = t.status === 'READY';
            const plays = t.plays ?? t.tickers.map((sym) => ({ symbol: sym, direction: 'NEUTRAL' }));
            const winners = plays.filter((x) => x.direction === 'BENEFICIARY').length;
            const losers = plays.filter((x) => x.direction === 'VICTIM').length;
            const take = firstLine(t.bottomLine);
            const dirColor = (dir: string) => (dir === 'BENEFICIARY' ? p.pos : dir === 'VICTIM' ? p.neg : p.textMuted);
            return (
              <Pressable key={t.id} onPress={ready ? () => router.push(`/more/chess-board/${t.id}`) : undefined}>
                <Card>
                  <View style={s.themeHead}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={s.titleRow}>
                        <Text style={[s.title, { color: p.textPrimary }]}>{t.title}</Text>
                        <Text style={[s.pill, { color: statusColor(t.status, p), borderColor: statusColor(t.status, p) + '55', backgroundColor: statusColor(t.status, p) + '1a' }]}>
                          {STATUS_LABEL[t.status] ?? t.status.toLowerCase()}
                        </Text>
                        {t.kind === 'WEEKLY' && (
                          <Text style={[s.pill, { color: p.textMuted, borderColor: p.cardBorder, backgroundColor: p.cardHi }]}>
                            board of the week
                          </Text>
                        )}
                      </View>
                      {!!t.anchor && (
                        <Text style={[s.anchor, { color: p.textMuted }]} numberOfLines={2}>
                          {t.anchor}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.meta, { color: p.textMuted }]}>{t.requestedBy ?? 'Alfred'}</Text>
                      <Text style={[s.meta, { color: p.textMuted }]}>{when(t.createdAt)}</Text>
                    </View>
                  </View>

                  {ready && take && <Text style={[s.take, { color: p.textMuted }]}>“{take}”</Text>}

                  {ready && t.playCount > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={[s.meta, { color: p.textMuted }]}>
                        {winners > 0 && <Text style={{ color: p.pos }}>▲ {winners} winner{winners > 1 ? 's' : ''} </Text>}
                        {losers > 0 && <Text style={{ color: p.neg }}>▼ {losers} loser{losers > 1 ? 's' : ''} </Text>}
                        · {t.playCount} ripple play{t.playCount > 1 ? 's' : ''}
                      </Text>
                      <View style={s.chipsWrap}>
                        {plays.slice(0, 10).map((x) => (
                          <Text
                            key={x.symbol}
                            style={[s.tickChip, { color: dirColor(x.direction), backgroundColor: dirColor(x.direction) + '1a' }]}
                          >
                            {x.direction === 'BENEFICIARY' ? '▲' : x.direction === 'VICTIM' ? '▼' : '·'} {x.symbol}
                          </Text>
                        ))}
                        {t.playCount > Math.min(10, plays.length) && (
                          <Text style={[s.meta, { color: p.textMuted }]}>+{t.playCount - Math.min(10, plays.length)} more</Text>
                        )}
                      </View>
                    </View>
                  )}

                  <View style={[s.themeFoot, { borderTopColor: p.cardBorder }]}>
                    <Text style={[s.meta, { color: p.textMuted, flex: 1 }]} numberOfLines={1}>
                      {t.brief ? (
                        <>
                          briefed: <Text style={{ fontStyle: 'italic' }}>“{t.brief}”</Text>
                        </>
                      ) : (
                        "Alfred's weekly self-pick"
                      )}
                    </Text>
                    {ready ? (
                      <Text style={[s.openCta, { color: p.accentText }]}>Open board →</Text>
                    ) : (
                      <Text style={[s.meta, { color: p.textMuted }]}>
                        {t.status === 'RUNNING' ? 'mapping the board…' : (STATUS_LABEL[t.status] ?? '')}
                      </Text>
                    )}
                  </View>
                </Card>
              </Pressable>
            );
          })}
            </Grid>
          )}

          <BoundedIf wide={isWide}>
          <Footnote>
            the chain is Alfred&apos;s web-researched reasoning, not imported data — there&apos;s no
            supply-chain feed · treat every play as a probabilistic ripple bet, never a fact · nothing here
            trades: a play becomes tradeable only after a full dossier clears the same guardrails as
            everything else
          </Footnote>
          </BoundedIf>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  stepRow: { flexDirection: 'row', gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepTitle: { fontFamily: F.semi, fontSize: 13 },
  stepBody: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  stepFoot: { fontFamily: F.reg, fontSize: 11, lineHeight: 16, marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
  briefRow: { flexDirection: 'row', gap: 8 },
  briefInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontFamily: F.reg, fontSize: 13 },
  mapBtn: { borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', minWidth: 84, alignItems: 'center' },
  mapBtnText: { fontFamily: F.semi, fontSize: 13 },
  briefCaption: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 14, marginTop: -4 },
  bannerText: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18 },
  themeHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  title: { fontFamily: F.semi, fontSize: 14.5 },
  anchor: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, marginTop: 3 },
  take: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 12, lineHeight: 17, marginTop: 8 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' },
  tickChip: { fontFamily: F.semi, fontSize: 10.5, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
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
  meta: { fontFamily: F.reg, fontSize: 10.5 },
  themeFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 8, borderTopWidth: 1 },
  openCta: { fontFamily: F.semi, fontSize: 12 },
});
