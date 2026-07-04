import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SvgCss } from 'react-native-svg/css';
import { usePalette, F } from '../../constants/theme';
import { api } from '../../services/api';

/** A Learn diagram or real-data chart (D111 L5) — the SAME React component the web
 * renders, server-rendered to themed SVG by /api/learn/svg and drawn natively via
 * SvgCss. One source of truth; the picture cannot drift between web and app. */

type Wire = { title: string; caption: string; svg: string | null };

export default function LearnSvg({ query }: { query: string }) {
  const { p, scheme } = usePalette();
  const [wire, setWire] = useState<Wire | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setWire(null);
    setFailed(false);
    api<Wire>(`/api/learn/svg?${query}&theme=${scheme}`)
      .then((w) => alive && setWire(w))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [query, scheme]);

  const [w, setW] = useState(0);
  const vb = wire?.svg ? /viewBox="0 0 (\d+) (\d+)"/.exec(wire.svg) : null;
  const ratio = vb ? parseInt(vb[2], 10) / parseInt(vb[1], 10) : 0.3;

  return (
    <View
      style={[s.box, { borderColor: p.cardBorder, backgroundColor: p.cardHi + '33' }]}
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width) - 24)}
    >
      <Text style={[s.title, { color: p.accentText }]}>{(wire?.title ?? 'Diagram').toUpperCase()}</Text>
      {failed ? (
        <Text style={[s.note, { color: p.textMuted }]}>Couldn&apos;t load this graphic — pull to refresh, or find it on the web lesson.</Text>
      ) : !wire ? (
        <View style={{ height: 120 }} />
      ) : wire.svg && w > 0 ? (
        <View style={{ marginTop: 8 }}>
          <SvgCss xml={wire.svg} width={w} height={Math.round(w * ratio)} />
        </View>
      ) : (
        <Text style={[s.note, { color: p.textMuted }]}>{wire.caption}</Text>
      )}
      {wire?.svg ? <Text style={[s.caption, { color: p.textMuted }]}>{wire.caption}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 },
  title: { fontFamily: F.bold, fontSize: 9, letterSpacing: 1.5 },
  caption: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 15, marginTop: 8 },
  note: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 16, marginTop: 8 },
});
