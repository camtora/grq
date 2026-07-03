import React, { useState } from 'react';
import {
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Loading, ErrorNote } from '../../components/Chrome';
import StockLogo from '../../components/StockLogo';
import Sparkline from '../../components/Sparkline';
import RatingBar from '../../components/RatingBar';
import ShareButton from '../../components/ShareButton';
import { usePalette, F, type Palette } from '../../constants/theme';
import { money, signedPctFromBps, pnlColor } from '../../lib/format';
import { useApi } from '../../services/hooks';
import type { WireItem } from '../../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

const AVATARS: Record<string, number> = {
  cam: require('../../assets/people/cam.png'),
  graham: require('../../assets/people/graham.png'),
  agent: require('../../assets/bull-splash.png'),
};

// The 7-point call, from the wire's snake_case AgentCall.
const CALL_META: Record<string, { label: string; tone: string; pos: number }> = {
  strong_buy: { label: 'Strong Buy', tone: 'emerald', pos: 1 },
  buy: { label: 'Buy', tone: 'emerald', pos: 0.82 },
  weak_buy: { label: 'Weak Buy', tone: 'teal', pos: 0.64 },
  hold: { label: 'Hold', tone: 'amber', pos: 0.5 },
  weak_sell: { label: 'Weak Sell', tone: 'amber', pos: 0.36 },
  sell: { label: 'Sell', tone: 'red', pos: 0.18 },
  strong_sell: { label: 'Strong Sell', tone: 'red', pos: 0 },
};

function obscurityLabel(o: number | null | undefined): string | null {
  if (o === 5) return '🔍 deep cut';
  if (o === 4) return 'under-the-radar';
  if (o === 3) return 'lesser-known';
  return null;
}

// The Hunt's heat ramp — hue teal-green (cool) → amber/orange (hot), same as web.
function heatColor(heat: number): string {
  const h = 175 - (Math.max(0, Math.min(100, heat)) / 100) * 150;
  return `hsl(${Math.round(h)}, 70%, 55%)`;
}

function shortDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The Wire — "the Hunt meets Instagram": one full-screen card per swipe,
 * weaving hunt finds, fresh dossiers, the watch board, market news, and
 * glossary lessons (docs/THE-WIRE.md). */
export default function WireScreen() {
  const { data, error, loading, refreshing, refresh } = useApi<{ items: WireItem[] }>('/api/wire');
  const { p } = usePalette();
  const [pageH, setPageH] = useState(0);

  return (
    <Screen title="The Wire" scroll={false}>
      <View style={{ flex: 1, marginHorizontal: -16 }} onLayout={(e) => setPageH(e.nativeEvent.layout.height)}>
        {loading && <Loading />}
        {error && !loading && (
          <View style={{ paddingHorizontal: 16 }}>
            <ErrorNote message={error} />
          </View>
        )}
        {data && pageH > 0 && (
          <FlatList
            data={data.items}
            keyExtractor={(it) => it.id}
            renderItem={({ item }) => (
              <View style={{ height: pageH }}>
                <WireCard item={item} />
              </View>
            )}
            pagingEnabled
            snapToInterval={pageH}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            getItemLayout={(_, index) => ({ length: pageH, offset: pageH * index, index })}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={p.accent} />}
          />
        )}
      </View>
    </Screen>
  );
}

/* ---------- one card ---------- */

function WireCard({ item }: { item: WireItem }) {
  const { p } = usePalette();
  return (
    <View style={s.page}>
      <Card style={s.card}>
        {item.kind === 'find' && <FindCard item={item} p={p} />}
        {item.kind === 'dossier' && <DossierCard item={item} p={p} />}
        {item.kind === 'watch' && <WatchCard item={item} p={p} />}
        {item.kind === 'article' && <ArticleCard item={item} p={p} />}
        {item.kind === 'lesson' && <LessonCard item={item} p={p} />}
      </Card>
    </View>
  );
}

function Rail({ kicker, color, right }: { kicker: string; color: string; right?: string | null }) {
  const { p } = usePalette();
  return (
    <View style={s.rail}>
      <Text style={[s.railText, { color }]}>{kicker}</Text>
      {right ? <Text style={[s.railRight, { color: p.textMuted }]}>{right}</Text> : null}
    </View>
  );
}

function Identity({ item, p, size = 44 }: { item: WireItem; p: Palette; size?: number }) {
  const router = useRouter();
  if (!item.symbol) return null;
  return (
    <Pressable onPress={() => router.push(`/stock/${item.symbol}`)} style={s.identity}>
      <StockLogo symbol={item.symbol} logoUrl={item.logoUrl} size={size} />
      <View style={s.identityMain}>
        <Text style={[s.identitySym, { color: p.accentText }]}>{item.symbol}</Text>
        {item.name && item.name !== item.symbol && (
          <Text style={[s.identityName, { color: p.textMuted }]} numberOfLines={1}>{item.name}</Text>
        )}
      </View>
      <View style={s.identityRight}>
        {item.lastCents != null && (
          <Text style={[s.identityPrice, tabular, { color: p.textPrimary }]}>
            {item.currency === 'USD' ? 'US' : ''}{money(item.lastCents)}
          </Text>
        )}
        {item.dayChangeBps != null && (
          <Text style={[s.identityDay, tabular, { color: pnlColor(item.dayChangeBps, p) }]}>
            {signedPctFromBps(item.dayChangeBps)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function Bullets({ bullets, p, limit = 4 }: { bullets: string[] | null | undefined; p: Palette; limit?: number }) {
  if (!bullets?.length) return null;
  return (
    <View style={{ gap: 6, marginTop: 12 }}>
      {bullets.slice(0, limit).map((b, i) => (
        <View key={i} style={s.bulletRow}>
          <Text style={[s.bulletMark, { color: p.accent }]}>•</Text>
          <Text style={[s.bulletText, { color: p.textPrimary }]} numberOfLines={3}>{b}</Text>
        </View>
      ))}
    </View>
  );
}

function Cta({ text, onPress, p, shareSymbol }: { text: string; onPress: () => void; p: Palette; shareSymbol?: string | null }) {
  return (
    <View style={s.ctaRow}>
      <Pressable onPress={onPress} style={[s.cta, { backgroundColor: p.accent + '26' }]}>
        <Text style={{ color: p.accentText, fontFamily: F.bold, fontSize: 13 }}>{text}</Text>
      </Pressable>
      {shareSymbol ? (
        <View style={[s.ctaShare, { backgroundColor: p.accent + '14' }]}>
          <ShareButton symbol={shareSymbol} />
        </View>
      ) : null}
    </View>
  );
}

function TargetRow({ label, cents, bps, horizon, p }: { label: string; cents: number; bps?: number | null; horizon?: string | null; p: Palette }) {
  return (
    <View style={s.targetRow}>
      <Text style={[s.targetLabel, { color: p.textMuted }]}>{label}{horizon ? ` (${horizon})` : ''}</Text>
      <Text style={[s.targetVal, tabular, { color: p.textPrimary }]}>
        {money(cents)}
        {bps != null && (
          <Text style={{ color: bps > 0 ? p.pos : p.neg }}>  {signedPctFromBps(bps, 0)}</Text>
        )}
      </Text>
    </View>
  );
}

/* ---------- find: a hunt lead ---------- */

function FindCard({ item, p }: { item: WireItem; p: Palette }) {
  const router = useRouter();
  return (
    <View style={s.cardBody}>
      <Rail kicker="🔭 The Hunt · fresh find" color={p.warn} right={obscurityLabel(item.obscurity) ?? item.tag} />
      <Identity item={item} p={p} />
      {item.farBps != null && (
        <View style={s.heroStat}>
          <Text style={[s.heroStatValue, tabular, { color: item.farBps > 0 ? p.pos : p.neg }]}>
            {signedPctFromBps(item.farBps, 0)}
          </Text>
          <Text style={[s.heroStatLabel, { color: p.textMuted }]}>12-MO UPSIDE IF THE THESIS LANDS</Text>
        </View>
      )}
      {item.spark && item.spark.length >= 2 && <Sparkline values={item.spark} height={44} />}
      <View style={{ marginTop: 10, gap: 6 }}>
        {item.targetNearCents != null && (
          <TargetRow label="near" cents={item.targetNearCents} bps={item.nearBps} horizon={item.nearHorizon} p={p} />
        )}
        {item.targetFarCents != null && (
          <TargetRow label="12-mo" cents={item.targetFarCents} bps={item.farBps} p={p} />
        )}
      </View>
      {item.heat != null && (
        <View style={s.heatRow}>
          <Text style={[s.heatLabel, { color: p.textMuted }]}>HEAT</Text>
          <View style={[s.heatTrack, { backgroundColor: p.cardHi }]}>
            <View style={[s.heatFill, { width: `${Math.max(4, item.heat)}%`, backgroundColor: heatColor(item.heat) }]} />
          </View>
          <Text style={[s.heatVal, tabular, { color: heatColor(item.heat) }]}>{item.heat}</Text>
        </View>
      )}
      <Bullets bullets={item.bullets} p={p} />
      {item.confidence != null && (
        <Text style={[s.metaLine, tabular, { color: p.textMuted }]}>conviction {item.confidence}%{item.sources?.length ? ` · via ${item.sources.slice(0, 2).join(', ')}` : ''}</Text>
      )}
      <View style={s.spacer} />
      <Cta text="Read the full dossier →" onPress={() => router.push(`/stock/${item.symbol}`)} p={p} shareSymbol={item.symbol} />
      <Text style={[s.dateLine, { color: p.textMuted }]}>a lead, not a verdict · {shortDate(item.at)}</Text>
    </View>
  );
}

/* ---------- dossier: fresh research ---------- */

function DossierCard({ item, p }: { item: WireItem; p: Palette }) {
  const router = useRouter();
  const call = item.call ? CALL_META[item.call] : null;
  return (
    <View style={s.cardBody}>
      <Rail kicker="🗂 Fresh dossier" color={p.accentText} right={item.tag} />
      <Identity item={item} p={p} />
      {call && (
        <View style={{ marginTop: 14 }}>
          <RatingBar label={call.label} tone={call.tone} pos={call.pos} note="Alfred's call" mascots />
        </View>
      )}
      <View style={{ marginTop: 12, gap: 6 }}>
        {item.targetNearCents != null && (
          <TargetRow label="near" cents={item.targetNearCents} bps={item.nearBps} horizon={item.nearHorizon} p={p} />
        )}
        {item.targetFarCents != null && (
          <TargetRow label="12-mo" cents={item.targetFarCents} bps={item.farBps} p={p} />
        )}
      </View>
      {item.signals && (
        <Text style={[s.metaLine, tabular, { color: p.textMuted }]}>
          {[
            item.signals.trend ? `trend ${item.signals.trend}` : null,
            item.signals.rsi != null ? `RSI ${item.signals.rsi}` : null,
            item.signals.macd ? `MACD ${item.signals.macd}` : null,
          ].filter(Boolean).join(' · ')}
        </Text>
      )}
      <Bullets bullets={item.bullets} p={p} />
      {item.confidence != null && (
        <Text style={[s.metaLine, tabular, { color: p.textMuted }]}>confidence {item.confidence}%</Text>
      )}
      <View style={s.spacer} />
      <Cta text="Open the dossier →" onPress={() => router.push(`/stock/${item.symbol}`)} p={p} shareSymbol={item.symbol} />
      <Text style={[s.dateLine, { color: p.textMuted }]}>researched {shortDate(item.at)}</Text>
    </View>
  );
}

/* ---------- watch: someone put it on the board ---------- */

function WatchCard({ item, p }: { item: WireItem; p: Palette }) {
  const router = useRouter();
  const call = item.call ? CALL_META[item.call] : null;
  const avatar = item.watcherKey ? AVATARS[item.watcherKey] : null;
  return (
    <View style={s.cardBody}>
      <View style={s.watchHead}>
        {avatar && <Image source={avatar} style={[s.watchAvatar, { borderColor: p.accent + '73' }]} />}
        <Text style={[s.railText, { color: p.accentText }]}>
          👀 {item.watcher ?? 'Someone'} is watching
        </Text>
      </View>
      <Identity item={item} p={p} />
      {call && (
        <View style={{ marginTop: 14 }}>
          <RatingBar label={call.label} tone={call.tone} pos={call.pos} note="Alfred's call" />
        </View>
      )}
      <View style={{ marginTop: 12, gap: 6 }}>
        {item.targetNearCents != null && (
          <TargetRow label="near" cents={item.targetNearCents} bps={item.nearBps} horizon={item.nearHorizon} p={p} />
        )}
        {item.targetFarCents != null && (
          <TargetRow label="12-mo" cents={item.targetFarCents} bps={item.farBps} p={p} />
        )}
      </View>
      <Bullets bullets={item.bullets} p={p} />
      <View style={s.spacer} />
      <Cta text="See why →" onPress={() => router.push(`/stock/${item.symbol}`)} p={p} shareSymbol={item.symbol} />
      <Text style={[s.dateLine, { color: p.textMuted }]}>watched since {shortDate(item.at)}</Text>
    </View>
  );
}

/* ---------- article: market news ---------- */

function ArticleCard({ item, p }: { item: WireItem; p: Palette }) {
  const router = useRouter();
  return (
    <View style={s.cardBody}>
      <Rail kicker="📰 On the wires" color={p.textMuted} right={item.tag} />
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={s.articleImg} resizeMode="cover" />
      ) : null}
      <Text style={[s.articleTitle, { color: p.textPrimary }]} numberOfLines={4}>{item.title}</Text>
      <Text style={[s.metaLine, { color: p.textMuted }]}>
        {item.publisher}{item.at ? ` · ${shortDate(item.at)}` : ''}
      </Text>
      {item.relatedTickers && item.relatedTickers.length > 0 && (
        <View style={s.chipRow}>
          {item.relatedTickers.slice(0, 4).map((t) => (
            <Pressable key={t} onPress={() => router.push(`/stock/${t}`)} style={[s.chip, { borderColor: p.cardBorder }]}>
              <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 12 }}>{t}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={s.spacer} />
      {item.url && <Cta text={`Read at ${item.publisher ?? 'source'} ↗`} onPress={() => Linking.openURL(item.url!)} p={p} />}
      <Text style={[s.dateLine, { color: p.textMuted }]}>context, not a signal</Text>
    </View>
  );
}

/* ---------- lesson: a literacy snippet ---------- */

function LessonCard({ item, p }: { item: WireItem; p: Palette }) {
  const [openTerm, setOpenTerm] = useState<string | null>(null);
  const openDef = item.lessonRelated?.find((r) => r.slug === openTerm)?.def ?? null;
  return (
    <View style={s.cardBody}>
      <Rail kicker="🎓 Learn one thing" color={p.pos} right="Get rich literate, quick" />
      <Text style={[s.lessonTerm, { color: p.textPrimary }]}>{item.lessonTerm}</Text>
      <Text style={[s.lessonBody, { color: p.textPrimary }]}>{item.lessonBody}</Text>
      {item.lessonExample && (
        <Text style={[s.lessonExample, { color: p.textMuted }]}>e.g. {item.lessonExample}</Text>
      )}
      {item.lessonRelated && item.lessonRelated.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <Text style={[s.heatLabel, { color: p.textMuted, marginBottom: 6 }]}>RELATED</Text>
          <View style={s.chipRow}>
            {item.lessonRelated.slice(0, 4).map((r) => (
              <Pressable
                key={r.slug}
                onPress={() => setOpenTerm(openTerm === r.slug ? null : r.slug)}
                style={[s.chip, { borderColor: p.cardBorder, backgroundColor: openTerm === r.slug ? p.accent + '1a' : undefined }]}
              >
                <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 12 }}>{r.term}</Text>
              </Pressable>
            ))}
          </View>
          {openDef && <Text style={[s.lessonExample, { color: p.textMuted }]}>{openDef}</Text>}
        </View>
      )}
      <View style={s.spacer} />
      <Text style={[s.dateLine, { color: p.textMuted }]}>the literacy pillar · every number explainable</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  card: { flex: 1, padding: 0, overflow: 'hidden' },
  cardBody: { flex: 1, padding: 16 },
  rail: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  railText: { fontFamily: F.bold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  railRight: { fontFamily: F.reg, fontSize: 10 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identityMain: { flex: 1, minWidth: 0 },
  identitySym: { fontFamily: F.display, fontSize: 20 },
  identityName: { fontFamily: F.reg, fontSize: 12, marginTop: 1 },
  identityRight: { alignItems: 'flex-end' },
  identityPrice: { fontFamily: F.semi, fontSize: 15 },
  identityDay: { fontFamily: F.semi, fontSize: 11.5, marginTop: 1 },
  heroStat: { alignItems: 'center', paddingVertical: 14 },
  heroStatValue: { fontFamily: F.display, fontSize: 40, letterSpacing: -0.5 },
  heroStatLabel: { fontFamily: F.semi, fontSize: 9, letterSpacing: 1.5, marginTop: 2 },
  targetRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  targetLabel: { fontFamily: F.med, fontSize: 11.5 },
  targetVal: { fontFamily: F.semi, fontSize: 13.5 },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  heatLabel: { fontFamily: F.semi, fontSize: 9, letterSpacing: 1.5 },
  heatTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  heatFill: { height: 6, borderRadius: 3 },
  heatVal: { fontFamily: F.bold, fontSize: 12 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletMark: { fontFamily: F.semi, fontSize: 13, lineHeight: 18 },
  bulletText: { flex: 1, fontFamily: F.reg, fontSize: 12.5, lineHeight: 18 },
  metaLine: { fontFamily: F.reg, fontSize: 11, marginTop: 10 },
  spacer: { flex: 1 },
  ctaRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  cta: { flex: 1, alignItems: 'center', borderRadius: 12, paddingVertical: 12 },
  ctaShare: { width: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  dateLine: { fontFamily: F.reg, fontSize: 9.5, textAlign: 'center', marginTop: 8, opacity: 0.8 },
  watchHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  watchAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 1 },
  articleImg: { width: '100%', height: 210, borderRadius: 12 },
  articleTitle: { fontFamily: F.semi, fontSize: 18, lineHeight: 25, marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 5 },
  lessonTerm: { fontFamily: F.display, fontSize: 24, marginTop: 4 },
  lessonBody: { fontFamily: F.reg, fontSize: 14.5, lineHeight: 22, marginTop: 12 },
  lessonExample: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 12.5, lineHeight: 18, marginTop: 10 },
});
