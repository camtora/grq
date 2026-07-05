import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Divider, SectionTitle, Footnote, Loading } from '../components/Chrome';
import { usePalette, F } from '../constants/theme';
import { api } from '../services/api';

// Mirror of web/lib/push/categories.ts — the toggles + the always-on list
// (web components/NotificationSettings.tsx parity).
const TOGGLES: { key: string; label: string; desc: string }[] = [
  { key: 'dossiers', label: 'Research dossiers', desc: 'A dossier you or the agent requested is ready.' },
  { key: 'hunt', label: 'The Hunt & ideas', desc: 'New hunt names, directed-hunt results, and smart-money scans.' },
  { key: 'agentMoves', label: 'Agent universe moves', desc: 'When the agent tracks or self-promotes a name into its tradeable universe.' },
  { key: 'reports', label: 'Daily reports', desc: 'Morning plan, midday brief, end-of-day close, and the weekly review.' },
  { key: 'checkins', label: 'Intraday check-ins', desc: "The agent's fund-level read on the whole portfolio and plan." },
  { key: 'holdingChecks', label: 'Position notes', desc: 'A per-name read when one of your holdings makes a fresh ±4% move. Fires once per move, not per tick.' },
  { key: 'members', label: 'Member activity', desc: 'When the other member blocks, pins, promotes, or demotes a name.' },
  { key: 'system', label: 'System health', desc: 'Agent restarts and data-feed or broker hiccups (non-critical).' },
  { key: 'priceTargets', label: 'Price alerts', desc: 'When a stock you set an alert on crosses your target price.' },
  { key: 'optionsDesk', label: 'Options Desk', desc: 'When the experimental Options Desk opens or settles an option. Sandbox only; never the real fund.' },
];

const ALWAYS_ON: { label: string; desc: string }[] = [
  { label: 'Trades', desc: 'Every buy, sell, stop, and take-profit fill.' },
  { label: 'Risk & safety', desc: 'Kill switch, drawdown halt, and daily-loss pause.' },
  { label: 'FX approvals', desc: 'When the agent asks to convert CAD→USD to fund a US name — needs your OK.' },
  { label: 'Messages', desc: 'When the other member sends you a message or shares a stock.' },
  { label: 'Account connections', desc: 'When your linked brokerage (your TD) loses its SnapTrade connection and holdings freeze — a quick reconnect fixes it. Only you get yours.' },
  { label: 'Critical outages', desc: 'Agent crashes and total data-feed failures.' },
];

/** Notification options — what pushes your phone (web NotificationSettings
 * parity). The feed itself lives behind the bell. */
export default function NotificationSettingsScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Record<string, boolean>>('/api/notifications/preferences')
      .then(setPrefs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load preferences.'));
  }, []);

  const toggle = async (key: string, value: boolean) => {
    setPrefs((prev) => (prev ? { ...prev, [key]: value } : prev));
    try {
      await api('/api/notifications/preferences', { method: 'PUT', body: JSON.stringify({ [key]: value }) });
    } catch {
      setPrefs((prev) => (prev ? { ...prev, [key]: !value } : prev)); // revert on failure
    }
  };

  return (
    <SafeAreaView edges={['top']} style={[s.fill, { backgroundColor: p.bodyBg }]}>
      <View style={s.bar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={p.accentText} />
          <Text style={{ color: p.accentText, fontFamily: F.med, fontSize: 14 }}>Back</Text>
        </Pressable>
        <Text style={[s.title, { color: p.textPrimary }]}>Notifications</Text>
        <View style={s.back} />
      </View>
      <ScrollView contentContainerStyle={s.body}>
        {!prefs && !error && <Loading />}
        {error && (
          <Card>
            <Text style={{ color: p.neg, fontFamily: F.med, fontSize: 13 }}>{error}</Text>
          </Card>
        )}
        {prefs && (
          <View>
            <SectionTitle sub="pick what pushes your phone">Delivery</SectionTitle>
            <Card style={s.listCard}>
              {TOGGLES.map((t, i) => (
                <View key={t.key}>
                  {i > 0 && <Divider />}
                  <View style={s.prefRow}>
                    <View style={s.rowMain}>
                      <Text style={[s.rowTitle, { color: p.textPrimary }]}>{t.label}</Text>
                      <Text style={[s.rowBody, { color: p.textMuted }]}>{t.desc}</Text>
                    </View>
                    <Switch
                      value={prefs[t.key] !== false}
                      onValueChange={(v) => toggle(t.key, v)}
                      trackColor={{ true: p.accent, false: undefined }}
                    />
                  </View>
                </View>
              ))}
            </Card>

            <SectionTitle sub="the money ones — no off switch">Always on</SectionTitle>
            <Card style={s.listCard}>
              {ALWAYS_ON.map((a, i) => (
                <View key={a.label}>
                  {i > 0 && <Divider />}
                  <View style={s.prefRow}>
                    <Ionicons name="lock-closed" size={13} color={p.textMuted} style={{ marginTop: 2 }} />
                    <View style={s.rowMain}>
                      <Text style={[s.rowTitle, { color: p.textPrimary }]}>{a.label}</Text>
                      <Text style={[s.rowBody, { color: p.textMuted }]}>{a.desc}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </Card>
            <Footnote>toggles are per-member and shared with the web — flip one here, it's flipped everywhere</Footnote>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 12 },
  back: { flexDirection: 'row', alignItems: 'center', width: 70 },
  title: { flex: 1, textAlign: 'center', fontFamily: 'System', fontWeight: '800', fontSize: 17 },
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: F.semi, fontSize: 13.5, lineHeight: 18 },
  rowBody: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
});
