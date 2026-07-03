import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import StockLogo from '../components/StockLogo';
import { usePalette, F } from '../constants/theme';
import { api } from '../services/api';
import { useMessages } from '../store/messages';
import type { DirectMessage, DirectThread } from '../services/types';

/** The Cam↔Graham thread (D61) — distinct from the read-only agent chat.
 * Sends push to the other member; shares carry a symbol chip that deep-links
 * to the dossier. Polls ?since while open; marks read on open. */
export default function MessagesScreen() {
  const { p } = usePalette();
  const router = useRouter();
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

      <KeyboardAvoidingView
        style={s.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={s.thread}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => <Bubble m={item} />}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ m }: { m: DirectMessage }) {
  const { p } = usePalette();
  const router = useRouter();
  const time = m.at.slice(11, 16);
  return (
    <View style={[s.bubbleRow, m.mine ? s.mineRow : null]}>
      <View
        style={[
          s.bubble,
          m.mine
            ? { backgroundColor: p.accent + '26', borderColor: p.accent + '33' }
            : { backgroundColor: p.cardBg, borderColor: p.cardBorder },
        ]}
      >
        {m.symbol && (
          <Pressable
            onPress={() => router.push(`/stock/${m.symbol}`)}
            style={[s.shareChip, { borderColor: p.cardBorder, backgroundColor: p.cardHi }]}
          >
            <StockLogo symbol={m.symbol} logoUrl={null} size={22} />
            <Text style={{ color: p.accentText, fontFamily: F.bold, fontSize: 13 }}>{m.symbol}</Text>
            {m.panelLabel && (
              <Text style={{ color: p.textMuted, fontFamily: F.reg, fontSize: 11 }}>· {m.panelLabel}</Text>
            )}
            <Text style={{ color: p.textMuted, fontFamily: F.reg, fontSize: 11, marginLeft: 'auto' }}>open →</Text>
          </Pressable>
        )}
        {m.body ? (
          <Text style={[s.bubbleText, { color: p.textPrimary }]}>{m.body}</Text>
        ) : null}
        <Text style={[s.bubbleMeta, { color: p.textMuted }]}>
          {time}
          {m.mine && m.readAt ? ' · read' : ''}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 12 },
  back: { flexDirection: 'row', alignItems: 'center', width: 70 },
  barTitle: { flex: 1, textAlign: 'center', fontFamily: F.display, fontSize: 17 },
  thread: { padding: 16, gap: 8, flexGrow: 1 },
  empty: { fontFamily: F.reg, fontSize: 12.5, textAlign: 'center', marginTop: 40, lineHeight: 18 },
  bubbleRow: { flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleText: { fontFamily: F.reg, fontSize: 14, lineHeight: 20 },
  bubbleMeta: { fontFamily: F.reg, fontSize: 9, marginTop: 4, opacity: 0.7 },
  shareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 6,
    minWidth: 170,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  input: { flex: 1, fontFamily: F.reg, fontSize: 14, maxHeight: 110, paddingTop: 2 },
});
