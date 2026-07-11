import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SubScreen, Card, Footnote, Grid } from '../../../components/Chrome';
import { usePalette, F } from '../../../constants/theme';
import { GLOSSARY } from '../../../lib/learn';

/** The full glossary, searchable (web /learn/glossary parity): every term GRQ
 * puts on screen, defined in plain English with an example and related-term
 * chips — the same definitions behind every dotted term in the app. */
export default function LearnGlossaryScreen() {
  const { p } = usePalette();
  const [q, setQ] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const entries = useMemo(
    () =>
      Object.entries(GLOSSARY)
        .map(([slug, e]) => ({ slug, ...e }))
        .sort((a, b) => a.term.localeCompare(b.term)),
    [],
  );
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? entries.filter((e) => e.term.toLowerCase().includes(needle) || e.def.toLowerCase().includes(needle))
    : entries;

  const jump = (slug: string) => {
    setQ('');
    setOpenKey(slug);
  };

  return (
    <SubScreen title="The glossary">
      <View style={{ marginTop: 8, gap: 10 }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="search terms…"
          placeholderTextColor={p.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={[s.search, { backgroundColor: p.cardBg, borderColor: p.cardBorder, color: p.textPrimary }]}
        />
        <Text style={[s.count, { color: p.textMuted }]}>
          {shown.length === entries.length ? `${entries.length} terms` : `${shown.length} of ${entries.length} terms`}
        </Text>

        {shown.length === 0 && (
          <Card>
            <Text style={[s.def, { color: p.textMuted }]}>
              Nothing matches — but that might mean we&apos;re missing a term worth having. Ask Alfred, and
              he&apos;ll explain anyway.
            </Text>
          </Card>
        )}

        {/* iPad: two columns of term cards; a phone stays one column. */}
        <Grid min={280} gap={10}>
        {shown.map((e) => {
          const open = openKey === e.slug || !!needle; // search results show full entries
          return (
            <Card key={e.slug}>
              <Pressable onPress={() => setOpenKey(open && !needle ? null : e.slug)}>
                <Text style={[s.term, { color: p.textPrimary }]}>{e.term}</Text>
                {open ? (
                  <>
                    <Text style={[s.def, { color: p.textMuted, marginTop: 5 }]}>{e.def}</Text>
                    {e.example ? <Text style={[s.example, { color: p.textMuted }]}>e.g. {e.example}</Text> : null}
                    {(e.related?.length ?? 0) > 0 && (
                      <View style={s.relatedWrap}>
                        <Text style={[s.relatedLabel, { color: p.textMuted }]}>RELATED</Text>
                        {e.related!
                          .filter((r) => GLOSSARY[r])
                          .map((r) => (
                            <Pressable key={r} onPress={() => jump(r)} style={[s.chip, { borderColor: p.cardBorder, backgroundColor: p.cardHi }]}>
                              <Text style={{ color: p.accentText, fontFamily: F.med, fontSize: 10.5 }}>{GLOSSARY[r].term}</Text>
                            </Pressable>
                          ))}
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={[s.def, { color: p.textMuted, marginTop: 4 }]} numberOfLines={1}>
                    {e.def}
                  </Text>
                )}
              </Pressable>
            </Card>
          );
        })}
        </Grid>
        <Footnote>
          the same definitions behind every dotted term in the app — a figure the app shows but can&apos;t
          explain is a bug
        </Footnote>
      </View>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontFamily: F.reg, fontSize: 13 },
  count: { fontFamily: F.reg, fontSize: 10.5 },
  term: { fontFamily: F.semi, fontSize: 13.5 },
  def: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18.5 },
  example: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  relatedWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 },
  relatedLabel: { fontFamily: F.semi, fontSize: 8.5, letterSpacing: 1.2, marginRight: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3.5 },
});
