import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import StockLogo from '../components/StockLogo';
import { usePalette, F } from '../constants/theme';
import { api } from '../services/api';
import { useKeyboardHeight } from '../services/hooks';
import { useMessages } from '../store/messages';
import type { DirectMessage, DirectThread } from '../services/types';

/** The Cam↔Graham thread (D61) — distinct from the read-only agent chat.
 * Sends push to the other member; shares carry a symbol chip that deep-links
 * to the dossier. Polls ?since while open; marks read on open. */
export default function MessagesScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const kbPad = Math.max(0, kb - insets.bottom);
  const setUnread = useMessages((s) => s.setUnread);
  const [messages, setMessagesState] = useState<DirectMessage[]>([]);
  const [otherName, setOtherName] = useState('your partner');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<DirectMessage>>(null);
  const lastId = useRef(0);

  const applyRows = useCallback((rows: DirectMessage[]) => {
    if (!rows.length) return;
    setMessagesState((prev) => {
      const have = new Set(prev.map((m) => m.id));
      const merged = [...prev, ...rows.filter((r) => !have.has(r.id))];
      merged.sort((a, b) => a.id - b.id);
      lastId.current = merged[merged.length - 1]?.id ?? lastId.current;
      return merged;
    });
  }, []);

  // Initial load + mark read + zero the badge; then poll for new rows.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await api<DirectThread & { otherName?: string }>('/api/messages');
        if (!alive) return;
        applyRows(t.messages);
        if (t.otherName) setOtherName(t.otherName);
        await api('/api/messages/read', { method: 'POST', body: '{}' }).catch(() => null);
        setUnread(0);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the thread.');
      }
    })();
    const poll = setInterval(async () => {
      try {
        const t = await api<DirectThread>(`/api/messages?since=${lastId.current}`);
        if (!alive) return;
        if (t.messages.length) {
          applyRows(t.messages);
          await api('/api/messages/read', { method: 'POST', body: '{}' }).catch(() => null);
          setUnread(0);
        }
      } catch {
        /* next poll retries */
      }
    }, 10_000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [applyRows, setUnread]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await api('/api/messages', { method: 'POST', body: JSON.stringify({ body: text }) });
      setDraft('');
      // Pull the row we just wrote (and anything else new) immediately.
      const t = await api<DirectThread>(`/api/messages?since=${lastId.current}`).catch(() => null);
      if (t?.messages.length) applyRows(t.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[s.fill, { backgroundColor: p.bodyBg }]}>
      <View style={s.bar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={p.accentText} />
          <Text style={{ color: p.accentText, fontFamily: F.med, fontSize: 14 }}>back</Text>
        </Pressable>
        <Text style={[s.barTitle, { color: p.textPrimary }]}>{otherName}</Text>
        <View style={s.back} />
      </View>

      <View style={[s.fill, { paddingBottom: kbPad }]}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={s.thread}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => {
            const prev = index > 0 ? messages[index - 1] : null;
            const next = index < messages.length - 1 ? messages[index + 1] : null;
            // A quiet time label when the conversation pauses (>20 min).
            const gap = !prev || Date.parse(item.at) - Date.parse(prev.at) > 20 * 60_000;
            // Cluster consecutive messages from the same side.
            const sameAsPrev = !!prev && prev.mine === item.mine && !gap;
            // "read" only under my LAST read message.
            const lastRead =
              item.mine && !!item.readAt && !messages.slice(index + 1).some((m) => m.mine && m.readAt);
            return (
              <View>
                {gap && (
                  <Text style={[s.timeLabel, { color: p.textMuted }]}>{timeLabel(item.at)}</Text>
                )}
                <Bubble m={item} tight={sameAsPrev} lastRead={lastRead} lastOfCluster={!next || next.mine !== item.mine} />
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={[s.empty, { color: p.textMuted }]}>
              {error ?? `No messages yet — say something, or share a stock from its page.`}
            </Text>
          }
        />
        <View style={[s.inputRow, { borderColor: p.cardBorder, backgroundColor: p.cardBg }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${otherName}…`}
            placeholderTextColor={p.textMuted + '99'}
            multiline
            style={[s.input, { color: p.textPrimary }]}
          />
          <Pressable onPress={send} disabled={sending || !draft.trim()} hitSlop={8}>
            <Ionicons
              name="arrow-up-circle"
              size={30}
              color={draft.trim() && !sending ? p.accent : p.textMuted + '66'}
            />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return today ? time : `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${time}`;
}

function Bubble({
  m,
  tight,
  lastRead,
  lastOfCluster,
}: {
  m: DirectMessage;
  tight: boolean;
  lastRead: boolean;
  lastOfCluster: boolean;
}) {
  const { p, scheme } = usePalette();
  const router = useRouter();
  // Mine = a light accent tint; theirs = a quiet raised surface. No borders,
  // no per-bubble clutter. (Cam 2026-07-03: mine lighter, not solid.)
  return (
    <View style={[s.bubbleRow, m.mine && s.mineRow, { marginTop: tight ? 2 : 10 }]}>
      <View
        style={[
          s.bubble,
          m.mine
            ? { backgroundColor: p.accent + (scheme === 'dark' ? '2b' : '24') }
            : { backgroundColor: scheme === 'dark' ? p.cardHi : '#e2edeb' },
        ]}
      >
        {m.symbol && (
          <Pressable
            onPress={() => router.push(`/stock/${m.symbol}`)}
            style={[s.shareChip, { backgroundColor: m.mine ? p.accent + '1f' : p.cardBg }]}
          >
            <StockLogo symbol={m.symbol} logoUrl={null} size={22} />
            <Text style={{ color: p.accentText, fontFamily: F.bold, fontSize: 13 }}>
              {m.symbol}
            </Text>
            <Text style={{ color: p.textMuted, fontFamily: F.reg, fontSize: 11, marginLeft: 'auto', opacity: 0.75 }}>
              open →
            </Text>
          </Pressable>
        )}
        {m.body ? (
          <Text style={[s.bubbleText, { color: p.textPrimary }]}>{m.body}</Text>
        ) : null}
      </View>
      {lastRead && lastOfCluster && (
        <Text style={[s.readReceipt, { color: p.textMuted }]}>read</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 12 },
  back: { flexDirection: 'row', alignItems: 'center', width: 70 },
  barTitle: { flex: 1, textAlign: 'center', fontFamily: 'System', fontWeight: '800', fontSize: 17 },
  thread: { padding: 16, flexGrow: 1 },
  empty: { fontFamily: F.reg, fontSize: 12.5, textAlign: 'center', marginTop: 40, lineHeight: 18 },
  timeLabel: { fontFamily: F.med, fontSize: 10, textAlign: 'center', marginTop: 16, marginBottom: 2, opacity: 0.7 },
  bubbleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  mineRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleText: { fontFamily: F.reg, fontSize: 15, lineHeight: 21 },
  readReceipt: { fontFamily: F.med, fontSize: 9.5, width: '100%', textAlign: 'right', marginTop: 3, opacity: 0.7 },
  shareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginVertical: 3,
    minWidth: 170,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  input: { flex: 1, fontFamily: F.reg, fontSize: 15, maxHeight: 110, paddingVertical: 5 },
});
