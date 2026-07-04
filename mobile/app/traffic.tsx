import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SubScreen, Card, SectionTitle, Footnote, Divider, Loading, ErrorNote } from '../components/Chrome';
import { usePalette, F, type Palette } from '../constants/theme';
import { useApi } from '../services/hooks';

const tabular = { fontVariant: ['tabular-nums' as const] };

/* ---------- wire (web /traffic parity) ---------- */

type TrafficWire = {
  days: number;
  totalViews: number;
  uniqueUsers: number;
  bySection: { section: string; views: number; users: number }[];
  byUser: { email: string; name: string | null; role: string; views: number; topSection: string | null; lastSeen: string }[];
  matrix: { sections: string[]; rows: { email: string; counts: Record<string, number> }[] };
  viewerQuestions: { at: string; name: string | null; email: string; symbol: string | null; message: string }[];
  // `client` "web" | "app" — how the view arrived; null/absent = logged before the split.
  recent: { at: string; name: string | null; email: string; section: string; path: string; client?: string | null }[];
};

const WINDOWS = [
  { days: 1, label: '24h' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function roleColor(role: string, p: Palette): string {
  if (role === 'owner') return p.accentText;
  if (role === 'member') return p.pos;
  return p.textMuted;
}

/** Traffic (web /traffic parity, owner-only): who's using GRQ and which sections
 * get the views — the window switcher, section bars, per-person table, the
 * who-uses-what matrix, viewer questions, and the live activity feed. */
export default function TrafficScreen() {
  const { p } = usePalette();
  const [days, setDays] = useState(7);
  const { data: d, error, loading, refreshing, refresh } = useApi<TrafficWire>(`/api/traffic?days=${days}`);
  const windowLabel = WINDOWS.find((w) => w.days === days)?.label ?? `${days} days`;
  const maxSection = Math.max(1, ...(d?.bySection ?? []).map((x) => x.views));

  return (
    <SubScreen title="Traffic" refreshing={refreshing} onRefresh={refresh}>
      <View style={{ marginTop: 8, gap: 10 }}>
        <Text style={[s.intro, { color: p.textMuted }]}>Who&apos;s using GRQ, and which sections get the traffic.</Text>

        <View style={s.chipRow}>
          {WINDOWS.map((w) => {
            const on = w.days === days;
            return (
              <Pressable
                key={w.days}
                onPress={() => setDays(w.days)}
                style={[s.chip, { borderColor: on ? p.accent + '88' : p.cardBorder, backgroundColor: on ? p.accent + '26' : p.cardBg }]}
              >
                <Text style={{ color: on ? p.accentText : p.textMuted, fontFamily: on ? F.semi : F.med, fontSize: 11.5 }}>{w.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading && <Loading />}
        {error && !loading && <ErrorNote message={error} />}
        {d && d.totalViews === 0 && (
          <Card>
            <Text style={[s.empty, { color: p.textMuted }]}>
              No traffic logged in the last {windowLabel} — widen the window above.
            </Text>
          </Card>
        )}
        {d && d.totalViews > 0 && (
          <>
            {/* summary */}
            <Card style={s.statGrid}>
              <View style={s.statCell}>
                <Text style={[s.statLabel, { color: p.textMuted }]}>PAGE VIEWS</Text>
                <Text style={[s.statValue, tabular, { color: p.textPrimary }]}>{d.totalViews.toLocaleString()}</Text>
                <Text style={[s.statNote, { color: p.textMuted }]}>last {windowLabel}</Text>
              </View>
              <View style={s.statCell}>
                <Text style={[s.statLabel, { color: p.textMuted }]}>ACTIVE PEOPLE</Text>
                <Text style={[s.statValue, tabular, { color: p.textPrimary }]}>{d.uniqueUsers}</Text>
                <Text style={[s.statNote, { color: p.textMuted }]}>distinct signed-in users</Text>
              </View>
              <View style={s.statCell}>
                <Text style={[s.statLabel, { color: p.textMuted }]}>TOP SECTION</Text>
                <Text style={[s.statValue, { color: p.textPrimary }]}>{d.bySection[0]?.section ?? '—'}</Text>
                {d.bySection[0] && <Text style={[s.statNote, { color: p.textMuted }]}>{d.bySection[0].views.toLocaleString()} views</Text>}
              </View>
            </Card>

            {/* most-used sections */}
            <View>
              <SectionTitle sub="views per section">Most-used sections</SectionTitle>
              <Card>
                {d.bySection.map((sec, i) => (
                  <View key={sec.section} style={[s.barRow, i > 0 && { marginTop: 8 }]}>
                    <Text style={[s.barLabel, { color: p.textPrimary }]} numberOfLines={1}>
                      {sec.section}
                    </Text>
                    <View style={[s.barTrack, { backgroundColor: p.cardHi }]}>
                      <View style={[s.barFill, { width: `${Math.round((sec.views / maxSection) * 100)}%`, backgroundColor: p.accent + '66' }]} />
                    </View>
                    <Text style={[s.barVal, tabular, { color: p.textMuted }]}>
                      {sec.views.toLocaleString()} · {sec.users}p
                    </Text>
                  </View>
                ))}
              </Card>
            </View>

            {/* by person */}
            <View>
              <SectionTitle sub="views · role · top section · last seen">By person</SectionTitle>
              <Card style={s.listCard}>
                {d.byUser.map((u, i) => (
                  <View key={u.email}>
                    {i > 0 && <Divider />}
                    <View style={s.userRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                          <Text style={[s.userName, { color: p.textPrimary }]}>{u.name ?? u.email}</Text>
                          <Text style={[s.pill, { color: roleColor(u.role, p), borderColor: roleColor(u.role, p) + '55', backgroundColor: roleColor(u.role, p) + '1a' }]}>
                            {u.role}
                          </Text>
                        </View>
                        <Text style={[s.metaSmall, { color: p.textMuted, marginTop: 2 }]}>
                          top: {u.topSection ?? '—'} · last seen {timeAgo(u.lastSeen)}
                        </Text>
                      </View>
                      <Text style={[s.userViews, tabular, { color: p.textPrimary }]}>{u.views.toLocaleString()}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>

            {/* who uses what — per-person breakdowns (phone-friendly; the web's grid
                matrix doesn't survive a narrow screen — Cam 2026-07-04) */}
            <View>
              <SectionTitle sub="each person's sections, ranked">Who uses what</SectionTitle>
              <View style={{ gap: 8 }}>
                {d.matrix.rows.map((row) => {
                  const name = d.byUser.find((u) => u.email === row.email)?.name;
                  const entries = Object.entries(row.counts)
                    .filter(([, n]) => n > 0)
                    .sort((a, b) => b[1] - a[1]);
                  const personMax = Math.max(1, ...entries.map(([, n]) => n));
                  const shown = entries.slice(0, 6);
                  const restViews = entries.slice(6).reduce((sum, [, n]) => sum + n, 0);
                  return (
                    <Card key={row.email}>
                      <Text style={[s.userName, { color: p.textPrimary }]}>{name ?? row.email.split('@')[0]}</Text>
                      <View style={{ gap: 5, marginTop: 8 }}>
                        {shown.map(([sec, n]) => (
                          <View key={sec} style={s.barRow}>
                            <Text style={[s.barLabel, { color: p.textMuted }]} numberOfLines={1}>
                              {sec}
                            </Text>
                            <View style={[s.barTrack, { backgroundColor: p.cardHi, height: 10, borderRadius: 5 }]}>
                              <View
                                style={[s.barFill, { width: `${Math.max(4, Math.round((n / personMax) * 100))}%`, backgroundColor: p.accent + '66', height: 10, borderRadius: 5 }]}
                              />
                            </View>
                            <Text style={[s.barVal, tabular, { color: p.textPrimary, width: 44 }]}>{n.toLocaleString()}</Text>
                          </View>
                        ))}
                        {restViews > 0 && (
                          <Text style={[s.metaSmall, { color: p.textMuted }]}>
                            +{entries.length - shown.length} more section{entries.length - shown.length > 1 ? 's' : ''} · {restViews.toLocaleString()} views
                          </Text>
                        )}
                      </View>
                    </Card>
                  );
                })}
              </View>
            </View>

            {/* viewer questions */}
            <View>
              <SectionTitle sub="what read-only viewers ask Alfred">Viewer questions</SectionTitle>
              <Card style={s.listCard}>
                {d.viewerQuestions.length === 0 ? (
                  <Text style={[s.empty, { color: p.textMuted }]}>No questions from viewers yet.</Text>
                ) : (
                  d.viewerQuestions.map((q, i) => (
                    <View key={i}>
                      {i > 0 && <Divider />}
                      <View style={{ paddingVertical: 8 }}>
                        <Text style={[s.metaSmall, { color: p.textMuted }]}>
                          {timeAgo(q.at)} · {q.name ?? q.email.split('@')[0]}
                          {q.symbol ? ` · ${q.symbol}` : ''}
                        </Text>
                        <Text style={[s.qText, { color: p.textPrimary, marginTop: 2 }]}>{q.message}</Text>
                      </View>
                    </View>
                  ))
                )}
              </Card>
            </View>

            {/* recent activity */}
            <View>
              <SectionTitle sub="the live feed">Recent activity</SectionTitle>
              <Card style={s.listCard}>
                {d.recent.map((r, i) => (
                  <View key={i}>
                    {i > 0 && <Divider />}
                    <View style={s.recentRow}>
                      <Text style={[s.metaSmall, tabular, { color: p.textMuted, width: 52 }]}>{timeAgo(r.at)}</Text>
                      <Text style={[s.metaSmall, { color: p.textPrimary, width: 60, fontFamily: F.semi }]} numberOfLines={1}>
                        {r.name ?? r.email.split('@')[0]}
                      </Text>
                      <Text style={[s.metaSmall, { color: p.textMuted, width: 80 }]} numberOfLines={1}>
                        {r.section}
                      </Text>
                      <Text style={[s.metaSmall, { color: p.textMuted, flex: 1 }]} numberOfLines={1}>
                        {r.path}
                      </Text>
                      {/* where from, pinned far right: GRQ Go vs the web — blank pre-split rows */}
                      <Text style={[s.clientTag, { color: r.client === 'app' ? p.accentText : p.textMuted, width: 26, textAlign: 'right' }]}>
                        {r.client ?? ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          </>
        )}
        <Footnote>page views are recorded as people navigate the site + app · owners only</Footnote>
      </View>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  empty: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, paddingVertical: 8 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '33.3%', paddingVertical: 4, paddingRight: 6 },
  statLabel: { fontFamily: F.semi, fontSize: 8, letterSpacing: 0.8 },
  statValue: { fontFamily: F.semi, fontSize: 14, marginTop: 2 },
  statNote: { fontFamily: F.reg, fontSize: 9, marginTop: 1 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { fontFamily: F.med, fontSize: 11.5, width: 86 },
  barTrack: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden' },
  barFill: { height: 14, borderRadius: 7 },
  barVal: { fontFamily: F.reg, fontSize: 10, width: 72, textAlign: 'right' },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  clientTag: { fontFamily: F.semi, fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.5 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  userName: { fontFamily: F.semi, fontSize: 13 },
  userViews: { fontFamily: F.semi, fontSize: 14 },
  pill: {
    fontFamily: F.bold,
    fontSize: 8.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    overflow: 'hidden',
  },
  metaSmall: { fontFamily: F.reg, fontSize: 10, lineHeight: 14 },
  qText: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
});
