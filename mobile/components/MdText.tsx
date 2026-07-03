import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { usePalette, F } from '../constants/theme';

/** Markdown-ish agent text shown as plain prose with a read-more fold.
 * Strips headings/bold/italic/backticks and [[glossary]] link markup. */
export default function MdText({ body, foldAt = 420 }: { body: string; foldAt?: number }) {
  const { p } = usePalette();
  const [open, setOpen] = useState(false);
  const text = body
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[\[(.+?)\]\]/g, '$1')
    .replace(/`/g, '')
    .trim();
  const folded = !open && text.length > foldAt;
  return (
    <View>
      <Text style={{ color: p.textPrimary, fontFamily: F.reg, fontSize: 13, lineHeight: 20 }}>
        {folded ? `${text.slice(0, foldAt).trimEnd()}…` : text}
      </Text>
      {text.length > foldAt && (
        <Text
          onPress={() => setOpen(!open)}
          style={{ color: p.accentText, fontFamily: F.semi, fontSize: 12, marginTop: 8 }}
        >
          {open ? 'show less' : 'read more'}
        </Text>
      )}
    </View>
  );
}
