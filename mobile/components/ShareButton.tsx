import React, { useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePalette } from '../constants/theme';
import { api } from '../services/api';
import { useAuth } from '../store/auth';

/** Share a stock with the other member (D61/D59) — lands in the DM thread as a
 * symbol chip and pushes their phone. iOS Alert.prompt lets a note ride along. */
export default function ShareButton({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const { p } = usePalette();
  const me = useAuth((s) => s.me);
  const [busy, setBusy] = useState(false);
  const other = me?.email?.includes('appleby') ? 'Cam' : 'Graham';

  const send = async (note?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await api('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ symbol, body: note?.trim() || undefined }),
      });
      Alert.alert(`Sent to ${other}`, `${symbol} is in your thread.`);
    } catch (e) {
      Alert.alert('Share failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onPress = () => {
    Alert.prompt(
      `Share ${symbol} with ${other}`,
      'Add a note (optional)',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Share', onPress: (note?: string) => send(note) },
      ],
      'plain-text',
    );
  };

  return (
    <Pressable onPress={onPress} hitSlop={8} disabled={busy} style={{ opacity: busy ? 0.5 : 1 }}>
      <Ionicons name="paper-plane-outline" size={size} color={p.accentText} />
    </Pressable>
  );
}
