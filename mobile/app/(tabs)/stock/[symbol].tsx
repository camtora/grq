import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, SectionTitle, Footnote, Divider, Loading, ErrorNote } from '../../../components/Chrome';
import { api } from '../../../services/api';
import StockLogo from '../../../components/StockLogo';
import Sparkline from '../../../components/Sparkline';
import MdText from '../../../components/MdText';
import RatingBar, { toneColor } from '../../../components/RatingBar';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { money, signedMoney, signedPctFromBps, pnlColor, fmtDate, fmtEps } from '../../../lib/format';
import { useApi } from '../../../services/hooks';
import type { Dossier } from '../../../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

const AVATARS: Record<string, number> = {
  cam: require('../../../assets/people/cam.png'),
  graham: require('../../../assets/people/graham.png'),
};

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

  const closes = d?.closes ?? [];
  const dayBps =
    closes.length >= 2 && closes[closes.length - 2].c > 0
      ? Math.round(((closes[closes.length - 1].c - closes[closes.length - 2].c) / closes[closes.length - 2].c) * 10_000)
      : null;
  const cur = d?.lastCents ?? (closes.length ? closes[closes.length - 1].c : null);
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
        <View style={s.back} />
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
                <View style={s.heroTags}>
                  {d.status === 'ACTIVE' && <Text style={[s.tag, { color: p.pos }]}>in universe</Text>}
                  {d.researching && <Text style={[s.tag, { color: p.warn }]}>researching…</Text>}
                  <View style={s.avatars}>
                    {d.watchers.map((w) =>
                      AVATARS[w.key] ? (
                        <Image key={w.key} source={AVATARS[w.key]} style={[s.avatar, { borderColor: p.bodyBg }]} />
                      ) : null,
                    )}
                  </View>
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

            {/* ---- Price chart ---- */}
            {closes.length >= 2 && (
              <View>
                <SectionTitle sub="daily closes">Price</SectionTitle>
                <Card>
                  <Sparkline values={closes.map((x) => x.c)} height={72} />
                  <View style={s.chartLabels}>
                    <Text style={[s.chartLabel, { color: p.textMuted }]}>
                      {new Date(closes[0].t).toISOString().slice(0, 10)}
                    </Text>
                    <Text style={[s.chartLabel, { color: p.textMuted }]}>
                      {new Date(closes[closes.length - 1].t).toISOString().slice(0, 10)}
                    </Text>
                  </View>
                </Card>
              </View>
            )}

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

            {/* ---- Trades (the fund's own) ---- */}
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

            {/* ---- News ---- */}
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

            {/* ---- The full read (only once a real dossier exists) ---- */}
            {hasDossier && d.bodyMarkdown && (
              <View>
                <SectionTitle sub="Alfred's full dossier">The full read</SectionTitle>
                <Card>
                  <MdText body={d.bodyMarkdown} foldAt={600} />
                </Card>
              </View>
            )}

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
  barTitle: { flex: 1, textAlign: 'center', fontFamily: F.display, fontSize: 17 },
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  heroMain: { flex: 1, minWidth: 0 },
  heroName: { fontFamily: F.semi, fontSize: 16, lineHeight: 21 },
  heroTags: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  heroRight: { alignItems: 'flex-end' },
  heroPrice: { fontFamily: F.display, fontSize: 20 },
  heroDay: { fontFamily: F.semi, fontSize: 12, marginTop: 2 },
  tag: { fontFamily: F.semi, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  avatars: { flexDirection: 'row', marginLeft: 2 },
  avatar: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, marginLeft: -5 },
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
});
