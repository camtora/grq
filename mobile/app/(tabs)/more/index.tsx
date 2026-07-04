import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, SectionTitle, Footnote, Divider } from '../../../components/Chrome';
import { usePalette, F } from '../../../constants/theme';

type Row = { href: string; icon: keyof typeof Ionicons.glyphMap; title: string; desc: string };

const MARKETS: Row[] = [
  { href: '/more/hunt', icon: 'telescope-outline', title: 'The Hunt', desc: 'Under-the-radar leads, heat-ranked — steer it in plain English.' },
  { href: '/more/smart-money', icon: 'people-outline', title: 'Smart Money', desc: 'Buffett, Burry, congress & insiders — leads, not trades.' },
  { href: '/more/browse', icon: 'compass-outline', title: 'Browse', desc: 'The whole-market screen, ranked — 4,700+ names scored.' },
  { href: '/more/reports', icon: 'document-text-outline', title: 'Reports', desc: 'EOD closes, weekly reviews, and the daily build diary.' },
];

const EXPERIMENTS: Row[] = [
  { href: '/more/race', icon: 'git-compare-outline', title: 'Second Opinions', desc: "Seven shadow models judge the fund's real calls." },
  { href: '/more/bulls', icon: 'flag-outline', title: 'Bull Race', desc: 'Each model runs its own paper book — same market, same rules.' },
  { href: '/more/desk', icon: 'analytics-outline', title: 'Options Desk', desc: 'Stock-only vs stock+options — the sandbox that teaches options.' },
  { href: '/more/report-card', icon: 'school-outline', title: 'Report Card', desc: 'How every call actually did — graded, with receipts.' },
  { href: '/more/chess', icon: 'extension-puzzle-outline', title: 'Chess Moves', desc: 'Value-chain boards — who wins two moves after the headline.' },
];

export default function MoreScreen() {
  const { p } = usePalette();
  const router = useRouter();

  const renderRows = (rows: Row[]) => (
    <Card style={s.listCard}>
      {rows.map((r, i) => (
        <View key={r.href}>
          {i > 0 && <Divider />}
          <Pressable onPress={() => router.push(r.href)} style={s.row}>
            <View style={[s.iconWrap, { backgroundColor: p.accent + '1a' }]}>
              <Ionicons name={r.icon} size={18} color={p.accentText} />
            </View>
            <View style={s.rowMain}>
              <Text style={[s.rowTitle, { color: p.textPrimary }]}>{r.title}</Text>
              <Text style={[s.rowDesc, { color: p.textMuted }]}>{r.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={p.textMuted} />
          </Pressable>
        </View>
      ))}
    </Card>
  );

  return (
    <Screen title="More">
      <SectionTitle sub="the wider view">Markets</SectionTitle>
      {renderRows(MARKETS)}
      <SectionTitle sub="modeled, never the real fund">Experiments</SectionTitle>
      {renderRows(EXPERIMENTS)}
      <Footnote>
        the Short Lab, Day-Trading Lab, and the options education portal live on the web for now
      </Footnote>
    </Screen>
  );
}

const s = StyleSheet.create({
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: F.semi, fontSize: 14.5 },
  rowDesc: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 15, marginTop: 2 },
});
