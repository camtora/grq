import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePalette, F } from '../constants/theme';
import { useAuth } from '../store/auth';
import { useMessages } from '../store/messages';

/**
 * The chrome (docs/MOBILE-DESIGN.md §3): every tab screen renders inside
 * <Screen title="…">. Logo top-left · centered page title · bell + member
 * avatar top-right. Splash and sign-in are the only chrome-less surfaces.
 */

function avatarFor(email: string | undefined) {
  if (email?.includes('appleby')) return require('../assets/people/graham.png');
  return require('../assets/people/cam.png');
}

export function Header({ title }: { title: string }) {
  const { p, scheme } = usePalette();
  const { me, signOut } = useAuth();
  const { unread, refreshUnread } = useMessages();
  const router = useRouter();

  // The DM badge — refreshed whenever a screen's chrome mounts (cheap GET).
  useEffect(() => {
    if (me) refreshUnread();
  }, [me, refreshUnread]);

  const onAvatar = () => {
    Alert.alert(
      me?.name ? `Signed in as ${me.name}` : 'Signed in',
      me?.email ?? '',
      [
        { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
        { text: 'Close', style: 'cancel' },
      ],
    );
  };

  return (
    <View style={[styles.header, { backgroundColor: p.bodyBg }]}>
      <View style={styles.side}>
        {/* The bull = talk to the agent (the web's floating launcher, moved up
            here — Cam 2026-07-03). Opens the member's Ask Alfred thread. */}
        <Pressable onPress={() => router.push('/chat')} hitSlop={8}>
          <View style={[styles.bull, { backgroundColor: p.cardBg, borderColor: p.accent + '66' }]}>
            <Image source={require('../assets/bull-splash.png')} style={styles.bullImg} resizeMode="contain" />
          </View>
        </Pressable>
      </View>
      <Text style={[styles.title, { color: p.textPrimary }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>
        <Pressable onPress={() => router.push('/notifications')} hitSlop={8}>
          <Ionicons name="notifications-outline" size={22} color={p.textMuted} />
        </Pressable>
        <Pressable onPress={() => router.push('/messages')} hitSlop={8}>
          <View>
            <Ionicons name="chatbubble-outline" size={21} color={p.textMuted} />
            {unread > 0 && <View style={[styles.badge, { backgroundColor: p.neg, borderColor: p.bodyBg }]} />}
          </View>
        </Pressable>
        <Pressable onPress={onAvatar} hitSlop={8}>
          <Image
            source={avatarFor(me?.email)}
            style={[styles.avatar, { borderColor: p.accent + '73' }]}
          />
        </Pressable>
      </View>
    </View>
  );
}

export function Screen({
  title,
  children,
  refreshing,
  onRefresh,
  scroll = true,
}: {
  title: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
}) {
  const { p } = usePalette();
  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: p.bodyBg }]}>
      <Header title={title} />
      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.body}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={p.accent} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, styles.body]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** The one panel surface (docs/MOBILE-DESIGN.md §4). */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { p } = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: p.cardBg, borderColor: p.cardBorder }, style]}>
      {children}
    </View>
  );
}

/** Section header — uppercase title + optional lighter descriptor, outside the card. */
export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  const { p } = usePalette();
  return (
    <Text style={[styles.section, { color: p.textPrimary }]}>
      {children}
      {sub ? <Text style={[styles.sectionSub, { color: p.textMuted }]}>{'  '}{sub}</Text> : null}
    </Text>
  );
}

/** Muted footnote under a card (the web's tiny explainer line). */
export function Footnote({ children }: { children: React.ReactNode }) {
  const { p } = usePalette();
  return <Text style={[styles.footnote, { color: p.textMuted }]}>{children}</Text>;
}

/** Small uppercase per-column/per-group label above a card (under a SectionTitle). */
export function MiniLabel({ children }: { children: React.ReactNode }) {
  const { p } = usePalette();
  return <Text style={[styles.miniLabel, { color: p.textMuted }]}>{children}</Text>;
}

/** Segmented toggle — the house two-way switch (docs/MOBILE-DESIGN.md §4). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { p } = usePalette();
  return (
    <View style={[styles.seg, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.segItem, active && { backgroundColor: p.accent + '26' }]}
          >
            <Text
              style={{
                fontFamily: active ? F.semi : F.med,
                fontSize: 13,
                color: active ? p.accentText : p.textMuted,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Hairline list divider inside cards. */
export function Divider() {
  const { p } = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.cardBorder }} />;
}

export function Loading() {
  const { p } = usePalette();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={p.accent} />
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  const { p } = usePalette();
  return (
    <Card>
      <Text style={{ color: p.neg, fontFamily: F.med, fontSize: 13 }}>{message}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 16,
  },
  side: { width: 104, flexDirection: 'row', alignItems: 'center', gap: 13 },
  badge: { position: 'absolute', top: -2, right: -3, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
  right: { justifyContent: 'flex-end' },
  bull: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#14b8a6',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  bullImg: { width: 22, height: 22 },
  title: { flex: 1, textAlign: 'center', fontFamily: F.display, fontSize: 17 },
  avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1 },
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  section: {
    fontFamily: F.bold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 24,
  },
  sectionSub: {
    fontFamily: F.reg,
    fontSize: 12,
    textTransform: 'none',
    letterSpacing: 0,
  },
  footnote: { fontSize: 10, marginTop: 6, paddingHorizontal: 2, opacity: 0.8 },
  loading: { paddingVertical: 48, alignItems: 'center' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9 },
  miniLabel: { fontFamily: F.semi, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 2, paddingHorizontal: 2 },
});
