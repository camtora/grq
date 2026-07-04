import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../Chrome';
import { F, type Palette } from '../../constants/theme';
import { api } from '../../services/api';

const RECONNECT_POLL_MS = 15_000;
const RECONNECT_GIVE_UP_MS = 4 * 60_000;

/** Broken SnapTrade link: the one-tap fix (web ReconnectButton parity — D107).
 * The portal opens in Safari, so the postMessage channel the web uses doesn't
 * exist here — the LIVE authorization flag is the only honest signal. Poll
 * /api/external/status every 15s (and immediately on returning to the app);
 * on the flip, pull fresh holdings and reload. TD drops links every day or two
 * by design (SnapTrade's own portal copy), so this is a recurring chore. */
export default function ReconnectBanner({
  authorizationId,
  syncedAt,
  p,
  onFixed,
}: {
  authorizationId: string | null; // null until the server sends it → fix-on-web hint instead
  syncedAt: string | null;
  p: Palette;
  onFixed: () => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'opening' | 'waiting' | 'done' | 'stuck' | 'error'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const succeed = async () => {
    if (phaseRef.current === 'done') return;
    setPhase('done');
    setMsg(null);
    await api('/api/external/sync', { method: 'POST' }).catch(() => {});
    onFixed();
  };

  const checkFlip = async () => {
    try {
      const d = await api<{ connections?: { id: string; disabled: boolean }[] }>('/api/external/status');
      const mine = d.connections?.find((c) => c.id === authorizationId);
      if (mine && !mine.disabled) void succeed();
    } catch {
      /* transient — next poll */
    }
  };

  useEffect(() => {
    if (phase !== 'waiting') return;
    const poll = setInterval(checkFlip, RECONNECT_POLL_MS);
    const giveUp = setTimeout(() => {
      if (phaseRef.current === 'waiting') {
        setPhase('stuck');
        setMsg("SnapTrade's TD re-login is stuck (their job, not this app). Fix it in their dashboard — we'll spot the fix automatically.");
      }
    }, RECONNECT_GIVE_UP_MS);
    // Coming back from Safari is the moment the flip most likely landed.
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void checkFlip();
    });
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const reconnect = async () => {
    setMsg(null);
    setPhase('opening');
    try {
      const d = await api<{ url?: string; error?: string }>('/api/external/connect', {
        method: 'POST',
        body: JSON.stringify({ reconnect: authorizationId }),
      });
      if (!d.url) throw new Error(d.error ?? "Couldn't start the reconnect.");
      await Linking.openURL(d.url);
      setPhase('waiting');
    } catch (e) {
      setPhase('error');
      setMsg(e instanceof Error ? e.message : "Couldn't start the reconnect.");
    }
  };

  if (phase === 'done') {
    return (
      <Card style={[s.reconnectCard, { borderColor: p.pos + '55' }]}>
        <Text style={[s.reconnectText, { color: p.pos }]}>Reconnected ✓ syncing fresh holdings…</Text>
      </Card>
    );
  }

  return (
    <Card style={[s.reconnectCard, { borderColor: p.neg + '55' }]}>
      <Text style={[s.reconnectText, { color: p.textPrimary }]}>
        <Text style={{ fontFamily: F.semi }}>Your brokerage link is down</Text> — TD drops it every day or
        two, by design. Holdings below are as of {syncedAt ?? 'the last sync'}.
      </Text>
      <View style={s.reconnectRow}>
        {authorizationId ? (
          <Pressable
            onPress={reconnect}
            disabled={phase === 'opening' || phase === 'waiting'}
            style={[s.reconnectBtn, { backgroundColor: p.neg + '1f', borderColor: p.neg + '55', opacity: phase === 'opening' || phase === 'waiting' ? 0.6 : 1 }]}
          >
            <Text style={[s.reconnectBtnText, { color: p.neg }]}>
              {phase === 'opening' ? 'Opening…' : phase === 'waiting' ? 'Waiting on SnapTrade…' : '⚡ Reconnect'}
            </Text>
          </Pressable>
        ) : (
          <Text style={[s.reconnectHint, { color: p.textMuted }]}>
            fix it with ⚡ Reconnect on the web Accounts page — this app gets the one-tap fix on the next server update
          </Text>
        )}
        {phase === 'waiting' && (
          <Text style={[s.reconnectHint, { color: p.textMuted }]}>
            finish in Safari — TD can take a minute; this flips green by itself
          </Text>
        )}
      </View>
      {msg && (
        <Text style={[s.reconnectHint, { color: p.neg, marginTop: 6 }]}>
          {msg}{' '}
          <Text
            style={{ color: p.accentText, textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL('https://dashboard.snaptrade.com/home?personal')}
          >
            SnapTrade dashboard ↗
          </Text>
        </Text>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  reconnectCard: { marginTop: 14, borderWidth: 1 },
  reconnectText: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18 },
  reconnectRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  reconnectBtn: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  reconnectBtnText: { fontFamily: F.semi, fontSize: 12 },
  reconnectHint: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 14, flex: 1, minWidth: 140 },
});
