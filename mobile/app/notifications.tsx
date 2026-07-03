import React from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePalette, F } from '../constants/theme';
import { Card } from '../components/Chrome';

/** Bell target — the notifications center lands here in a later phase (the
 * backend push categories already exist, D53). */
export default function Notifications() {
  const { p } = usePalette();
  const router = useRouter();
  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: p.bodyBg }]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={p.accentText} />
          <Text style={{ color: p.accentText, fontFamily: F.med, fontSize: 14 }}>back</Text>
        </Pressable>
        <Text style={[styles.title, { color: p.textPrimary }]}>Notifications</Text>
        <View style={styles.back} />
      </View>
      <View style={styles.body}>
        <Card>
          <Text style={{ color: p.textMuted, fontFamily: F.reg, fontSize: 13, lineHeight: 19 }}>
            Nothing here yet — trade fills, risk alerts, and Alfred's check-ins will land
            here once the notification center ships. Push categories already exist on the
            backend; this screen is next in line.
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 12 },
  back: { flexDirection: 'row', alignItems: 'center', width: 70 },
  title: { flex: 1, textAlign: 'center', fontFamily: F.display, fontSize: 17 },
  body: { padding: 16 },
});
