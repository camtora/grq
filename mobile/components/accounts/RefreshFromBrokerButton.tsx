import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text } from 'react-native';
import { F, type Palette } from '../../constants/theme';
import { api } from '../../services/api';

const POLL_MS = 12_000;
const GIVE_UP_MS = 4 * 60_000;

/** "Refresh from broker" (web RefreshFromBrokerButton parity) — the FREE force-fresh on the
 * SnapTrade free tier. SnapTrade's paid manual-refresh 402s on our Personal keys, but
 * re-running the Connection Portal (a broker RE-LOGIN) makes SnapTrade re-pull holdings on
 * (re)connection at no charge. So this opens the SAME reconnect portal ⚡ Reconnect uses
 * (Linking, NOT expo-web-browser — the missing native module hard-crashes), then polls
 * /api/external/status for THIS connection's `syncMs` to advance past a pre-login baseline —
 * the healthy-link analogue of ⚡ Reconnect's disabled→enabled flip. Cost: one broker
 * re-login (~1 min). Whether a HEALTHY link re-pulls is UNVERIFIED — the give-up message is
 * honest about that. (Cam 2026-07-06 — point the resync button at the reconnect endpoint.) */
export default function RefreshFromBrokerButton({
  authorizationId,
  syncedAt,
  disabled,
  p,
  onDone,
}: {
  authorizationId: string;
  syncedAt: string | null; // baseline fallback if the live status read fails
  disabled?: boolean;
  p: Palette;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'opening' | 'waiting' | 'done' | 'stuck' | 'error'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const baselineRef = useRef(0); // SnapTrade pull time BEFORE the re-login — success = past this

  // Live holdings-pull time for THIS authorization (0 unknown, null on a failed read).
  const liveSyncMs = async (): Promise<number | null> => {
    try {
      const d = await api<{ connections?: { id: string; syncMs?: number }[] }>('/api/external/status');
      const mine = d.connections?.find((c) => c.id === authorizationId);
      return mine ? (mine.syncMs ?? 0) : null;
    } catch {
      return null;
    }
  };

  const succeed = async () => {
    if (phaseRef.current === 'done') return;
    setPhase('done');
    setMsg(null);
    await api('/api/external/sync', { method: 'POST' }).catch(() => {});
    onDone();
  };

  const checkFresh = async () => {
    const now = await liveSyncMs();
    if (now != null && now > baselineRef.current) void succeed();
  };

  useEffect(() => {
    if (phase !== 'waiting') return;
    const poll = setInterval(checkFresh, POLL_MS);
    const giveUp = setTimeout(() => {
      if (phaseRef.current === 'waiting') {
        setPhase('stuck');
        setMsg(
          "Re-logged in, but no fresh pull landed yet — SnapTrade's free plan may not re-pull a healthy link on demand. It'll still refresh on the daily sync.",
        );
      }
    }, GIVE_UP_MS);
    // Coming back from Safari is the moment the fresh pull most likely landed.
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void checkFresh();
    });
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const start = async () => {
    setMsg(null);
    setPhase('opening');
    // Baseline = the CURRENT live pull time, so only a genuinely NEW pull counts as success
    // (fall back to our mirror's last sync if the live read fails).
    const live = await liveSyncMs();
    baselineRef.current = live ?? (syncedAt ? Date.parse(syncedAt) || 0 : 0);
    try {
      const d = await api<{ url?: string; error?: string }>('/api/external/connect', {
        method: 'POST',
        body: JSON.stringify({ reconnect: authorizationId, appReturn: true }),
      });
      if (!d.url) throw new Error(d.error ?? "Couldn't start the refresh.");
      setPhase('waiting');
      // Same as ⚡ Reconnect: open the portal via Linking (expo-web-browser hard-crashes);
      // the server's appReturn returns the member to grqgo://accounts, and the poll +
      // AppState-active checkFresh detect the fresh pull.
      await Linking.openURL(d.url);
      void checkFresh();
    } catch (e) {
      setPhase('error');
      setMsg(e instanceof Error ? e.message : "Couldn't start the refresh.");
    }
  };

  const busy = phase === 'opening' || phase === 'waiting';
  const label =
    phase === 'done'
      ? 'Fresh pull ✓ syncing…'
      : phase === 'opening'
        ? 'Opening…'
        : phase === 'waiting'
          ? 'Waiting on broker…'
          : '⟳ Refresh from broker';

  // A Fragment so this sits INLINE in the controls row (left of "Open SnapTrade"); the
  // status hint/message carry width:'100%' so they wrap onto the line BELOW the buttons.
  return (
    <>
      <Pressable
        onPress={start}
        disabled={disabled || busy || phase === 'done'}
        style={[
          s.btn,
          {
            borderColor: p.accent + '80',
            backgroundColor: p.accent + '26',
            opacity: disabled || busy ? 0.5 : 1,
          },
        ]}
      >
        <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 12 }}>{label}</Text>
      </Pressable>
      {phase === 'waiting' && (
        <Text style={[s.hint, { color: p.textMuted }]}>
          finish the login in Safari — this confirms itself when fresh holdings land
        </Text>
      )}
      {msg && (
        <Text style={[s.hint, { color: phase === 'error' ? p.neg : p.textMuted }]}>
          {msg}{' '}
          <Text
            style={{ color: p.accentText, textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL('https://dashboard.snaptrade.com/home?personal')}
          >
            SnapTrade dashboard ↗
          </Text>
        </Text>
      )}
    </>
  );
}

const s = StyleSheet.create({
  btn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  hint: { width: '100%', fontFamily: F.reg, fontSize: 10.5, lineHeight: 14 },
});
