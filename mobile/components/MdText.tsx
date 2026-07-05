import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette, F, type Palette } from '../constants/theme';
import { useGlossary } from '../store/glossary';
import { glossaryLookup } from '../lib/learn';

/** Lightweight markdown renderer for agent prose (dossiers, briefings) with a
 * read-more fold. Handles: # headings, a lone **bold** line as a section
 * header, - / * / 1. lists, inline **bold** / *italic*, and [[glossary]]
 * terms — tap-to-explain everywhere via the GlossarySheet (the literacy
 * pillar, 2026-07-04). */

// Inline: **bold**, *italic*, [[term]], and the lessons' [display](#explain:slug) links —
// both explain forms open the GlossarySheet (web Md.tsx parity, D111 L5). Bold runs
// render their INNER content through renderInline too, so a term inside **…** (the
// Learn ledes: **[[VOLATILITY]] IS**) stays tappable instead of showing raw brackets.
// `lede` (an armed flag) sizes the FIRST bold run up — the magazine lede.
function renderInline(text: string, p: Palette, keyPrefix: string, lede?: { armed: boolean }): React.ReactNode[] {
  const re = /(\[[^\]]+?\]\(#explain:[^)\s]+\)|\*\*[^*]+?\*\*|\*[^*\n]+?\*|\[\[[^\]]+?\]\])/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    if (tok.startsWith('**')) {
      const big = lede?.armed === true;
      if (lede) lede.armed = false;
      out.push(
        <Text key={`${keyPrefix}-b${i}`} style={{ fontFamily: big ? F.bold : F.semi, color: p.textPrimary, ...(big ? { fontSize: 16, letterSpacing: 0.4 } : {}) }}>
          {renderInline(tok.slice(2, -2), p, `${keyPrefix}-bb${i}`)}
        </Text>,
      );
    } else if (tok.startsWith('[') && tok.includes('](#explain:')) {
      const m = /^\[([^\]]+)\]\(#explain:([^)\s]+)\)$/.exec(tok);
      const display = m?.[1] ?? tok;
      const slug = decodeURIComponent(m?.[2] ?? '').toLowerCase();
      out.push(
        <Text
          key={`${keyPrefix}-e${i}`}
          onPress={() => useGlossary.getState().open(slug)}
          style={{ color: p.accentText, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}
        >
          {display}
        </Text>,
      );
    } else if (tok.startsWith('[[')) {
      // The marker carries a glossary key ("bid-ask-spread") or a loose term —
      // show its glossary title when we know it, open the sheet on tap.
      const raw = tok.slice(2, -2);
      const hit = glossaryLookup(raw);
      const display = hit ? hit.entry.term.split(' — ')[0] : raw;
      out.push(
        <Text
          key={`${keyPrefix}-t${i}`}
          onPress={() => useGlossary.getState().open(hit?.key ?? raw)}
          style={{ color: p.accentText, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}
        >
          {display}
        </Text>,
      );
    } else {
      out.push(
        <Text key={`${keyPrefix}-i${i}`} style={{ fontStyle: 'italic' }}>
          {tok.slice(1, -1)}
        </Text>,
      );
    }
    last = idx + tok.length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'bullet'; text: string; marker: string }
  | { kind: 'para'; text: string };

function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const h = line.match(/^#+\s*(.+)$/);
    if (h) {
      blocks.push({ kind: 'heading', text: h[1] });
      continue;
    }
    // A line that is ONLY a bold token is a section header (the dossier's
    // "**Snapshot**" / "**Bull case**" convention).
    const loneBold = line.match(/^\*\*([^*]+)\*\*:?$/);
    if (loneBold) {
      blocks.push({ kind: 'heading', text: loneBold[1] });
      continue;
    }
    const bullet = line.match(/^([-*•]|\d+[.)])\s+(.+)$/);
    if (bullet) {
      blocks.push({ kind: 'bullet', text: bullet[2], marker: /\d/.test(bullet[1]) ? bullet[1] : '•' });
      continue;
    }
    blocks.push({ kind: 'para', text: line });
  }
  return blocks;
}

export default function MdText({ body, foldAt = 420, ledeBoost = false }: { body: string; foldAt?: number; ledeBoost?: boolean }) {
  const { p } = usePalette();
  const [open, setOpen] = useState(false);
  const blocks = parseBlocks(body);
  // The Learn lede: the first bold run of the first block renders a size up.
  const lede = ledeBoost ? { armed: true } : undefined;

  // Fold by whole blocks once the cumulative length passes foldAt.
  let shown = blocks;
  let folded = false;
  if (!open) {
    let acc = 0;
    const cut = blocks.findIndex((b) => {
      acc += b.text.length;
      return acc > foldAt;
    });
    if (cut >= 0 && cut < blocks.length - 1) {
      shown = blocks.slice(0, Math.max(1, cut + 1));
      folded = true;
    }
  }

  return (
    <View>
      {shown.map((b, i) => {
        if (b.kind === 'heading') {
          return (
            <Text key={i} style={[s.heading, { color: p.textPrimary, marginTop: i === 0 ? 0 : 12 }]}>
              {renderInline(b.text, p, `h${i}`)}
            </Text>
          );
        }
        if (b.kind === 'bullet') {
          return (
            <View key={i} style={s.bulletRow}>
              <Text style={[s.marker, { color: p.accent }]}>{b.marker}</Text>
              <Text style={[s.body, { color: p.textPrimary, flex: 1 }]}>
                {renderInline(b.text, p, `b${i}`)}
              </Text>
            </View>
          );
        }
        return (
          <Text key={i} style={[s.body, { color: p.textPrimary, marginTop: i === 0 ? 0 : 8 }]}>
            {renderInline(b.text, p, `p${i}`, i === 0 ? lede : undefined)}
          </Text>
        );
      })}
      {(folded || open) && (
        <Text onPress={() => setOpen(!open)} style={[s.more, { color: p.accentText }]}>
          {open ? 'show less' : 'read more'}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  heading: { fontFamily: F.bold, fontSize: 13.5, lineHeight: 19, marginBottom: 4 },
  body: { fontFamily: F.reg, fontSize: 13, lineHeight: 20 },
  bulletRow: { flexDirection: 'row', gap: 8, marginTop: 6, paddingRight: 2 },
  marker: { fontFamily: F.semi, fontSize: 13, lineHeight: 20 },
  more: { fontFamily: F.semi, fontSize: 12, marginTop: 10 },
});
