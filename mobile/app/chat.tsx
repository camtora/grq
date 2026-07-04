import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MdText from '../components/MdText';
import { usePalette, F } from '../constants/theme';
import { api, streamChat } from '../services/api';
import { useKeyboardHeight } from '../services/hooks';

type ChatMsg = { id: string; role: 'user' | 'assistant'; content: string };

/** Ask Alfred — the read-only agent chat (the web's floating bull, as a
 * screen). Reads everything, trades nothing; answers stream in live. */
export default function ChatScreen() {
  const { p, scheme } = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const kbPad = Math.max(0, kb - insets.bottom);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<ChatMsg>>(null);

  // A seeded prompt (?prompt=…) prefills the draft — the Learn hub's starter
  // questions arrive this way. Prefill only; the member still hits send.
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  useEffect(() => {
    if (typeof prompt === 'string' && prompt) setDraft(prompt);
  }, [prompt]);

  useEffect(() => {
    api<{ messages: { id: number; role: string; content: string }[] }>('/api/chat')
      .then((t) =>
        setMessages(
          t.messages.map((m) => ({
            id: String(m.id),
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          })),
        ),
      )
      .catch(() => setStatus('Could not load the thread — pull down or retry later.'));
  }, []);

  const send = async () => {
    const message = draft.trim();
    if (!message || busy) return;
    setBusy(true);
    setDraft('');
    setMessages((m) => [...m, { id: `u-${m.length}-${message.length}`, role: 'user', content: message }]);
    setPending('');
    await streamChat(
      { message },
      {
        onText: setPending,
        onStatus: setStatus,
        onError: (e) => setStatus(`⚠️ ${e}`),
        onDone: (finalText) => {
          if (finalText) {
            setMessages((m) => [...m, { id: `a-${m.length}-${finalText.length}`, role: 'assistant', content: finalText }]);
          }
          setPending(null);
          setStatus(null);
          setBusy(false);
        },
      },
    );
  };

  const bubbleFor = (role: 'user' | 'assistant') =>
    role === 'user'
      ? { backgroundColor: p.accent + (scheme === 'dark' ? '2b' : '24') }
      : { backgroundColor: scheme === 'dark' ? p.cardHi : '#e2edeb' };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[s.fill, { backgroundColor: p.bodyBg }]}>
      <View style={s.bar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={p.accentText} />
          <Text style={{ color: p.accentText, fontFamily: F.med, fontSize: 14 }}>back</Text>
        </Pressable>
        <View style={s.titleWrap}>
          <Image source={require('../assets/bull-splash.png')} style={s.titleBull} resizeMode="contain" />
          <Text style={[s.barTitle, { color: p.textPrimary }]}>Ask Alfred</Text>
        </View>
        <View style={s.back} />
      </View>
      <Text style={[s.honesty, { color: p.textMuted }]}>reads everything · trades nothing</Text>

      <View style={[s.fill, { paddingBottom: kbPad }]}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.thread}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => {
            const prev = index > 0 ? messages[index - 1] : null;
            const tight = !!prev && prev.role === item.role;
            return (
              <View style={[s.row, item.role === 'user' && s.mineRow, { marginTop: tight ? 2 : 10 }]}>
                <View style={[s.bubble, bubbleFor(item.role)]}>
                  {item.role === 'assistant' ? (
                    <MdText body={item.content} foldAt={1400} />
                  ) : (
                    <Text style={[s.bubbleText, { color: p.textPrimary }]}>{item.content}</Text>
                  )}
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            <View>
              {pending !== null && (
                <View style={[s.row, { marginTop: 10 }]}>
                  <View style={[s.bubble, bubbleFor('assistant')]}>
                    {pending ? (
                      <MdText body={pending} foldAt={100_000} />
                    ) : (
                      <Text style={[s.bubbleText, { color: p.textMuted }]}>…</Text>
                    )}
                  </View>
                </View>
              )}
              {status && <Text style={[s.status, { color: p.textMuted }]}>{status}</Text>}
            </View>
          }
          ListEmptyComponent={
            pending === null ? (
              <Text style={[s.empty, { color: p.textMuted }]}>
                Ask Alfred anything — the portfolio, a stock, a term you don't know. It reads the
                whole fund and answers with receipts. It can never place an order from here.
              </Text>
            ) : null
          }
        />
        <View style={[s.inputRow, { borderColor: p.cardBorder, backgroundColor: p.cardBg }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask Alfred…"
            placeholderTextColor={p.textMuted + '99'}
            multiline
            style={[s.input, { color: p.textPrimary }]}
          />
          <Pressable onPress={send} disabled={busy || !draft.trim()} hitSlop={8}>
            <Ionicons
              name="arrow-up-circle"
              size={30}
              color={draft.trim() && !busy ? p.accent : p.textMuted + '66'}
            />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 12 },
  back: { flexDirection: 'row', alignItems: 'center', width: 70 },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  titleBull: { width: 24, height: 24 },
  barTitle: { fontFamily: 'System', fontWeight: '800', fontSize: 17 },
  honesty: { fontFamily: F.semi, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, textAlign: 'center', opacity: 0.7 },
  thread: { padding: 16, flexGrow: 1 },
  row: { flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleText: { fontFamily: F.reg, fontSize: 15, lineHeight: 21 },
  status: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 11, textAlign: 'center', marginTop: 10 },
  empty: { fontFamily: F.reg, fontSize: 12.5, textAlign: 'center', marginTop: 40, lineHeight: 19, paddingHorizontal: 12 },
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
