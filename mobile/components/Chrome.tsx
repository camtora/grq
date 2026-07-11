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
import { useResponsive } from '../constants/layout';
import { useAuth } from '../store/auth';
import { useMessages } from '../store/messages';
import { useNotifications } from '../store/notifications';

/**
 * The chrome (docs/MOBILE-DESIGN.md §3): every tab screen renders inside
 * <Screen title="…">. Logo top-left · centered page title · bell + member
 * avatar top-right. Splash and sign-in are the only chrome-less surfaces.
 */

function avatarFor(email: string | undefined) {
  if (email?.includes('appleby')) return require('../assets/people/graham.png');
  return require('../assets/people/cam.png');
}

/**
 * Centered content column (docs/MOBILE-DESIGN.md §9). On a phone this is a
 * transparent full-width pass-through; on an iPad it caps the width and centers,
 * so cards don't sprawl edge-to-edge and line lengths stay readable. `wide`
 * uses the roomier grid bound (for card grids); default is the reading column.
 */
export function Bounded({
  children,
  wide = false,
  style,
}: {
  children: React.ReactNode;
  wide?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { maxContentWidth, maxGridWidth, gutter } = useResponsive();
  return (
    <View
      style={[
        { width: '100%', maxWidth: wide ? maxGridWidth : maxContentWidth, alignSelf: 'center', paddingHorizontal: gutter },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Responsive card grid (docs/MOBILE-DESIGN.md §9). Lays its children into as
 * many columns of >= `min` width as fit, so it's a single stacked column on a
 * phone and 2–3 up on an iPad. Measures its own width (`onLayout`) rather than
 * guessing, so it's correct inside any container and in iPad Split View. Each
 * child fills its cell — pass items that stretch (most Cards already do).
 */
export function Grid({
  children,
  min = 340,
  gap = 12,
  style,
}: {
  children: React.ReactNode;
  min?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [w, setW] = React.useState(0);
  const items = React.Children.toArray(children).filter(Boolean);
  const cols = w > 0 ? Math.max(1, Math.floor((w + gap) / (min + gap))) : 1;
  const cellW = cols > 1 ? (w - gap * (cols - 1)) / cols : undefined;
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[{ flexDirection: cols > 1 ? 'row' : 'column', flexWrap: 'wrap', gap }, style]}
    >
      {items.map((child, i) => (
        <View key={i} style={cols > 1 ? { width: cellW } : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

/**
 * Column masonry (docs/MOBILE-DESIGN.md §9). Distributes its children across
 * `columns` fixed columns round-robin (child i → column i % columns), so on an
 * iPad a tall stack of independent panels fills two columns instead of one long
 * strip. `columns={1}` is a plain stack (phone). Vertical spacing comes from the
 * panels' own margins; `gap` is the space BETWEEN columns. No height measurement
 * — order zigzags across columns, which is fine for independent reference cards.
 */
export function Masonry({
  children,
  columns = 2,
  gap = 16,
  style,
}: {
  children: React.ReactNode;
  columns?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (columns <= 1) return <View style={style}>{items}</View>;
  const cols: React.ReactNode[][] = Array.from({ length: columns }, () => []);
  items.forEach((child, i) => cols[i % columns].push(child));
  return (
    <View style={[{ flexDirection: 'row', gap }, style]}>
      {cols.map((col, ci) => (
        <View key={ci} style={{ flex: 1, minWidth: 0 }}>
          {col}
        </View>
      ))}
    </View>
  );
}

/** Unread count pill on a header icon (hidden at 0, capped at 9+). */
function CountBadge({ n }: { n: number }) {
  const { p } = usePalette();
  if (n <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: p.neg, borderColor: p.bodyBg }]}>
      <Text style={styles.badgeText}>{n > 9 ? '9+' : n}</Text>
    </View>
  );
}

export function Header({ title }: { title: string }) {
  const { p } = usePalette();
  const { me } = useAuth();
  const { unread, refreshUnread } = useMessages();
  const { unread: bellUnread, refreshUnread: refreshBell } = useNotifications();
  const router = useRouter();

  // Badges — refreshed whenever a screen's chrome mounts (cheap GETs).
  useEffect(() => {
    if (me) {
      refreshUnread();
      refreshBell();
    }
  }, [me, refreshUnread, refreshBell]);

  // The chrome is anchored to the SCREEN edges (bull top-left, bell/chat/avatar
  // top-right), full width — NOT the centered content column (Cam 2026-07-10).
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
            <View>
              <Ionicons name="notifications-outline" size={22} color={p.textMuted} />
              <CountBadge n={bellUnread} />
            </View>
          </Pressable>
          <Pressable onPress={() => router.push('/messages')} hitSlop={8}>
            <View>
              <Ionicons name="chatbubble-outline" size={21} color={p.textMuted} />
              <CountBadge n={unread} />
            </View>
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
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
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  /** Widen the content column for grid/master-detail screens (default: reading
   * column). Wrap any prose inside a plain <Bounded> to keep it readable. */
  wide?: boolean;
}) {
  const { p } = usePalette();
  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: p.bodyBg }]}>
      <Header title={title} />
      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.bodyScroll}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={p.accent} />
            ) : undefined
          }
        >
          <Bounded wide={wide}>{children}</Bounded>
        </ScrollView>
      ) : (
        <View style={[styles.fill, styles.centerCol]}>
          <Bounded wide={wide} style={[styles.fill, styles.bodyPad]}>{children}</Bounded>
        </View>
      )}
    </SafeAreaView>
  );
}

/** Sub-page shell: back bar + centered title (the stock-page pattern), used by
 * every More destination so pushes keep the tab bar and back returns home. */
export function SubScreen({
  title,
  children,
  refreshing,
  onRefresh,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Widen the content column for grid/master-detail screens (default: reading
   * column). Wrap any prose inside a plain <Bounded> to keep it readable. */
  wide?: boolean;
}) {
  const { p } = usePalette();
  const router = useRouter();
  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: p.bodyBg }]}>
      {/* Back bar is anchored to the screen edges, full width — not the content column. */}
      <View style={styles.subBar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.subBack}>
          <Ionicons name="chevron-back" size={22} color={p.accentText} />
          <Text style={{ color: p.accentText, fontFamily: F.med, fontSize: 14 }}>Back</Text>
        </Pressable>
        <Text style={[styles.subTitle, { color: p.textPrimary }]} numberOfLines={1}>{title}</Text>
        <View style={styles.subBack} />
      </View>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.bodyScroll}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={p.accent} />
          ) : undefined
        }
      >
        <Bounded wide={wide}>{children}</Bounded>
      </ScrollView>
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
  centerCol: { alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 16,
  },
  side: { width: 104, flexDirection: 'row', alignItems: 'center', gap: 13 },
  badge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#ffffff', fontFamily: F.bold, fontSize: 9, lineHeight: 11 },
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
  title: { flex: 1, textAlign: 'center', fontFamily: 'System', fontWeight: '800', fontSize: 17 },
  avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1 },
  bodyScroll: { paddingTop: 8, paddingBottom: 32, alignItems: 'center' },
  bodyPad: { paddingTop: 8, paddingBottom: 32 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  section: {
    fontFamily: 'System',
    fontWeight: '800',
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
  subBar: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 12 },
  subBack: { flexDirection: 'row', alignItems: 'center', width: 70 },
  subTitle: { flex: 1, textAlign: 'center', fontFamily: 'System', fontWeight: '800', fontSize: 17 },
});
