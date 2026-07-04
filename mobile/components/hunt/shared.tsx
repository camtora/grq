import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import ShareButton from '../ShareButton';
import { usePalette, F, type Palette } from '../../constants/theme';
import { api } from '../../services/api';
import type { HuntFind } from '../../services/types';

/** Shared bits across the three Hunt layouts (web components/hunt/shared +
 * the WatchButton/DismissButton client islands, phone-sized). */

const AVATARS: Record<string, number> = {
  cam: require('../../assets/people/cam.png'),
  graham: require('../../assets/people/graham.png'),
};

/** Overlapping member faces — who's watching a find (web AvatarStack). */
export function WatcherStack({ watchers, size = 20 }: { watchers: { key: string; name: string }[]; size?: number }) {
  const { p } = usePalette();
  const known = watchers.filter((w) => AVATARS[w.key]);
  if (!known.length) return null;
  return (
    <View style={s.stack}>
      {known.map((w, i) => (
        <Image
          key={w.key}
          source={AVATARS[w.key]}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.5,
            borderColor: p.cardBg,
            marginLeft: i > 0 ? -size / 3 : 0,
          }}
        />
      ))}
    </View>
  );
}

/** The find's action row — dossier CTA + watch + share (+ optional dismiss),
 * mirroring the web's HuntRow/HuntHero action stacks. `onChanged` refetches the
 * feed; a dismissed find is dropped by the screen. */
export function FindActions({
  find,
  p,
  onChanged,
  onDismissed,
  withDismiss = false,
  iconOnly = false,
}: {
  find: HuntFind;
  p: Palette;
  onChanged: () => void;
  onDismissed?: (sym: string) => void;
  withDismiss?: boolean;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [watching, setWatching] = useState(find.watch !== 'none');
  const [busy, setBusy] = useState(false);

  const doWatch = async () => {
    if (busy || watching) return;
    setBusy(true);
    try {
      await api('/api/universe', { method: 'POST', body: JSON.stringify({ action: 'add', symbol: find.sym }) });
      setWatching(true);
      onChanged();
    } catch (e) {
      Alert.alert('Watch', e instanceof Error ? e.message : 'Could not watch it.');
    } finally {
      setBusy(false);
    }
  };

  const doDismiss = () => {
    Alert.alert(`Dismiss ${find.sym}?`, "Marks it Retired so the hunt won't resurface it.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dismiss',
        style: 'destructive',
        onPress: async () => {
          try {
            await api('/api/universe', {
              method: 'POST',
              body: JSON.stringify({ action: 'dismiss', symbol: find.sym, name: find.name }),
            });
            onDismissed?.(find.sym);
            onChanged();
          } catch (e) {
            Alert.alert('Dismiss', e instanceof Error ? e.message : 'Could not dismiss it.');
          }
        },
      },
    ]);
  };

  return (
    <View style={s.actions}>
      <Pressable onPress={() => router.push(`/stock/${find.sym}`)} style={[s.cta, { backgroundColor: p.accent + '26' }]}>
        <Text style={[s.ctaText, { color: p.accentText }]}>{iconOnly ? 'dossier' : 'full dossier →'}</Text>
      </Pressable>
      {(find.watchers?.length ?? 0) > 0 && <WatcherStack watchers={find.watchers!} />}
      {/* in the universe → no watch control (it's promoted, not "being watched") */}
      {find.watch === 'none' && (
        <Pressable onPress={doWatch} disabled={busy || watching} style={[s.cta, { backgroundColor: p.cardHi }]}>
          <Text style={[s.ctaText, { color: watching ? p.textMuted : p.accentText }]}>
            {watching ? '👀 watched' : busy ? '…' : '＋ watch'}
          </Text>
        </Pressable>
      )}
      <ShareButton symbol={find.sym} />
      {withDismiss && (
        <Pressable onPress={doDismiss} hitSlop={6} style={{ marginLeft: 'auto' }}>
          <Text style={[s.dismiss, { color: p.textMuted }]}>✕ dismiss</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  stack: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cta: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  ctaText: { fontFamily: F.semi, fontSize: 12 },
  dismiss: { fontFamily: F.semi, fontSize: 11 },
});
