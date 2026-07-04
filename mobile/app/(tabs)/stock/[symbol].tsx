import React, { useEffect, useState } from 'react';
import { FlatList, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, SectionTitle, Footnote, Divider, Loading, ErrorNote } from '../../../components/Chrome';
import { api } from '../../../services/api';
import StockLogo from '../../../components/StockLogo';
import Sparkline from '../../../components/Sparkline';
import MdText from '../../../components/MdText';
import RatingBar, { toneColor } from '../../../components/RatingBar';
import ShareButton from '../../../components/ShareButton';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money, signedMoney, signedPctFromBps, pnlColor, fmtDate, fmtEps } from '../../../lib/format';
import { useApi, useLiveQuote } from '../../../services/hooks';
import { useAuth } from '../../../store/auth';
import type { Dossier } from '../../../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

const AVATARS: Record<string, number> = {
  cam: require('../../../assets/people/cam.png'),
  graham: require('../../../assets/people/graham.png'),
};

// Web PriceChart parity: 1D draws today's intraday line (fetched lazily,
// re-polled every 60s = the server cache TTL, so it's live during the session);
// the rest slice the 180d daily closes client-side.
const RANGE_DAYS = { '1D': 0, '1W': 7, '1M': 30, '3M': 91, '6M': 182 } as const;
type IntradayPoint = { t: number; c: number; session?: string };

// Tone for a 7-point label when the feed carries only the label (the technical lean).
function labelTone(label: string | null): string {
  if (!label) return 'teal';
  if (/strong buy|^buy/i.test(label)) return 'emerald';
  if (/weak buy/i.test(label)) return 'teal';
  if (/hold|weak sell/i.test(label)) return 'amber';
  return 'red';
}

/** The stock page — mirrors the web app/stocks/[symbol] section order, fed by
 * /api/dossier (D60 full web parity). Options/social/related panels are web-only
 * for now (not on the dossier wire). */
export default function StockScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const sym = String(symbol ?? '').toUpperCase();
  const { data: d, error, loading, refreshing, refresh } = useApi<Dossier>(`/api/dossier/${sym}`);
  const [queueing, setQueueing] = useState(false);
  const [queueMsg, setQueueMsg] = useState<string | null>(null);
  const [range, setRange] = useState<keyof typeof RANGE_DAYS>('1D');
  const [intraday, setIntraday] = useState<IntradayPoint[] | null>(null);

  // 1D: fetch the intraday line lazily and keep it live (60s poll while selected).
  useEffect(() => {
    if (range !== '1D') return;
    let alive = true;
    const pull = async () => {
      try {
        const r = await api<{ points: IntradayPoint[] }>(`/api/intraday?symbol=${encodeURIComponent(sym)}`);
        if (alive) setIntraday(r.points);
      } catch {
        if (alive) setIntraday((prev) => prev ?? []);
      }
    };
    pull();
    const t = setInterval(pull, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [range, sym]);

  // No verdict and no bottom line = no dossier yet (the feed's bodyMarkdown
  // fallback text doesn't count as a read).
  const hasDossier = !!(d?.rating || d?.bottomLine);

  // While Alfred researches, poll — an on-demand kick often lands in minutes.
  useEffect(() => {
    if (!d?.researching) return;
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [d?.researching, refresh]);

  const queueResearch = async () => {
    if (queueing) return;
    setQueueing(true);
    setQueueMsg(null);
    try {
      await api('/api/universe', { method: 'POST', body: JSON.stringify({ action: 'research', symbol: sym }) });
      refresh();
    } catch (e) {
      setQueueMsg(e instanceof Error ? e.message : 'Could not queue research.');
    } finally {
      setQueueing(false);
    }
  };

  // Live ticker (the web's <LiveQuote>): the hero price + day% update every 15s.
  const live = useLiveQuote(sym);
  const me = useAuth((st) => st.me);
  const myKey = me?.email?.includes('appleby') ? 'graham' : 'cam';
  const iWatch = (d?.watchers ?? []).some((w) => w.key === myKey);
  const [watchBusy, setWatchBusy] = useState(false);
  const toggleWatch = async () => {
    if (watchBusy || !d) return;
    setWatchBusy(true);
    try {
      await api('/api/universe', {
        method: 'POST',
        body: JSON.stringify(iWatch ? { action: 'unwatch', symbol: d.symbol } : { action: 'add', symbol: d.symbol, name: d.name, currency: d.currency }),
      });
      refresh();
    } catch {
      /* refresh shows truth */
    } finally {
      setWatchBusy(false);
    }
  };

  const closes = d?.closes ?? [];
  const closeBps =
    closes.length >= 2 && closes[closes.length - 2].c > 0
      ? Math.round(((closes[closes.length - 1].c - closes[closes.length - 2].c) / closes[closes.length - 2].c) * 10_000)
      : null;
  const dayBps = live?.changeBps ?? closeBps;
  const cur = live?.priceCents ?? d?.lastCents ?? (closes.length ? closes[closes.length - 1].c : null);
  const nearPct = cur && d?.target?.nearCents ? (d.target.nearCents - cur) / cur : null;
  const farPct = cur && d?.target?.farCents ? (d.target.farCents - cur) / cur : null;

  return (
    <SafeAreaView edges={['top']} style={[s.fill, { backgroundColor: p.bodyBg }]}>
      <View style={s.bar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={p.accentText} />
          <Text style={{ color: p.accentText, fontFamily: F.med, fontSize: 14 }}>back</Text>
        </Pressable>
        <Text style={[s.barTitle, { color: p.textPrimary }]}>{sym}</Text>
        <View style={[s.back, { justifyContent: 'flex-end', gap: 12 }]}>
          {/* Ask Alfred ABOUT this name — opens the chat aimed (signals + journal focus). */}
          <Pressable onPress={() => router.push(`/chat?symbol=${encodeURIComponent(sym)}`)} hitSlop={8}>
            <Image source={require('../../../assets/bull-splash.png')} style={s.askBull} resizeMode="contain" />
          </Pressable>
          <ShareButton symbol={sym} />
        </View>
      </View>
      <ScrollView contentContainerStyle={s.body}>
        {loading && <Loading />}
        {error && !loading && <ErrorNote message={error} />}
        {d && (
          <View>
            {/* ---- Hero ---- */}
            <View style={s.hero}>
              <StockLogo symbol={d.symbol} logoUrl={d.logoUrl} size={44} />
              <View style={s.heroMain}>
                <Text style={[s.heroName, { color: p.textPrimary }]} numberOfLines={2}>{d.name}</Text>
                {/* The listing venue, called out under the name on EVERY stock page (Cam
                    2026-07-04) — prebuilt server-side so the venue map lives in one place. */}
                {d.exchangeLine ? (
                  <Text style={[s.exchangeLine, { color: p.textMuted }]} numberOfLines={1}>{d.exchangeLine}</Text>
                ) : null}
                <View style={s.heroTags}>
                  {/* Who's watching, left under the name — the avatars ARE the toggle
                      (tap: the dashed + adds you, tapping while in removes you). The
                      old eye icon is gone (Cam 2026-07-04). */}
                  <Pressable
                    onPress={toggleWatch}
                    hitSlop={8}
                    disabled={watchBusy}
                    style={[s.watchRow, { opacity: watchBusy ? 0.5 : 1 }]}
                  >
                    {d.watchers.map((w, i) =>
                      AVATARS[w.key] ? (
                        <Image
                          key={w.key}
                          source={AVATARS[w.key]}
                          style={[s.watchAvatar, { borderColor: p.bodyBg }, i > 0 && s.watchOverlap]}
                        />
                      ) : null,
                    )}
                    {!iWatch && (
                      <View style={[s.watchAdd, { borderColor: p.textMuted + '88' }, d.watchers.length > 0 && s.watchAfter]}>
                        <Ionicons name="add" size={12} color={p.textMuted} />
                      </View>
                    )}
                    {!iWatch && d.watchers.length === 0 && (
                      <Text style={[s.tag, s.watchAfter, { color: p.textMuted }]}>watch</Text>
                    )}
                  </Pressable>
                  {d.status === 'ACTIVE' && <Text style={[s.tag, { color: p.pos }]}>in universe</Text>}
                  {d.researching && <Text style={[s.tag, { color: p.warn }]}>researching…</Text>}
                </View>
              </View>
              <View style={s.heroRight}>
                {cur != null && (
                  <Text style={[s.heroPrice, tabular, { color: p.textPrimary }]}>
                    {d.currency === 'USD' ? 'US' : ''}{money(cur)}
                  </Text>
                )}
                {dayBps != null && (
                  <Text style={[s.heroDay, tabular, { color: pnlColor(dayBps, p) }]}>
                    {signedPctFromBps(dayBps)}
                  </Text>
                )}
              </View>
            </View>

            {!hasDossier && (
              <Card style={{ marginTop: 12 }}>
                {d.researching ? (
                  <View>
                    <Text style={{ color: p.warn, fontFamily: F.bold, fontSize: 13 }}>
                      ALFRED IS ON IT
                    </Text>
                    <Text style={[s.mutedBody, { color: p.textMuted, marginTop: 4 }]}>
                      Research is in flight — the dossier (business, bull & bear case, a verdict)
                      lands here when it's done. This page checks every 30 seconds.
                    </Text>
                  </View>
                ) : (
                  <View>
                    <Text style={{ color: p.textPrimary, fontFamily: F.semi, fontSize: 13.5 }}>
                      No dossier yet
                    </Text>
                    <Text style={[s.mutedBody, { color: p.textMuted, marginTop: 4 }]}>
                      GRQ hasn't researched {sym} in depth. Queue it and Alfred writes the full
                      read — the business, the bull & bear case, targets, and a verdict.
                    </Text>
                    <Pressable
                      onPress={queueResearch}
                      disabled={queueing}
                      style={[s.researchBtn, { backgroundColor: p.accent + '26', opacity: queueing ? 0.6 : 1 }]}
                    >
                      <Text style={{ color: p.accentText, fontFamily: F.bold, fontSize: 13 }}>
                        {queueing ? 'Queueing…' : '🔬 Research this name'}
                      </Text>
                    </Pressable>
                    {queueMsg && (
                      <Text style={[s.mutedBody, { color: p.neg, marginTop: 6 }]}>{queueMsg}</Text>
                    )}
                  </View>
                )}
              </Card>
            )}

            {/* ---- Alfred's call: the verdict box + the bull/bear gauge (web hero) ---- */}
            {d.rating ? (
              <View>
                <SectionTitle sub="the verdict">Alfred's call</SectionTitle>
                <Card>
                  <View style={s.callRow}>
                    <Text style={[s.callLabel, { color: toneColor(d.rating.tone, p) }]}>{d.rating.label}</Text>
                    {d.target?.confidence != null && (
                      <Text style={[s.callConf, tabular, { color: p.textPrimary }]}>
                        {d.target.confidence}%
                        <Text style={[s.meta, { color: p.textMuted }]}> conf</Text>
                      </Text>
                    )}
                  </View>
                  <Text style={[s.blurb, { color: p.textMuted }]}>{d.rating.blurb}</Text>
                  <View style={{ marginTop: 12 }}>
                    <RatingBar label={d.rating.label} tone={d.rating.tone} pos={d.rating.pos} hideLabel mascots />
                  </View>
                  {(nearPct != null || farPct != null) && (
                    <Text style={[s.meta, tabular, { color: p.textMuted, marginTop: 12 }]}>
                      {nearPct != null
                        ? `near${d.target?.nearHorizon ? ` (${d.target.nearHorizon})` : ''} ${nearPct > 0 ? '+' : ''}${(nearPct * 100).toFixed(0)}% → ${money(d.target!.nearCents!)}`
                        : ''}
                      {nearPct != null && farPct != null ? '   ·   ' : ''}
                      {farPct != null ? `12-mo ${farPct > 0 ? '+' : ''}${(farPct * 100).toFixed(0)}% → ${money(d.target!.farCents!)}` : ''}
                    </Text>
                  )}
                </Card>
              </View>
            ) : d.recLabel && d.recPos != null ? (
              <View>
                <SectionTitle sub="technical signal only — an input, not a verdict">Signal</SectionTitle>
                <Card>
                  <RatingBar label={d.recLabel} tone={labelTone(d.recLabel)} pos={d.recPos} mascots />
                  <Text style={[s.mutedBody, { color: p.textMuted, marginTop: 10 }]}>
                    No Alfred call yet on this name.
                  </Text>
                </Card>
              </View>
            ) : null}

            {/* ---- The bottom line ---- */}
            {d.bottomLine && (
              <View>
                <SectionTitle sub="the plain-English why">The bottom line</SectionTitle>
                <Card>
                  <MdText body={d.bottomLine} />
                </Card>
              </View>
            )}

            {/* ---- What would change our mind (D93) ---- */}
            {((d.confidenceLevers ?? []).length > 0 || (d.structuralGaps ?? []).length > 0) && (
              <View>
                <SectionTitle sub="what's pinning confidence below 100">What would change our mind</SectionTitle>
                <Card style={s.listCard}>
                  {(d.confidenceLevers ?? []).map((l, i) => (
                    <View key={i}>
                      {i > 0 && <Divider />}
                      <View style={s.leverRow}>
                        <Text
                          style={[
                            s.leverDir,
                            { color: l.direction === 'up' ? p.pos : l.direction === 'down' ? p.neg : p.textMuted },
                          ]}
                        >
                          {l.direction === 'up' ? '▲' : l.direction === 'down' ? '▼' : '◆'}
                        </Text>
                        <View style={s.rowMainWide}>
                          <Text style={[s.leverGap, { color: p.textPrimary }]}>{l.gap}</Text>
                          <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 3 }]}>
                            {l.kind === 'catalyst' ? '⏱ ' : '🔎 '}{l.trigger} · {l.magnitude} move
                            {l.retrievable ? ' · retrievable now' : ''}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                  {(d.structuralGaps ?? []).map((g, i) => (
                    <View key={`g-${i}`}>
                      {((d.confidenceLevers ?? []).length > 0 || i > 0) && <Divider />}
                      <View style={s.leverRow}>
                        <Text style={[s.leverDir, { color: p.textMuted }]}>∅</Text>
                        <View style={s.rowMainWide}>
                          <Text style={[s.leverGap, { color: p.textMuted }]}>{g.name} is dark</Text>
                          <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 3 }]}>{g.detail}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* ---- Members' own money in this name (members-only; agents never see it, D97) ---- */}
            {(d.personalPositions ?? []).length > 0 && (
              <View>
                <SectionTitle sub="your own accounts — Alfred can't see this">Your money</SectionTitle>
                <Card style={s.listCard}>
                  {(d.personalPositions ?? []).map((pp, i) => (
                    <View key={i}>
                      {i > 0 && <Divider />}
                      <View style={s.personalRow}>
                        {pp.ownerKey && AVATARS[pp.ownerKey] ? (
                          <Image source={AVATARS[pp.ownerKey]} style={[s.personalAvatar, { borderColor: p.accent + '55' }]} />
                        ) : null}
                        <View style={s.rowMainWide}>
                          <Text style={[s.meta, tabular, { color: p.textPrimary }]}>
                            {pp.owner} · {pp.qty} sh{pp.avgCostCents != null ? ` @ ${money(pp.avgCostCents)}` : ''}
                          </Text>
                          <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 2 }]}>
                            {pp.institution}{pp.accountType ? ` ${pp.accountType}` : ''}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          {pp.marketValueCents != null && (
                            <Text style={[s.meta, tabular, { color: p.textPrimary }]}>{money(pp.marketValueCents)}</Text>
                          )}
                          {pp.openPnlCents != null && (
                            <Text style={[s.metaSmall, tabular, { color: pnlColor(pp.openPnlCents, p) }]}>
                              {signedMoney(pp.openPnlCents)}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* ---- The agent's note (why it's tracking this) ---- */}
            {d.agentNote && (
              <Card style={{ marginTop: 24 }}>
                <Text style={[s.metaSmall, { color: p.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: F.semi }]}>
                  The agent's note
                </Text>
                <Text style={[s.mutedBody, { color: p.textPrimary, marginTop: 4 }]}>{d.agentNote}</Text>
              </Card>
            )}

            {/* ---- Held position + the deterministic bracket ---- */}
            {d.position && (
              <View>
                <SectionTitle sub="what the fund holds">Position</SectionTitle>
                <Card>
                  <Text style={[s.meta, tabular, { color: p.textPrimary }]}>
                    {d.position.qty} sh @ {money(d.position.avgCostCents)} · {money(d.position.marketValueCents)}
                  </Text>
                  <Text style={[s.meta, tabular, { color: pnlColor(d.position.unrealizedPnlCents, p), marginTop: 4 }]}>
                    {signedMoney(d.position.unrealizedPnlCents)} unrealized
                  </Text>
                  <Text style={[s.meta, tabular, { color: p.textMuted, marginTop: 4 }]}>
                    stop {money(d.position.autoStopCents)} · take-profit {money(d.position.takeProfitCents)}
                  </Text>
                </Card>
              </View>
            )}

            {/* ---- Trades (the fund's own — below Position, Cam 2026-07-04) ---- */}
            {d.trades.length > 0 && (
              <View>
                <SectionTitle sub="the fund's fills">Trades</SectionTitle>
                <Card style={s.listCard}>
                  {d.trades.slice(0, 8).map((t, i) => (
                    <View key={t.id}>
                      {i > 0 && <Divider />}
                      <View style={s.tradeRow}>
                        <Text style={[s.sigSignal, { color: t.side === 'BUY' ? p.pos : p.neg, width: 40 }]}>{t.side}</Text>
                        <Text style={[s.meta, tabular, { color: p.textPrimary, flex: 1 }]}>
                          {t.qty} sh @ {money(t.priceCents)}
                        </Text>
                        {t.realizedPnlCents != null && (
                          <Text style={[s.metaSmall, tabular, { color: pnlColor(t.realizedPnlCents, p) }]}>
                            {signedMoney(t.realizedPnlCents)}
                          </Text>
                        )}
                        <Text style={[s.metaSmall, { color: p.textMuted }]}>{t.at.slice(0, 10)}</Text>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* ---- Price chart (web PriceChart parity: 1D intraday live + daily slices) ---- */}
            {closes.length >= 2 && (() => {
              const is1D = range === '1D';
              // 1D: the regular session leads; pre/post ride along if that's all there is.
              const intraPts = is1D
                ? (() => {
                    const pts = intraday ?? [];
                    const regular = pts.filter((x) => !x.session || x.session === 'regular');
                    return regular.length >= 2 ? regular : pts;
                  })()
                : [];
              const days = RANGE_DAYS[range];
              const cutoff = Date.now() - days * 86_400_000;
              const daily = closes.filter((x) => x.t >= cutoff);
              const shown = is1D ? intraPts : daily.length >= 2 ? daily : closes;
              const waiting = is1D && intraday === null;
              const rangeBps =
                shown.length >= 2 && shown[0].c > 0
                  ? Math.round(((shown[shown.length - 1].c - shown[0].c) / shown[0].c) * 10_000)
                  : null;
              const fmtLabel = (t: number) =>
                is1D
                  ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                  : new Date(t).toISOString().slice(0, 10);
              return (
                <View>
                  <SectionTitle sub="daily closes">Price</SectionTitle>
                  <Card>
                    <View style={s.rangeRow}>
                      {(Object.keys(RANGE_DAYS) as (keyof typeof RANGE_DAYS)[]).map((r) => (
                        <Pressable
                          key={r}
                          onPress={() => setRange(r)}
                          style={[s.rangeChip, range === r && { backgroundColor: p.accent + '26' }]}
                        >
                          <Text
                            style={{
                              color: range === r ? p.accentText : p.textMuted,
                              fontFamily: range === r ? F.semi : F.med,
                              fontSize: 11,
                            }}
                          >
                            {r}
                          </Text>
                        </Pressable>
                      ))}
                      {rangeBps != null && (
                        <Text style={[s.rangePct, tabular, { color: pnlColor(rangeBps, p) }]}>
                          {signedPctFromBps(rangeBps)}
                        </Text>
                      )}
                    </View>
                    {shown.length >= 2 ? (
                      <View>
                        <Sparkline values={shown.map((x) => x.c)} height={72} />
                        <View style={s.chartLabels}>
                          <Text style={[s.chartLabel, { color: p.textMuted }]}>{fmtLabel(shown[0].t)}</Text>
                          {is1D && (
                            <Text style={[s.chartLabel, { color: p.pos }]}>
                              ● live · refreshes every minute
                            </Text>
                          )}
                          <Text style={[s.chartLabel, { color: p.textMuted }]}>{fmtLabel(shown[shown.length - 1].t)}</Text>
                        </View>
                      </View>
                    ) : (
                      <Text style={[s.mutedBody, { color: p.textMuted, paddingVertical: 20, textAlign: 'center' }]}>
                        {waiting ? 'loading the session…' : 'no intraday trading yet — markets closed'}
                      </Text>
                    )}
                  </Card>
                </View>
              );
            })()}

            {/* ---- Analyst ratings (Tier 2) ---- */}
            {d.grades && (
              <View>
                <SectionTitle sub="the street's grades">Analyst ratings</SectionTitle>
                <Card>
                  <Text style={[s.meta, tabular, { color: p.textPrimary }]}>
                    {d.grades.consensus} consensus · {d.grades.total} analysts
                  </Text>
                  <Text style={[s.meta, tabular, { color: p.textMuted, marginTop: 4 }]}>
                    SB {d.grades.strongBuy} / B {d.grades.buy} / H {d.grades.hold} / S {d.grades.sell} / SS {d.grades.strongSell}
                  </Text>
                  {d.grades.trendMonths != null && (d.grades.buyDelta ?? 0) + (d.grades.sellDelta ?? 0) !== 0 && (
                    <Text style={[s.meta, tabular, { color: p.textMuted, marginTop: 4 }]}>
                      last {d.grades.trendMonths}mo: buys {(d.grades.buyDelta ?? 0) > 0 ? '+' : ''}{d.grades.buyDelta ?? 0} · sells{' '}
                      {(d.grades.sellDelta ?? 0) > 0 ? '+' : ''}{d.grades.sellDelta ?? 0}
                    </Text>
                  )}
                  {(d.grades.actions ?? []).slice(0, 4).map((a, i) => (
                    <View key={i}>
                      {i === 0 && <View style={{ height: 8 }} />}
                      <Text style={[s.metaSmall, { color: p.textMuted }]}>
                        {a.company} {a.action}{a.toGrade ? ` → ${a.toGrade}` : ''} · {a.date.slice(0, 10)}
                      </Text>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* ---- Price targets (Tier 2) ---- */}
            {d.analystBand && cur != null && (
              <View>
                <SectionTitle sub="the street's band">Price targets</SectionTitle>
                <Card>
                  <TargetBand band={d.analystBand} p={p} />
                </Card>
              </View>
            )}

            {/* ---- 13F institutions (Tier 5) ---- */}
            {d.institutional && (
              <View>
                <SectionTitle sub="13F filers · quarterly, ~45-day lag">Institutions</SectionTitle>
                <Card>
                  <Text style={[s.meta, tabular, { color: p.textPrimary }]}>
                    {d.institutional.investorsHolding.toLocaleString()} institutions hold it
                    {d.institutional.investorsHoldingChange !== 0
                      ? ` (${d.institutional.investorsHoldingChange > 0 ? '+' : ''}${d.institutional.investorsHoldingChange} QoQ)`
                      : ''}
                  </Text>
                  {d.institutional.holders.slice(0, 5).map((h, i) => (
                    <Text key={i} style={[s.metaSmall, tabular, { color: p.textMuted, marginTop: i === 0 ? 8 : 3 }]}>
                      {h.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} · {h.ownershipPct.toFixed(2)}%
                      {h.isNew ? '  NEW' : h.sharesChangePct ? `  ${h.sharesChangePct > 0 ? '+' : ''}${h.sharesChangePct.toFixed(1)}% shs` : ''}
                    </Text>
                  ))}
                  <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 6, opacity: 0.7 }]}>as of {d.institutional.date}</Text>
                </Card>
              </View>
            )}

            {/* ---- Technical signals ---- */}
            {d.signalFamilies.length > 0 && (
              <View>
                <SectionTitle sub="computed from price bars">Signals</SectionTitle>
                <Card style={s.listCard}>
                  {d.signalFamilies.map((f, i) => (
                    <View key={f.family}>
                      {i > 0 && <Divider />}
                      <View style={s.sigRow}>
                        <Text style={[s.sigFamily, { color: p.textPrimary }]}>{f.family}</Text>
                        <Text
                          style={[
                            s.sigSignal,
                            {
                              color:
                                f.signal === 'BUY' ? p.pos : f.signal === 'SELL' ? p.neg : p.warn,
                            },
                          ]}
                        >
                          {f.signal}
                        </Text>
                        <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>{f.confidence}%</Text>
                      </View>
                      <Text style={[s.metaSmall, { color: p.textMuted, paddingBottom: 8 }]}>{f.rationale}</Text>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* ---- Options positioning (Tier 3, D88) — a signal, NEVER traded ---- */}
            {d.options && (
              <View>
                <SectionTitle sub="dealer positioning · computed from CBOE, free">Options positioning</SectionTitle>
                <Card>
                  <Text style={[s.regime, { color: d.options.regime === 'negative' ? p.warn : p.pos }]}>
                    GEX {d.options.regime === 'negative' ? 'NEGATIVE — amplifies moves' : 'POSITIVE — dampens moves'}
                  </Text>
                  <Text style={[s.mutedBody, { color: p.textMuted, marginTop: 6 }]}>{d.options.line}</Text>
                  <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 8, opacity: 0.7 }]}>
                    as of {d.options.asOf} · the fund never trades options — this is an input Alfred weighs
                  </Text>
                </Card>
              </View>
            )}

            {/* ---- Social crowding (Tier 8, D89) — on probation ---- */}
            {d.social && (
              <View>
                <SectionTitle sub="Reddit + Stocktwits · a RISK signal, on probation">Social chatter</SectionTitle>
                <Card>
                  <Text style={[s.mutedBody, { color: p.textPrimary }]}>{d.social.line}</Text>
                  <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 8, opacity: 0.7 }]}>
                    as of {d.social.asOf} · noisy and gameable by design — it never gates a trade
                  </Text>
                </Card>
              </View>
            )}

            {/* ---- Earnings (Tier 6) ---- */}
            {(d.earnings?.next || d.earnings?.last) && (
              <View>
                <SectionTitle sub="reports">Earnings</SectionTitle>
                <Card>
                  {d.earnings?.next?.date && (
                    <Text style={[s.meta, { color: p.textMuted }]}>next report {fmtDate(d.earnings.next.date)}</Text>
                  )}
                  {d.earnings?.last && d.earnings.last.epsActual != null && (
                    <Text style={[s.meta, { color: p.textMuted, marginTop: 4 }]}>
                      last report{' '}
                      {d.earnings.last.epsEstimated != null
                        ? `${d.earnings.last.epsActual >= d.earnings.last.epsEstimated ? 'beat' : 'missed'} (EPS ${fmtEps(d.earnings.last.epsActual)} vs ${fmtEps(d.earnings.last.epsEstimated)} est)`
                        : `EPS ${fmtEps(d.earnings.last.epsActual)}`}{' '}
                      · {fmtDate(d.earnings.last.date)}
                    </Text>
                  )}
                </Card>
              </View>
            )}

            {/* ---- The full read (under Earnings — Cam 2026-07-04; only once a real dossier exists) ---- */}
            {hasDossier && d.bodyMarkdown && (
              <View>
                <SectionTitle sub="Alfred's full dossier">The full read</SectionTitle>
                <Card>
                  <MdText body={d.bodyMarkdown} foldAt={600} />
                </Card>
              </View>
            )}

            {/* ---- Valuation vs peers ---- */}
            {d.peers.length > 1 && (
              <View>
                <SectionTitle sub="P/E · P/B, trailing">Valuation vs peers</SectionTitle>
                <Card style={s.listCard}>
                  <View style={s.peerRow}>
                    <Text style={[s.peerHead, { color: p.textMuted, flex: 1 }]}> </Text>
                    <Text style={[s.peerHead, { color: p.textMuted, width: 64, textAlign: 'right' }]}>P/E</Text>
                    <Text style={[s.peerHead, { color: p.textMuted, width: 64, textAlign: 'right' }]}>P/B</Text>
                  </View>
                  {d.peers.map((peer) => (
                    <View key={peer.symbol}>
                      <Divider />
                      <View style={s.peerRow}>
                        <Text
                          onPress={peer.self ? undefined : () => router.push(`/stock/${peer.symbol}`)}
                          style={[
                            s.meta,
                            { flex: 1, color: peer.self ? p.accentText : p.textMuted, fontFamily: peer.self ? F.bold : F.reg },
                            !peer.self && { textDecorationLine: 'underline' },
                          ]}
                          numberOfLines={1}
                        >
                          {peer.symbol}{peer.self ? ' (this)' : ''}
                        </Text>
                        <Text style={[s.meta, tabular, { width: 64, textAlign: 'right', color: p.textPrimary }]}>
                          {peer.peTtm != null ? peer.peTtm.toFixed(1) : '—'}
                        </Text>
                        <Text style={[s.meta, tabular, { width: 64, textAlign: 'right', color: p.textPrimary }]}>
                          {peer.pbTtm != null ? peer.pbTtm.toFixed(1) : '—'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* ---- The value chain (Chess Moves) — swipeable stage cards, defaulting
                 to the stock's own stage (Cam 2026-07-03) ---- */}
            {(d.chess ?? []).slice(0, 1).map((board) => (
              <ValueChain key={board.themeId} board={board} selfSymbol={d.symbol} p={p} />
            ))}

            {/* ---- Related names (knowledge graph) ---- */}
            {(d.related ?? []).length > 0 && (
              <View>
                <SectionTitle sub="peers · co-held · co-mentioned">Related names</SectionTitle>
                <Card style={s.listCard}>
                  {(d.related ?? []).map((r, i) => (
                    <View key={r.ticker}>
                      {i > 0 && <Divider />}
                      <Pressable
                        onPress={() => router.push(`/stock/${r.symbol ?? r.ticker}`)}
                        style={s.relRow}
                      >
                        <StockLogo symbol={r.ticker} logoUrl={r.logoUrl} size={26} />
                        <View style={s.rowMainWide}>
                          <Text style={[s.sym2, { color: p.accentText }]}>
                            {r.ticker}
                            {r.name !== r.ticker ? (
                              <Text style={[s.metaSmall, { color: p.textMuted, fontFamily: F.reg }]}>  {r.name}</Text>
                            ) : null}
                          </Text>
                          <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 2 }]} numberOfLines={1}>{r.why}</Text>
                        </View>
                        {r.stance && (
                          <Text style={[s.metaSmall, { color: toneColor(labelTone(r.stance), p), fontFamily: F.semi }]}>
                            {r.stance}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* ---- Smart money ---- */}
            {d.smartMoney?.hasAny && (
              <View>
                <SectionTitle sub="13F funds · congress · insiders — leads, not trades">Smart money</SectionTitle>
                <Card>
                  <Text style={[s.meta, tabular, { color: p.textMuted }]}>
                    {[
                      d.smartMoney.congressBuyers > 0 ? `congress ${d.smartMoney.congressBuyers} buy${d.smartMoney.congressBuyers > 1 ? 's' : ''}` : null,
                      d.smartMoney.congressSellers > 0 ? `${d.smartMoney.congressSellers} sell${d.smartMoney.congressSellers > 1 ? 's' : ''}` : null,
                      d.smartMoney.insiderBuyers > 0
                        ? `insiders ${d.smartMoney.insiderBuyers} buy${d.smartMoney.insiderBuyers > 1 ? 's' : ''}${d.smartMoney.insiderBuyValueUsd ? ` (US$${Math.round(d.smartMoney.insiderBuyValueUsd / 1000)}k)` : ''}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'tracked-fund holdings below'}
                  </Text>
                  {d.smartMoney.fundHolders.slice(0, 4).map((h, i) => (
                    <Text key={i} style={[s.metaSmall, tabular, { color: p.textMuted, marginTop: i === 0 ? 8 : 3 }]}>
                      {h.name} ({h.firm}) · {(h.pctOfPort * 100).toFixed(1)}% of book{h.action ? ` · ${h.action}` : ''}
                    </Text>
                  ))}
                </Card>
              </View>
            )}

            {/* ---- News (below Smart money — Cam 2026-07-04) ---- */}
            {d.news.length > 0 && (
              <View>
                <SectionTitle sub="recent coverage">News</SectionTitle>
                <Card style={s.listCard}>
                  {d.news.map((n, i) => (
                    <View key={i}>
                      {i > 0 && <Divider />}
                      <Pressable onPress={() => n.url && Linking.openURL(n.url)} style={s.newsRow}>
                        <Text style={[s.newsTitle, { color: p.textPrimary }]}>{n.title}</Text>
                        <Text style={[s.chartLabel, { color: p.textMuted, marginTop: 2 }]}>
                          {n.publisher}{n.at ? ` · ${String(n.at).slice(0, 10)}` : ''}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* ---- Scoreboard — which sources earned their keep on this name ---- */}
            {(d.scoreboard ?? []).length > 0 && (
              <View>
                <SectionTitle sub="from retros — which sources earned their keep">Scoreboard</SectionTitle>
                <Card style={s.listCard}>
                  {(d.scoreboard ?? []).map((sb, i) => (
                    <View key={sb.source}>
                      {i > 0 && <Divider />}
                      <View style={s.personalRow}>
                        <Text style={[s.meta, { color: p.textPrimary, flex: 1 }]} numberOfLines={1}>{sb.source}</Text>
                        <Text style={[s.metaSmall, tabular, { color: p.textMuted }]}>
                          {sb.hits}✓ {sb.misses}✗ {sb.neutral}—
                          {sb.hitRate != null ? `  ·  ${Math.round(sb.hitRate * 100)}%` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* ---- The record — every journal entry on this name (approved layout:
                 collapsed spine, 3 rows default, tap to unfold; Cam 2026-07-03) ---- */}
            {(d.record ?? []).length > 0 && <TheRecord d={d} p={p} />}

            {/* ---- Data coverage (honest 10-tier map) ---- */}
            {d.coverage.length > 0 && (
              <View>
                <SectionTitle sub="what feeds this page — honest about the gaps">Data coverage</SectionTitle>
                <Card style={s.listCard}>
                  {d.coverage.map((c, i) => (
                    <View key={c.tier}>
                      {i > 0 && <Divider />}
                      <View style={s.covRow}>
                        <Text style={[s.metaSmall, tabular, { color: p.textMuted, width: 18 }]}>{c.tier}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.meta, { color: p.textPrimary }]}>{c.name}</Text>
                          <Text style={[s.metaSmall, { color: p.textMuted }]} numberOfLines={2}>{c.detail}</Text>
                        </View>
                        <Text
                          style={[
                            s.covStatus,
                            { color: c.status === 'live' ? p.pos : c.status === 'dark' ? p.textMuted : p.warn },
                          ]}
                        >
                          {c.status}
                        </Text>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            <Footnote>
              {[
                d.marketCapCents != null ? `cap ${money(d.marketCapCents).replace(/\.\d\d$/, '')}` : null,
                d.peRatio != null ? `P/E ${d.peRatio.toFixed(1)}` : null,
                `${d.currency} listing`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Footnote>
          </View>
        )}
        <Pressable onPress={refresh} style={{ paddingVertical: 16 }}>
          <Text style={{ color: p.accentText, fontFamily: F.med, fontSize: 12, textAlign: 'center' }}>
            {refreshing ? 'refreshing…' : '↻ refresh'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/** The value chain — one swipeable card per stage of a Chess Moves board,
 * starting on the stage this stock sits in. Every symbol links out. */
function ValueChain({ board, selfSymbol, p }: { board: NonNullable<Dossier['chess']>[number]; selfSymbol: string; p: Palette }) {
  const router = useRouter();
  const [cardW, setCardW] = useState(0);
  const [stageIdx, setStageIdx] = useState(board.selfStage);
  const bare = (sx: string) => sx.toUpperCase().replace(/\.(TO|V|NE|CN|US)$/i, '');
  return (
    <View>
      <SectionTitle sub={board.title}>The value chain</SectionTitle>
      <View onLayout={(e) => setCardW(e.nativeEvent.layout.width)}>
        {cardW > 0 && (
          <FlatList
            data={board.stages}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(st, i) => `${st.label}-${i}`}
            initialScrollIndex={Math.min(board.selfStage, board.stages.length - 1)}
            getItemLayout={(_, index) => ({ length: cardW, offset: cardW * index, index })}
            onMomentumScrollEnd={(e) => setStageIdx(Math.round(e.nativeEvent.contentOffset.x / cardW))}
            renderItem={({ item: st, index: i }) => (
              <View style={{ width: cardW }}>
                <Card style={s.stageCard}>
                  <View style={s.stageHead}>
                    <Text style={[s.stageLabel, { color: p.textPrimary }]}>{st.label}</Text>
                    <Text style={[s.metaSmall, { color: p.textMuted }]}>
                      stage {i + 1}/{board.stages.length}{st.role ? ` · ${st.role}` : ''}
                    </Text>
                  </View>
                  {st.items.map((it, j) => {
                    const isSelf = !!it.symbol && bare(it.symbol) === bare(selfSymbol);
                    return (
                      <View key={`${it.name}-${j}`}>
                        {j > 0 && <Divider />}
                        <Pressable
                          onPress={() => it.symbol && router.push(`/stock/${it.symbol}`)}
                          style={[s.stageItem, isSelf && { backgroundColor: p.accent + '14', borderRadius: 8 }]}
                        >
                          <Text style={[s.sym2, { color: it.symbol ? p.accentText : p.textPrimary }]}>
                            {it.symbol ?? it.name}
                            {isSelf ? <Text style={[s.metaSmall, { color: p.accentText }]}>  ← this one</Text> : null}
                          </Text>
                          {it.symbol && it.name !== it.symbol && (
                            <Text style={[s.metaSmall, { color: p.textMuted }]} numberOfLines={1}>{it.name}</Text>
                          )}
                          {it.note && (
                            <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 2 }]} numberOfLines={2}>{it.note}</Text>
                          )}
                        </Pressable>
                      </View>
                    );
                  })}
                </Card>
              </View>
            )}
          />
        )}
      </View>
      {/* stage dots */}
      <View style={s.dots}>
        {board.stages.map((_, i) => (
          <View
            key={i}
            style={[
              s.dotSm,
              { backgroundColor: i === stageIdx ? p.accent : p.textMuted + '44' },
            ]}
          />
        ))}
      </View>
      <Footnote>
        swipe across the chain · from the Chess Moves board "{board.title}" — research, not orders
      </Footnote>
    </View>
  );
}

/** The record — the journal spine: kind chip + date + the body's first line,
 * newest first, 3 shown, nothing auto-opens (dossier bodies are enormous).
 * The newest read is skipped — it's already "The full read" above. */
function TheRecord({ d, p }: { d: Dossier; p: Palette }) {
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  // Skip the entry already rendered as The full read.
  const entries = (d.record ?? []).filter((r) => r.body !== d.bodyMarkdown);
  if (!entries.length) return null;
  const shown = showAll ? entries : entries.slice(0, 3);

  const labelOf = (r: Dossier['record'][number]) => {
    const head = r.title.split('—')[0].trim();
    return (head.length > 2 && head.length < 26 ? head : r.kind).toUpperCase();
  };
  const toneOf = (r: Dossier['record'][number]) =>
    r.kind === 'DECISION' ? p.pos : r.kind === 'RESEARCH' ? p.accentText : p.textMuted;
  const firstLine = (body: string) =>
    body
      .split('\n')
      .map((l) => l.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/^[-•]\s*/, '').replace(/\[\[(.+?)\]\]/g, '$1').trim())
      .find((l) => l.length > 0) ?? '';

  return (
    <View>
      <SectionTitle sub={`${entries.length} entries — everything Alfred has filed on this name`}>
        The record
      </SectionTitle>
      <Card style={s.listCard}>
        {shown.map((r, i) => {
          const open = openId === r.id;
          return (
            <View key={r.id}>
              {i > 0 && <Divider />}
              <Pressable onPress={() => setOpenId(open ? null : r.id)} style={s.recordRow}>
                <View style={s.recordHead}>
                  <Text style={[s.recordKind, { color: toneOf(r) }]}>{labelOf(r)}</Text>
                  <Text style={[s.metaSmall, { color: p.textMuted }]}>{r.at.slice(0, 10)}</Text>
                  <Text style={[s.metaSmall, { color: p.accentText, marginLeft: 'auto' }]}>
                    {open ? 'close' : 'read →'}
                  </Text>
                </View>
                {!open && (
                  <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 3 }]} numberOfLines={1}>
                    {firstLine(r.body)}
                  </Text>
                )}
                {open && (
                  <View style={{ marginTop: 8 }}>
                    <MdText body={r.body} foldAt={100_000} />
                    {(r.sources ?? []).length > 0 && (
                      <View style={s.sourceChips}>
                        {r.sources.slice(0, 6).map((src, j) => (
                          <View key={j} style={[s.sourceChip, { borderColor: p.cardBorder }]}>
                            <Text style={[s.metaSmall, { color: p.textMuted }]} numberOfLines={1}>{src}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {r.agentVersion && (
                      <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 6, opacity: 0.6 }]}>
                        filed by {r.agentVersion}
                      </Text>
                    )}
                  </View>
                )}
              </Pressable>
            </View>
          );
        })}
        {entries.length > 3 && (
          <View>
            <Divider />
            <Pressable onPress={() => setShowAll(!showAll)} style={s.recordMore}>
              <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 12 }}>
                {showAll ? 'show fewer ↑' : `show all ${entries.length} entries ↓`}
              </Text>
            </Pressable>
          </View>
        )}
      </Card>
    </View>
  );
}

/** The analyst target band — low → consensus → high with "now" marked. */
function TargetBand({ band, p }: { band: NonNullable<Dossier['analystBand']>; p: Palette }) {
  const lo = Math.min(band.lowCents, band.nowCents);
  const hi = Math.max(band.highCents, band.nowCents);
  const span = hi - lo || 1;
  const x = (v: number) => Math.max(2, Math.min(98, ((v - lo) / span) * 100));
  return (
    <View>
      <Text style={[bs.line, { color: p.textPrimary }, tabular]}>
        consensus {money(band.consensusCents)}{' '}
        <Text style={{ color: band.upsidePct > 0 ? p.pos : p.neg }}>
          ({band.upsidePct > 0 ? '+' : ''}{(band.upsidePct * 100).toFixed(0)}%)
        </Text>
      </Text>
      <View style={[bs.track, { backgroundColor: p.cardHi }]}>
        <View style={[bs.range, { left: `${x(band.lowCents)}%`, width: `${x(band.highCents) - x(band.lowCents)}%`, backgroundColor: p.accent + '40' }]} />
        <View style={[bs.mark, { left: `${x(band.nowCents)}%`, backgroundColor: p.textPrimary }]} />
        <View style={[bs.mark, { left: `${x(band.consensusCents)}%`, backgroundColor: p.accent }]} />
      </View>
      <View style={bs.labels}>
        <Text style={[bs.label, { color: p.textMuted }, tabular]}>low {money(band.lowCents)}</Text>
        <Text style={[bs.label, { color: p.textMuted }, tabular]}>now {money(band.nowCents)}</Text>
        <Text style={[bs.label, { color: p.textMuted }, tabular]}>high {money(band.highCents)}</Text>
      </View>
      {band.reanchored && (
        <Text style={[bs.label, { color: p.textMuted, marginTop: 4, opacity: 0.7 }]}>
          re-anchored to this listing's currency
        </Text>
      )}
    </View>
  );
}

const bs = StyleSheet.create({
  line: { fontFamily: F.semi, fontSize: 14 },
  track: { height: 8, borderRadius: 4, marginTop: 10, overflow: 'visible' },
  range: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4 },
  mark: { position: 'absolute', top: -3, width: 3, height: 14, borderRadius: 1.5, marginLeft: -1.5 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  label: { fontFamily: F.reg, fontSize: 9.5 },
});

const s = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 12 },
  back: { flexDirection: 'row', alignItems: 'center', width: 70 },
  barTitle: { flex: 1, textAlign: 'center', fontFamily: 'System', fontWeight: '800', fontSize: 17 },
  askBull: { width: 24, height: 24 },
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  heroMain: { flex: 1, minWidth: 0 },
  heroName: { fontFamily: F.semi, fontSize: 16, lineHeight: 21 },
  exchangeLine: { fontFamily: F.med, fontSize: 10.5, marginTop: 1.5 },
  heroTags: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  heroRight: { alignItems: 'flex-end' },
  heroPrice: { fontFamily: 'System', fontWeight: '800', fontSize: 20 },
  heroDay: { fontFamily: F.semi, fontSize: 12, marginTop: 2 },
  tag: { fontFamily: F.semi, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  watchRow: { flexDirection: 'row', alignItems: 'center' },
  watchAvatar: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },
  watchOverlap: { marginLeft: -6 },
  watchAfter: { marginLeft: 4 },
  watchAdd: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  chartLabel: { fontFamily: F.reg, fontSize: 9.5 },
  callRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  callLabel: { fontFamily: F.black, fontSize: 26 },
  callConf: { fontFamily: F.black, fontSize: 18 },
  blurb: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  meta: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  metaSmall: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 15 },
  mutedBody: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  newsRow: { paddingVertical: 9 },
  newsTitle: { fontFamily: F.med, fontSize: 13, lineHeight: 18 },
  sigRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 9, paddingBottom: 3 },
  sigFamily: { fontFamily: F.semi, fontSize: 13, textTransform: 'capitalize', flex: 1 },
  sigSignal: { fontFamily: F.black, fontSize: 12 },
  peerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  peerHead: { fontFamily: F.semi, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  tradeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  covRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  covStatus: { fontFamily: F.bold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  researchBtn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginTop: 10 },
  rowMainWide: { flex: 1, minWidth: 0 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  rangeChip: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  rangePct: { fontFamily: F.semi, fontSize: 12, marginLeft: 'auto' },
  relRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  sym2: { fontFamily: F.semi, fontSize: 13.5 },
  stageCard: { marginRight: 0 },
  stageHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
  stageLabel: { fontFamily: 'System', fontWeight: '800', fontSize: 15 },
  stageItem: { paddingVertical: 8, paddingHorizontal: 6, marginHorizontal: -6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dotSm: { width: 6, height: 6, borderRadius: 3 },
  recordRow: { paddingVertical: 9 },
  recordHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  recordKind: { fontFamily: F.bold, fontSize: 10.5, letterSpacing: 0.5 },
  recordMore: { alignItems: 'center', paddingVertical: 10 },
  sourceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  sourceChip: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, maxWidth: 220 },
  leverRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9 },
  leverDir: { fontFamily: F.bold, fontSize: 12, width: 16, marginTop: 1 },
  leverGap: { fontFamily: F.med, fontSize: 12.5, lineHeight: 18 },
  personalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  personalAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 1 },
  regime: { fontFamily: F.black, fontSize: 13, letterSpacing: 0.3 },
});
