import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePalette, F, type Palette } from '../../constants/theme';
import { appHref, type LearnBlock } from '../../lib/learn';
import MdText from '../MdText';
import OrderBookSim from './OrderBookSim';
import CompoundingSim from './CompoundingSim';
import ReceiptBlock, { type ReceiptWire } from './ReceiptBlock';
import LearnSvg from './LearnSvg';

/** Renders one D111 lesson block natively (web BlockRenderer parity). Checks are
 * NOT rendered here — the lesson screen groups them into its own "Check yourself"
 * section (the web layout's mobile breakpoint does the same). */

const CALLOUT: Record<'note' | 'trap' | 'rule', { label: string; color: (p: Palette) => string }> = {
  note: { label: 'NOTE', color: (p) => p.accentText },
  trap: { label: 'TRAP', color: (p) => p.warn },
  rule: { label: 'HARD RULE', color: (p) => p.neg },
};

function Video({ b, p }: { b: Extract<LearnBlock, { kind: 'video' }>; p: Palette }) {
  return (
    <Pressable onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${b.yt}`)} style={[s.videoBox, { borderColor: p.cardBorder }]}>
      <View>
        <Image source={{ uri: `https://i.ytimg.com/vi/${b.yt}/hqdefault.jpg` }} style={s.thumb} />
        <View style={s.playWrap}>
          <View style={s.playBadge}>
            <Text style={{ color: '#fff', fontSize: 16 }}>▶</Text>
          </View>
        </View>
        <View style={s.minBadge}>
          <Text style={{ color: '#ffffffcc', fontFamily: F.med, fontSize: 9 }}>{b.minutes} min</Text>
        </View>
      </View>
      <View style={{ padding: 10 }}>
        <Text style={{ fontFamily: F.semi, fontSize: 12.5, color: p.textPrimary }}>
          {b.title} <Text style={{ fontFamily: F.reg, color: p.textMuted }}>· {b.author}</Text>
        </Text>
        <Text style={{ fontFamily: F.reg, fontSize: 10.5, lineHeight: 15, color: p.textMuted, marginTop: 3, fontStyle: 'italic' }}>
          Watch for: {b.why}
        </Text>
      </View>
    </Pressable>
  );
}

export default function LearnBlock({
  block,
  receipts,
  examples,
}: {
  block: LearnBlock;
  receipts?: Record<string, ReceiptWire>;
  examples?: Record<string, { md: string; asOf: string }>;
}) {
  const { p } = usePalette();
  const router = useRouter();

  switch (block.kind) {
    case 'prose':
      return <MdText body={block.md} foldAt={100000} />;
    case 'callout': {
      const t = CALLOUT[block.tone];
      return (
        <View style={[s.callout, { borderColor: t.color(p) + '55', backgroundColor: t.color(p) + '0d' }]}>
          <Text style={[s.calloutLabel, { color: t.color(p) }]}>{t.label}</Text>
          <MdText body={block.md} foldAt={100000} />
        </View>
      );
    }
    case 'figure':
      return (
        <View style={{ marginTop: 12 }}>
          <Image source={{ uri: block.src }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12 }} resizeMode="cover" />
          {block.caption ? <Text style={[s.caption, { color: p.textMuted }]}>{block.caption}</Text> : null}
        </View>
      );
    case 'diagram':
      return <LearnSvg query={`kind=diagram&id=${encodeURIComponent(block.id)}`} />;
    case 'chart':
      return (
        <LearnSvg
          query={`kind=chart&symbol=${encodeURIComponent(block.spec.symbol)}&days=${block.spec.days}&label=${encodeURIComponent(
            block.spec.label,
          )}${block.spec.annotate ? `&annotate=${block.spec.annotate}` : ''}`}
        />
      );
    case 'widget':
      return block.id === 'order-book' ? <OrderBookSim /> : <CompoundingSim />;
    case 'receipt':
      return <ReceiptBlock r={receipts?.[block.id]} />;
    case 'example': {
      const live = examples?.[block.key];
      const stamp = live
        ? `live · as of ${new Date(live.asOf).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`
        : 'illustration — the live version returns as the data refreshes';
      return (
        <View style={[s.exampleBox, { borderColor: p.cardBorder, backgroundColor: p.cardHi + '33' }]}>
          <View style={s.exampleHead}>
            <Text style={[s.exampleTitle, { color: p.accentText }]}>MARKET EXAMPLE</Text>
            <Text style={[s.exampleStamp, { color: p.textMuted }]}>{stamp}</Text>
          </View>
          <MdText body={live?.md ?? block.fallbackMd} foldAt={100000} />
        </View>
      );
    }
    case 'video':
      return <Video b={block} p={p} />;
    case 'tryIt':
      return (
        <View style={[s.tryRow, { borderTopColor: p.cardBorder }]}>
          {block.links.map((t) => {
            const dest = appHref(t.href);
            if (!dest) return null;
            return (
              <Pressable key={t.href} onPress={() => router.push(dest as never)}>
                <Text style={[s.tryLink, { color: p.accentText }]}>{t.label} →</Text>
              </Pressable>
            );
          })}
        </View>
      );
    case 'check':
      return null; // rendered by the lesson screen's Check-yourself section
    default:
      return null;
  }
}

const s = StyleSheet.create({
  callout: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 12, gap: 4 },
  calloutLabel: { fontFamily: F.bold, fontSize: 9, letterSpacing: 1.5 },
  caption: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 15, marginTop: 6 },
  videoBox: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginTop: 12 },
  thumb: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  playWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  minBadge: { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  exampleBox: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 },
  exampleHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  exampleTitle: { fontFamily: F.bold, fontSize: 9, letterSpacing: 1.5 },
  exampleStamp: { fontFamily: F.reg, fontSize: 9 },
  tryRow: { borderTopWidth: 1, marginTop: 12, paddingTop: 10, gap: 6 },
  tryLink: { fontFamily: F.semi, fontSize: 12, lineHeight: 18 },
});
