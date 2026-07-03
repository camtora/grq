import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePalette } from '../constants/theme';

/** Scaffold-phase screen stub — replaced page by page as the content lands. */
export default function Placeholder({ title, note }: { title: string; note: string }) {
  const { p } = usePalette();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: p.bodyBg }]}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: p.textPrimary }]}>{title}</Text>
        <View style={[styles.card, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>
          <Text style={[styles.note, { color: p.textMuted }]}>{note}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1, padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 14, padding: 16 },
  note: { fontSize: 15, lineHeight: 21 },
});
