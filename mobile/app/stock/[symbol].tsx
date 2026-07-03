import React from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, SectionTitle, Footnote, Divider, Loading, ErrorNote } from '../../components/Chrome';
import StockLogo from '../../components/StockLogo';
import Sparkline from '../../components/Sparkline';
import MdText from '../../components/MdText';
import { usePalette, F, type Palette } from '../../constants/theme';
import { money, signedMoney, signedPctFromBps, pnlColor, fmtDate, fmtEps } from '../../lib/format';
import { useApi } from '../../services/hooks';
import type { Dossier } from '../../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

const AVATARS: Record<string, number> = {
  cam: require('../../assets/people/cam.png'),
  graham: require('../../assets/people/graham.png'),
};

function toneColor(tone: string | undefined, p: Palette): string {
  if (tone === 'emerald') return p.pos;
  if (tone === 'red') return p.neg;
  if (tone === 'amber') return p.warn;
  return p.accentText;
}

/** The stock page — fed by /api/dossier/[symbol] (full web parity, D60);
 * this screen renders the core read and grows section by section. */
export default function StockScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const sym = String(symbol ?? '').toUpperCase();
  const { data: d, error, loading, refreshing, refresh } = useApi<Dossier>(`/api/dossier/${sym}`);

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
            {/* Hero */}
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

            {d.researching && !d.rating && (
              <Card style={{ marginTop: 12 }}>
                <Text style={[s.mutedBody, { color: p.textMuted }]}>
                  Alfred is researching this name right now — the dossier lands here when it's done.
                  Pull to refresh.
                </Text>
              </Card>
            )}

            {/* Price chart */}
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

            {/* Alfred's call */}
            {d.rating && (
              <View>
                <SectionTitle sub="the verdict">Alfred's call</SectionTitle>
                <Card>
                  <View style={s.callRow}>
                    <Text style={[s.callLabel, { color: toneColor(d.rating.tone, p) }]}>{d.rating.label}</Text>
                    {d.target?.confidence != null && (
                      <Text style={[s.meta, tabular, { color: p.textMuted }]}>conf {d.target.confidence}%</Text>
                    )}
                  </View>
                  <Text style={[s.blurb, { color: p.textMuted }]}>{d.rating.blurb}</Text>
                  {(nearPct != null || farPct != null) && (
                    <Text style={[s.meta, tabular, { color: p.textMuted, marginTop: 8 }]}>
                      {nearPct != null
                        ? `near${d.target?.nearHorizon ? ` (${d.target.nearHorizon})` : ''} ${nearPct > 0 ? '+' : ''}${(nearPct * 100).toFixed(0)}%`
                        : ''}
                      {nearPct != null && farPct != null ? '   ·   ' : ''}
                      {farPct != null ? `12-mo ${farPct > 0 ? '+' : ''}${(farPct * 100).toFixed(0)}%` : ''}
                    </Text>
                  )}
                </Card>
              </View>
            )}

            {/* The bottom line */}
            {d.bottomLine && (
              <View>
                <SectionTitle sub="the plain-English why">The bottom line</SectionTitle>
                <Card>
                  <MdText body={d.bottomLine} />
                </Card>
              </View>
            )}

            {/* Held position + bracket */}
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

            {/* Signals */}
            {d.signals && (d.signals.trend || d.signals.rsi != null) && (
              <View>
                <SectionTitle sub="technicals">Signals</SectionTitle>
                <Card>
                  <Text style={[s.meta, tabular, { color: p.textMuted }]}>
                    {[
                      d.signals.trend ? `trend ${d.signals.trend}` : null,
                      d.signals.rsi != null ? `RSI ${d.signals.rsi}` : null,
                      d.signals.macd ? `MACD ${d.signals.macd}` : null,
                      d.signals.recommendationPct != null ? `signal ${d.signals.recommendationPct}%` : null,
                    ]
                      .filter(Boolean)
                      .join('   ·   ')}
                  </Text>
                </Card>
              </View>
            )}

            {/* Earnings + analysts */}
            {(d.earnings?.next || d.earnings?.last || d.grades) && (
              <View>
                <SectionTitle sub="reports & the street">Earnings & analysts</SectionTitle>
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
                  {d.grades && (
                    <Text style={[s.meta, tabular, { color: p.textMuted, marginTop: 4 }]}>
                      analysts {d.grades.consensus} · SB {d.grades.strongBuy} / B {d.grades.buy} / H {d.grades.hold} / S{' '}
                      {d.grades.sell + d.grades.strongSell}
                    </Text>
                  )}
                </Card>
              </View>
            )}

            {/* News */}
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

            {/* The full read */}
            {d.bodyMarkdown && (
              <View>
                <SectionTitle sub="Alfred's full dossier">The full read</SectionTitle>
                <Card>
                  <MdText body={d.bodyMarkdown} foldAt={600} />
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
  callLabel: { fontFamily: F.display, fontSize: 20 },
  blurb: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  meta: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  mutedBody: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  newsRow: { paddingVertical: 9 },
  newsTitle: { fontFamily: F.med, fontSize: 13, lineHeight: 18 },
});
