import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Divider, Loading } from '../components/Chrome';
import { usePalette, F, type Palette } from '../constants/theme';
import { api } from '../services/api';
import { routeForNotification } from '../lib/notification-routes';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ notifications: NotificationItem[] }>('/api/notifications')
      .then(async (d) => {
        setItems(d.notifications);
        await api('/api/notifications/read', { method: 'POST', body: '{}' }).catch(() => null);
        setUnread(0);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load notifications.'));
  }, [setUnread]);

  return (
    <SafeAreaView edges={['top']} style={[s.fill, { backgroundColor: p.bodyBg }]}>
      <View style={s.bar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={p.accentText} />
          <Text style={{ color: p.accentText, fontFamily: F.med, fontSize: 14 }}>back</Text>
        </Pressable>
        <Text style={[s.title, { color: p.textPrimary }]}>Notifications</Text>
        <View style={[s.back, { justifyContent: 'flex-end' }]}>
          {/* Delivery OPTIONS live in their own screen (Cam 2026-07-03). */}
          <Pressable onPress={() => router.push('/notification-settings')} hitSlop={8}>
            <Ionicons name="options-outline" size={20} color={p.textMuted} />
          </Pressable>
        </View>
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
                {items.map((n, i) => {
                  // Rows route like push taps (lib/notification-routes) — fx/risk →
                  // Settings, reports/check-ins → Portfolio, a symbol → its stock page.
                  const path = routeForNotification(n);
                  return (
                    <View key={n.id}>
                      {i > 0 && <Divider />}
                      <Pressable
                        onPress={() => path && router.push(path)}
                        style={[s.row, { opacity: n.read ? 0.75 : 1 }]}
                      >
                        <View style={[s.dot, { backgroundColor: severityColor(n.severity, p) }]} />
                        <View style={s.rowMain}>
                          <Text style={[s.rowTitle, { color: p.textPrimary }]}>{n.title}</Text>
                          {n.body ? (
                            <Text style={[s.rowBody, { color: p.textMuted }]} numberOfLines={2}>{n.body}</Text>
                          ) : null}
                          <Text style={[s.rowMeta, { color: p.textMuted }]}>
                            {n.category}{n.symbol ? ` · ${n.symbol}` : ''}{path ? ' →' : ''}
                          </Text>
                        </View>
                        <Text style={[s.rowMeta, { color: p.textMuted }]}>{timeAgo(n.at)}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </Card>
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
  title: { flex: 1, textAlign: 'center', fontFamily: 'System', fontWeight: '800', fontSize: 17 },
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
