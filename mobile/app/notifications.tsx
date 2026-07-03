import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Divider, SectionTitle, Footnote, Loading } from '../components/Chrome';
import { usePalette, F, type Palette } from '../constants/theme';
import { api } from '../services/api';
import { useNotifications } from '../store/notifications';

type NotificationItem = {
  id: number;
  at: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  symbol: string | null;
  panel: string | null;
  read: boolean;
};

// Mirror of web/lib/push/categories.ts TOGGLEABLE_CATEGORIES (server ignores
// unknown keys, so drift is harmless).
const TOGGLES: { key: string; label: string; desc: string }[] = [
  { key: 'dossiers', label: 'Research dossiers', desc: 'A dossier you or the agent requested is ready.' },
  { key: 'hunt', label: 'The Hunt & ideas', desc: 'New hunt names and directed-hunt results.' },
  { key: 'agentMoves', label: 'Agent universe moves', desc: 'The agent tracks or self-promotes a name.' },
  { key: 'reports', label: 'Daily reports', desc: 'Morning plan, midday brief, EOD close, weekly review.' },
  { key: 'checkins', label: 'Intraday check-ins', desc: "The agent's fund-level reads through the day." },
  { key: 'holdingChecks', label: 'Position notes', desc: 'A per-name read when a holding moves ±4%.' },
  { key: 'members', label: 'Member activity', desc: 'Blocks, pins, promotes, demotes by the other member.' },
  { key: 'system', label: 'System health', desc: 'Agent restarts and feed/broker hiccups (non-critical).' },
  { key: 'priceTargets', label: 'Price alerts', desc: 'A stock you set an alert on crosses your target.' },
  { key: 'optionsDesk', label: 'Options Desk', desc: 'The sandbox desk opens or settles an option.' },
];

function severityColor(sev: string, p: Palette): string {
  if (sev === 'critical') return p.neg;
  if (sev === 'warn' || sev === 'warning') return p.warn;
  return p.accent;
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / (60 * 24))}d`;
}

/** The bell: the member's notification feed (D63) + push delivery toggles.
 * Opening marks everything read. Trades/risk/FX/messages are always-on. */
export default function NotificationsScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const setUnread = useNotifications((s) => s.setUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ notifications: NotificationItem[] }>('/api/notifications')
      .then(async (d) => {
        setItems(d.notifications);
        await api('/api/notifications/read', { method: 'POST', body: '{}' }).catch(() => null);
        setUnread(0);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load notifications.'));
    api<Record<string, boolean>>('/api/notifications/preferences')
      .then(setPrefs)
      .catch(() => setPrefs(null));
  }, [setUnread]);

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
          <Text style={{ color: p.accentText, fontFamily: F.med, fontSize: 14 }}>back</Text>
        </Pressable>
        <Text style={[s.title, { color: p.textPrimary }]}>Notifications</Text>
        <View style={s.back} />
      </View>
      <ScrollView contentContainerStyle={s.body}>
        {items === null && !error && <Loading />}
        {error && (
          <Card>
            <Text style={{ color: p.neg, fontFamily: F.med, fontSize: 13 }}>{error}</Text>
          </Card>
        )}
        {items !== null && (
          <View>
            {items.length === 0 ? (
              <Card>
                <Text style={[s.empty, { color: p.textMuted }]}>
                  Nothing yet — trade fills, risk alerts, dossiers, and Alfred's check-ins land
                  here as they happen.
                </Text>
              </Card>
            ) : (
              <Card style={s.listCard}>
                {items.map((n, i) => (
                  <View key={n.id}>
                    {i > 0 && <Divider />}
                    <Pressable
                      onPress={() => n.symbol && router.push(`/stock/${n.symbol}`)}
                      style={[s.row, { opacity: n.read ? 0.75 : 1 }]}
                    >
                      <View style={[s.dot, { backgroundColor: severityColor(n.severity, p) }]} />
                      <View style={s.rowMain}>
                        <Text style={[s.rowTitle, { color: p.textPrimary }]}>{n.title}</Text>
                        {n.body ? (
                          <Text style={[s.rowBody, { color: p.textMuted }]} numberOfLines={2}>{n.body}</Text>
                        ) : null}
                        <Text style={[s.rowMeta, { color: p.textMuted }]}>
                          {n.category}{n.symbol ? ` · ${n.symbol} →` : ''}
                        </Text>
                      </View>
                      <Text style={[s.rowMeta, { color: p.textMuted }]}>{timeAgo(n.at)}</Text>
                    </Pressable>
                  </View>
                ))}
              </Card>
            )}

            {/* Delivery toggles (per-member; trades/risk/FX/messages are force-on in code) */}
            {prefs && (
              <View>
                <SectionTitle sub="what pushes your phone">Delivery</SectionTitle>
                <Card style={s.listCard}>
                  {TOGGLES.map((t, i) => (
                    <View key={t.key}>
                      {i > 0 && <Divider />}
                      <View style={s.prefRow}>
                        <View style={s.rowMain}>
                          <Text style={[s.rowTitle, { color: p.textPrimary }]}>{t.label}</Text>
                          <Text style={[s.rowBody, { color: p.textMuted }]} numberOfLines={2}>{t.desc}</Text>
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
                <Footnote>
                  trades · risk & safety · FX approvals · messages · critical outages are always
                  on — those are the money ones
                </Footnote>
              </View>
            )}
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
  title: { flex: 1, textAlign: 'center', fontFamily: F.display, fontSize: 17 },
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: F.semi, fontSize: 13.5, lineHeight: 18 },
  rowBody: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  rowMeta: { fontFamily: F.reg, fontSize: 10, marginTop: 3, opacity: 0.85 },
  empty: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18 },
});
