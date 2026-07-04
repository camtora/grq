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

// Inline: **bold**, *italic*, [[term]].
function renderInline(text: string, p: Palette, keyPrefix: string): React.ReactNode[] {
  const re = /(\*\*[^*]+?\*\*|\*[^*\n]+?\*|\[\[[^\]]+?\]\])/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(
        <Text key={`${keyPrefix}-b${i}`} style={{ fontFamily: F.semi, color: p.textPrimary }}>
          {tok.slice(2, -2)}
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

export default function MdText({ body, foldAt = 420 }: { body: string; foldAt?: number }) {
  const { p } = usePalette();
  const [open, setOpen] = useState(false);
  const blocks = parseBlocks(body);

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
            {renderInline(b.text, p, `p${i}`)}
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
