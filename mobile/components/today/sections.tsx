import React from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePalette, F, type Palette } from '../../constants/theme';
import { Card, SectionTitle, Footnote, Divider, MiniLabel } from '../Chrome';
import StockLogo from '../StockLogo';
import { money, signedMoney, signedPctFromBps, pnlColor, relDay, fmtDate, fmtEps } from '../../lib/format';
import type { Today, Headline, EarningReported, Mover } from '../../services/types';

/* ---------- small shared bits ---------- */

const tabular = { fontVariant: ['tabular-nums' as const] };

function SentimentDot({ sentiment, p }: { sentiment: string | null; p: Palette }) {
  const c = sentiment === 'POS' ? p.pos : sentiment === 'NEG' ? p.neg : p.textMuted;
  return <View style={[s.dot, { backgroundColor: c }]} />;
}

const editionLabel: Record<Today['edition'], string> = {
  morning: 'Morning Edition',
  midday: 'Midday Edition',
  evening: 'Evening Edition',
  weekend: 'Weekend Edition',
};

/* ---------- masthead ---------- */

export function Masthead({ t }: { t: Today }) {
  const { p } = usePalette();
  const weekend = t.edition === 'weekend';
  return (
    <View style={[s.masthead, { borderBottomColor: p.accent + '4d' }]}>
      <Text style={[s.mastTitle, { color: p.textPrimary }]}>GRQ Daily</Text>
      <Text style={[s.mastKicker, { color: p.accentText }]}>
        {editionLabel[t.edition]}{t.dayLabel ? ` · ${t.dayLabel}` : ''}
      </Text>
      <View style={s.mastRow}>
        {t.marketOpen != null && (
          <View style={s.mastStatus}>
            <View style={[s.dot, { backgroundColor: t.marketOpen ? p.pos : p.textMuted }]} />
            <Text style={[s.mastStatusText, { color: t.marketOpen ? p.pos : p.textMuted }]}>
              {t.marketOpen ? 'Market open' : 'Market closed'}
            </Text>
          </View>
        )}
        <View style={s.mastPnl}>
          {weekend ? (
            <Text style={[s.mastPnlMain, { color: p.textMuted }]}>Flat · markets closed</Text>
          ) : (
            <Text style={[s.mastPnlMain, tabular, { color: pnlColor(t.dayPnlCents, p) }]}>
              {signedMoney(t.dayPnlCents)}
              <Text style={[s.mastPnlSub, { color: p.textMuted }]}>
                {'  '}({signedPctFromBps(t.dayPnlBps)} today)
              </Text>
            </Text>
          )}
        </View>
      </View>
      <Text style={[s.quote, { color: p.textMuted }]}>{t.quote}</Text>
      {t.funFact ? (
        <Text style={[s.funFact, { color: p.textMuted }]}>
          <Text style={{ fontFamily: F.bold, color: p.accentText }}>DID YOU KNOW?  </Text>
          {t.funFact}
        </Text>
      ) : null}
    </View>
  );
}

/* ---------- indices strip ---------- */

export function IndicesStrip({ t }: { t: Today }) {
  const { p } = usePalette();
  if (!t.indices?.length) return null;
  const chips = [
    { symbol: 'GRQ', name: 'The fund', priceCents: t.navCents, changeBps: t.dayPnlBps },
    ...t.indices,
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.stripWrap} contentContainerStyle={s.strip}>
      {chips.map((ix) => (
        <View key={ix.symbol} style={[s.chip, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>
          <Text style={[s.chipName, { color: p.textMuted }]} numberOfLines={1}>{ix.name}</Text>
          <Text style={[s.chipPrice, tabular, { color: p.textPrimary }]}>{money(ix.priceCents)}</Text>
          <Text style={[s.chipChange, tabular, { color: pnlColor(ix.changeBps, p) }]}>
            {signedPctFromBps(ix.changeBps)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

/* ---------- macro strip ---------- */

export function MacroStrip({ t }: { t: Today }) {
  const { p } = usePalette();
  if (!t.macroLine) return null;
  return (
    <View style={[s.macro, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>
      <Text style={[s.macroLabel, { color: p.textMuted }]}>MACRO</Text>
      <Text style={[s.macroText, { color: p.textPrimary }]}>{t.macroLine}</Text>
      {t.macroNote ? <Text style={[s.macroNote, { color: p.textMuted }]}>{t.macroNote}</Text> : null}
    </View>
  );
}

/* ---------- headlines (top 3 cards) ---------- */

function HeadlineCard({ n }: { n: Headline }) {
  const { p } = usePalette();
  return (
    <Pressable onPress={() => n.url && Linking.openURL(n.url)}>
      <Card style={s.headline}>
        {n.image ? (
          <Image source={{ uri: n.image }} style={s.headlineImg} resizeMode="cover" />
        ) : null}
        <View style={s.headlineBody}>
          <View style={s.headlineTitleRow}>
            <View style={{ marginTop: 6 }}>
              <SentimentDot sentiment={n.sentiment} p={p} />
            </View>
            <Text style={[s.headlineTitle, { color: p.textPrimary }]}>{n.title}</Text>
          </View>
          {n.summary ? (
            <Text style={[s.headlineSummary, { color: p.textMuted }]} numberOfLines={3}>
              {n.summary}
            </Text>
          ) : null}
          <Text style={[s.headlineMeta, { color: p.textMuted }]}>
            {n.publisher}{n.at ? ` · ${n.at.slice(0, 10)}` : ''}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

export function Headlines({ t }: { t: Today }) {
  const top = t.headlines?.slice(0, 3) ?? [];
  if (!top.length) return null;
  return (
    <View>
      <SectionTitle sub="what's moving the market today">Headlines</SectionTitle>
      <View style={{ gap: 10 }}>
        {top.map((n, i) => <HeadlineCard key={i} n={n} />)}
      </View>
    </View>
  );
}

/* ---------- the market today (Alfred's brief) ---------- */

export function MarketBriefSection({ t }: { t: Today }) {
  const { p } = usePalette();
  const b = t.marketBrief;
  if (!b) return null;
  const ed = b.edition === 'PM' ? 'evening read' : 'morning read';
  return (
    <View>
      <SectionTitle sub={`· ${ed}`}>The Market Today</SectionTitle>
      <Card>
        <Text style={[s.briefBody, { color: p.textPrimary }]}>{b.body}</Text>
        <Text style={[s.briefMeta, { color: p.textMuted }]}>
          Alfred's read of the whole market · {ed} · {b.date}
        </Text>
      </Card>
    </View>
  );
}

/* ---------- earnings ---------- */

function EarningBubble({ e }: { e: EarningReported }) {
  const { p } = usePalette();
  const beat =
    e.epsActual != null && e.epsEstimated != null
      ? e.epsActual >= e.epsEstimated
      : e.revenueActual != null && e.revenueEstimated != null
        ? e.revenueActual >= e.revenueEstimated
        : null;
  const epsPart = e.epsActual != null && e.epsEstimated != null ? ` (EPS ${fmtEps(e.epsActual)} vs ${fmtEps(e.epsEstimated)} est)` : '';
  const movePart = e.dayBps != null ? `; the stock is ${signedPctFromBps(e.dayBps)} on the print` : '';
  const read = beat == null
    ? 'Just reported — numbers and the market’s reaction are on the stock page.'
    : `${beat ? 'Beat' : 'Missed'} estimates${epsPart}${movePart}.`;
  return (
    <Card style={s.bubble}>
      <View style={s.row}>
        <StockLogo symbol={e.symbol} logoUrl={e.logoUrl} size={28} />
        <View style={s.rowMain}>
          <Text style={[s.sym, { color: p.accentText }]}>{e.symbol}</Text>
          <Text style={[s.name, { color: p.textMuted }]} numberOfLines={1}>{e.name}</Text>
        </View>
        <View style={s.rowRight}>
          {beat != null && (
            <Text style={[s.beatMiss, { color: beat ? p.pos : p.neg }]}>{beat ? 'beat ✓' : 'miss ✗'}</Text>
          )}
          {e.dayBps != null && (
            <Text style={[s.rowPct, tabular, { color: pnlColor(e.dayBps, p) }]}>{signedPctFromBps(e.dayBps)}</Text>
          )}
        </View>
      </View>
      <Text style={[s.bubbleRead, { color: p.textMuted }]}>{read}</Text>
      <View style={s.bubbleMeta}>
        <Text style={[s.metaText, { color: p.textMuted }]}>{fmtDate(e.date)}</Text>
        {e.stance ? (
          <View style={[s.stancePill, { backgroundColor: p.accent + '1a' }]}>
            <Text style={[s.stanceText, { color: p.accentText }]}>Alfred: {e.stance}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

export function EarningsSection({ t }: { t: Today }) {
  const { p } = usePalette();
  const reported = t.earningsReported ?? [];
  const upcoming = t.earningsUpcoming ?? [];
  const today = t.dateISO;
  if (!reported.length && !upcoming.length) return null;
  return (
    <View>
      <SectionTitle sub="who reported, who's next">Earnings</SectionTitle>
      {reported.length > 0 && (
        <View style={{ gap: 10 }}>
          <MiniLabel>Reported this week</MiniLabel>
          {reported.map((e) => <EarningBubble key={`${e.symbol}-${e.date}`} e={e} />)}
        </View>
      )}
      {upcoming.length > 0 && (
        <View style={{ marginTop: reported.length ? 14 : 0 }}>
          <MiniLabel>Upcoming reports</MiniLabel>
          <Card style={s.listCard}>
            {upcoming.map((e, i) => {
              const rel = relDay(e.date, today);
              const soon = rel === 'today' || rel === 'tomorrow';
              return (
                <View key={`${e.symbol}-${e.date}`}>
                  {i > 0 && <Divider />}
                  <View style={s.row}>
                    <StockLogo symbol={e.symbol} logoUrl={e.logoUrl} size={24} />
                    <Text style={[s.sym, { color: p.accentText }]}>{e.symbol}</Text>
                    <View style={s.rowRight}>
                      <Text style={[s.relDay, { color: soon ? p.warn : p.textMuted }]}>{rel}</Text>
                      <Text style={[s.metaText, { color: p.textMuted }]}>{fmtDate(e.date)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
        </View>
      )}
      <Footnote>earnings for names we track · beat/miss is actual vs the analyst EPS estimate</Footnote>
    </View>
  );
}

/* ---------- our market (hitters + tracked movers) ---------- */

function MoverRow({ m }: { m: Mover }) {
  const { p } = usePalette();
  return (
    <View style={s.row}>
      <StockLogo symbol={m.symbol} logoUrl={null} size={28} />
      <View style={s.rowMain}>
        <Text style={[s.sym, { color: p.accentText }]}>{m.symbol}</Text>
        <Text style={[s.name, { color: p.textMuted }]} numberOfLines={1}>{m.name}</Text>
      </View>
      <View style={s.rowRight}>
        <Text style={[s.rowPct, tabular, { color: pnlColor(m.dayChangeBps, p) }]}>
          {signedPctFromBps(m.dayChangeBps)}
        </Text>
        <Text style={[s.metaText, tabular, { color: p.textMuted }]}>
          {m.currency === 'USD' ? 'US' : ''}{money(m.lastCents)}
        </Text>
      </View>
    </View>
  );
}

export function OurMarket({ t }: { t: Today }) {
  const { p } = usePalette();
  const hitters = t.topHitters ?? [];
  const movers = (t.movers ?? []).slice(0, Math.max(hitters.length, 6));
  return (
    <View>
      <SectionTitle sub="your holdings & the names we track">Our market</SectionTitle>
      <MiniLabel>Top hitters</MiniLabel>
      <Card style={s.listCard}>
        {hitters.length ? (
          hitters.map((m, i) => (
            <View key={m.symbol}>
              {i > 0 && <Divider />}
              <MoverRow m={m} />
            </View>
          ))
        ) : (
          <Text style={[s.empty, { color: p.textMuted }]}>
            All cash — no hitters today. Alfred only buys when a thesis clears every guardrail.
            Patience is a position.
          </Text>
        )}
      </Card>
      <Footnote>the biggest moves in what the fund holds</Footnote>
      {movers.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <MiniLabel>Market movers</MiniLabel>
          <Card style={s.listCard}>
            {movers.map((m, i) => (
              <View key={m.symbol}>
                {i > 0 && <Divider />}
                <MoverRow m={m} />
              </View>
            ))}
          </Card>
          <Footnote>the biggest moves across the names we track</Footnote>
        </View>
      )}
    </View>
  );
}

/* ---------- the whole market (gainers + sectors) ---------- */

export function WholeMarket({ t }: { t: Today }) {
  const { p } = usePalette();
  const gainers = t.marketGainers ?? [];
  const sectors = t.sectors ?? [];
  if (!gainers.length && !sectors.length) return null;
  return (
    <View>
      <SectionTitle sub="movers & sectors">The whole market</SectionTitle>
      {gainers.length > 0 && (
        <View>
          <MiniLabel>Biggest movers</MiniLabel>
          <Card style={s.listCard}>
            {gainers.map((g, i) => (
              <View key={g.symbol}>
                {i > 0 && <Divider />}
                <View style={s.row}>
                  <View style={s.rowMain}>
                    <Text style={[s.sym, { color: p.accentText }]}>
                      {g.symbol}
                      {g.inUniverse ? <Text style={{ color: p.pos }}>  ✓</Text> : null}
                    </Text>
                    <Text style={[s.name, { color: p.textMuted }]} numberOfLines={1}>
                      {g.name} · {g.exchange}
                    </Text>
                  </View>
                  <View style={s.rowRight}>
                    <Text style={[s.rowPct, tabular, { color: p.pos }]}>{signedPctFromBps(g.changeBps, 0)}</Text>
                    <Text style={[s.metaText, tabular, { color: p.textMuted }]}>{money(g.priceCents)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </Card>
          <Footnote>biggest gainers across the whole market · ✓ = a name we track</Footnote>
        </View>
      )}
      {sectors.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <MiniLabel>By industry</MiniLabel>
          <Card style={s.listCard}>
            {sectors.map((sec, i) => (
              <View key={sec.name}>
                {i > 0 && <Divider />}
                <View style={s.row}>
                  <Text style={[s.sectorName, { color: p.textPrimary }]}>{sec.name}</Text>
                  <Text style={[s.metaText, { color: p.textMuted }]}> {sec.n} {sec.n === 1 ? 'name' : 'names'}</Text>
                  <View style={s.rowRight}>
                    <Text style={[s.rowPct, tabular, { color: pnlColor(sec.avgBps, p) }]}>
                      {signedPctFromBps(sec.avgBps)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </Card>
          <Footnote>average move today across the names we track, by sector</Footnote>
        </View>
      )}
    </View>
  );
}

/* ---------- market pulse (the rest of the headlines) ---------- */

export function Pulse({ t }: { t: Today }) {
  const { p } = usePalette();
  const rest = t.headlines?.slice(3, 12) ?? [];
  if (!rest.length) return null;
  return (
    <View>
      <SectionTitle sub="more headlines">Market pulse</SectionTitle>
      <Card style={s.listCard}>
        {rest.map((n, i) => (
          <View key={i}>
            {i > 0 && <Divider />}
            <Pressable onPress={() => n.url && Linking.openURL(n.url)} style={s.pulseRow}>
              <View style={{ marginTop: 5 }}>
                <SentimentDot sentiment={n.sentiment} p={p} />
              </View>
              <View style={s.rowMain}>
                <Text style={[s.pulseTitle, { color: p.textPrimary }]}>{n.title}</Text>
                <Text style={[s.metaText, { color: p.textMuted }]}>
                  {n.publisher}{n.at ? ` · ${n.at.slice(0, 10)}` : ''}
                </Text>
              </View>
            </Pressable>
          </View>
        ))}
      </Card>
      <Footnote>headlines captured & summarized by GRQ — context, not signals</Footnote>
    </View>
  );
}

/* ---------- styles ---------- */

const s = StyleSheet.create({
  // masthead
  masthead: { borderBottomWidth: 2, paddingBottom: 14, paddingTop: 8 },
  mastTitle: { fontFamily: F.display, fontSize: 30, textTransform: 'uppercase', letterSpacing: -0.5 },
  mastKicker: { fontFamily: F.semi, fontSize: 10, textTransform: 'uppercase', letterSpacing: 3, marginTop: 4 },
  mastRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  mastStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mastStatusText: { fontFamily: F.semi, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5 },
  mastPnl: { marginLeft: 'auto' },
  mastPnlMain: { fontFamily: F.displayMed, fontSize: 16 },
  mastPnlSub: { fontFamily: F.reg, fontSize: 12 },
  quote: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 13, lineHeight: 19, marginTop: 12 },
  funFact: { fontFamily: F.reg, fontSize: 11, lineHeight: 16, marginTop: 8 },
  // indices strip
  stripWrap: { marginTop: 14, marginHorizontal: -16 },
  strip: { paddingHorizontal: 16, gap: 8 },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: 96 },
  chipName: { fontFamily: F.med, fontSize: 10 },
  chipPrice: { fontFamily: F.semi, fontSize: 13, marginTop: 2 },
  chipChange: { fontFamily: F.semi, fontSize: 11, marginTop: 1 },
  // macro
  macro: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 12 },
  macroLabel: { fontFamily: F.bold, fontSize: 9, letterSpacing: 1.5 },
  macroText: { fontFamily: F.med, fontSize: 11, lineHeight: 16, marginTop: 3 },
  macroNote: { fontFamily: F.reg, fontSize: 9, marginTop: 4, opacity: 0.7 },
  // headlines
  headline: { padding: 0, overflow: 'hidden' },
  headlineImg: { width: '100%', height: 140 },
  headlineBody: { padding: 12 },
  headlineTitleRow: { flexDirection: 'row', gap: 6 },
  headlineTitle: { flex: 1, fontFamily: F.semi, fontSize: 14, lineHeight: 19 },
  headlineSummary: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, marginTop: 4 },
  headlineMeta: { fontFamily: F.reg, fontSize: 10, marginTop: 6 },
  // brief
  briefBody: { fontFamily: F.reg, fontSize: 13.5, lineHeight: 21 },
  briefMeta: { fontFamily: F.reg, fontSize: 9.5, marginTop: 10, opacity: 0.8 },
  // rows & lists
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowMain: { flex: 1, minWidth: 0 },
  rowRight: { alignItems: 'flex-end' },
  sym: { fontFamily: F.semi, fontSize: 14 },
  name: { fontFamily: F.reg, fontSize: 11, marginTop: 1 },
  rowPct: { fontFamily: F.semi, fontSize: 13 },
  metaText: { fontFamily: F.reg, fontSize: 10 },
  relDay: { fontFamily: F.semi, fontSize: 11 },
  sectorName: { fontFamily: F.semi, fontSize: 13 },
  empty: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18, paddingVertical: 10 },
  // earnings bubbles
  bubble: { padding: 12 },
  bubbleRead: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  beatMiss: { fontFamily: F.black, fontSize: 10 },
  stancePill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  stanceText: { fontFamily: F.semi, fontSize: 9.5 },
  // pulse
  pulseRow: { flexDirection: 'row', gap: 8, paddingVertical: 9 },
  pulseTitle: { fontFamily: F.med, fontSize: 13, lineHeight: 18 },
  // shared
  dot: { width: 6, height: 6, borderRadius: 3 },
});
