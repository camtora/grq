import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePalette, F } from '../constants/theme';
import { useGlossary } from '../store/glossary';
import { GLOSSARY, glossaryLookup } from '../lib/learn';

/** The tap-to-explain bottom sheet (the literacy pillar, web <Term> parity):
 * definition + example + related terms (tappable onward, so you can wander the
 * glossary), and a door into the full browser. Mounted ONCE in the root layout;
 * opened from any [[term]] via store/glossary. */
export default function GlossarySheet() {
  const { p } = usePalette();
  const router = useRouter();
  const { openKey, open, close } = useGlossary();

  if (!openKey) return null;
  const hit = glossaryLookup(openKey);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      {/* scrim */}
      <Pressable style={s.scrim} onPress={close} />
      <View style={[s.sheet, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>
        <View style={[s.grabber, { backgroundColor: p.cardBorder }]} />
        {hit ? (
          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            <Text style={[s.term, { color: p.textPrimary }]}>{hit.entry.term}</Text>
            <Text style={[s.def, { color: p.textMuted }]}>{hit.entry.def}</Text>
            {hit.entry.example ? (
              <Text style={[s.example, { color: p.textMuted }]}>e.g. {hit.entry.example}</Text>
            ) : null}
            {(hit.entry.related?.length ?? 0) > 0 && (
              <View style={s.relatedWrap}>
                <Text style={[s.relatedLabel, { color: p.textMuted }]}>RELATED</Text>
                {hit.entry.related!
                  .filter((r) => GLOSSARY[r])
                  .map((r) => (
                    <Pressable key={r} onPress={() => open(r)} style={[s.chip, { borderColor: p.cardBorder, backgroundColor: p.cardHi }]}>
                      <Text style={{ color: p.accentText, fontFamily: F.med, fontSize: 11 }}>{GLOSSARY[r].term}</Text>
                    </Pressable>
                  ))}
              </View>
            )}
          </ScrollView>
        ) : (
          <>
            <Text style={[s.term, { color: p.textPrimary }]}>“{openKey}”</Text>
            <Text style={[s.def, { color: p.textMuted }]}>
              Not in the glossary yet — which might mean it&apos;s a term worth adding. Ask Alfred and he&apos;ll
              explain it anyway.
            </Text>
          </>
        )}
        <View style={s.footRow}>
          <Pressable
            onPress={() => {
              close();
              router.push('/more/learn-glossary');
            }}
          >
            <Text style={[s.footLink, { color: p.accentText }]}>browse the full glossary →</Text>
          </Pressable>
          <Pressable onPress={close}>
            <Text style={[s.footLink, { color: p.textMuted }]}>close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 34,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 12 },
  term: { fontFamily: 'System', fontWeight: '800', fontSize: 17 },
  def: { fontFamily: F.reg, fontSize: 13.5, lineHeight: 20, marginTop: 8 },
  example: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 12, lineHeight: 17, marginTop: 8 },
  relatedWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 },
  relatedLabel: { fontFamily: F.semi, fontSize: 9, letterSpacing: 1.2, marginRight: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  footRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  footLink: { fontFamily: F.semi, fontSize: 12 },
});
