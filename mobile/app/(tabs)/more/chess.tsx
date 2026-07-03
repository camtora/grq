import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote, Loading, ErrorNote } from '../../../components/Chrome';
import MdText from '../../../components/MdText';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { useApi } from '../../../services/hooks';

type ChessTheme = {
  id: number;
  title: string;
  anchor: string;
  kind: string;
  status: string; // READY | RUNNING | …
  bottomLine: string | null;
  createdAt: string;
  playCount: number;
  plays: { symbol: string }[];
};

function statusColor(status: string, p: Palette): string {
  if (status === 'READY') return p.pos;
  if (status === 'RUNNING') return p.warn;
  return p.textMuted;
}

/** Chess Moves — value-chain boards: take a headline (the anchor) and map who
 * wins two moves later. Tap a board for its bottom line + the ripple plays. */
export default function ChessScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const { data: d, error, loading, refreshing, refresh } = useApi<{ themes: ChessTheme[] }>('/api/chess');
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <SubScreen title="Chess Moves" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View>
          <SectionTitle sub="who wins two moves after the headline">The boards</SectionTitle>
          {d.themes.map((t) => {
            const open = openId === t.id;
            return (
              <Pressable key={t.id} onPress={() => setOpenId(open ? null : t.id)}>
                <Card style={{ marginBottom: 10 }}>
                  <View style={s.head}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.title, { color: p.textPrimary }]}>{t.title}</Text>
                      <Text style={[s.anchor, { color: p.textMuted }]} numberOfLines={open ? undefined : 2}>
                        {t.anchor}
                      </Text>
                    </View>
                    <Text style={[s.status, { color: statusColor(t.status, p) }]}>{t.status.toLowerCase()}</Text>
                  </View>
                  {open && t.bottomLine && (
                    <View style={{ marginTop: 10 }}>
                      <MdText body={t.bottomLine} foldAt={800} />
                    </View>
                  )}
                  {t.plays.length > 0 && (
                    <View style={s.chipRow}>
                      {t.plays.map((pl) => (
                        <Pressable
                          key={pl.symbol}
                          onPress={() => router.push(`/stock/${pl.symbol}`)}
                          style={[s.chip, { borderColor: p.cardBorder }]}
                        >
                          <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 11.5 }}>{pl.symbol}</Text>
                        </Pressable>
                      ))}
                      {t.playCount > t.plays.length && (
                        <Text style={[s.morePlays, { color: p.textMuted }]}>+{t.playCount - t.plays.length} more</Text>
                      )}
                    </View>
                  )}
                </Card>
              </Pressable>
            );
          })}
          <Footnote>boards are research, not orders — every play still needs its own dossier + the gate</Footnote>
        </View>
      )}
    </SubScreen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontFamily: F.semi, fontSize: 14, lineHeight: 19 },
  anchor: { fontFamily: F.reg, fontSize: 11, lineHeight: 15, marginTop: 3 },
  status: { fontFamily: F.bold, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  morePlays: { fontFamily: F.reg, fontSize: 10 },
});
