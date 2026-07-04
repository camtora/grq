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
import { useAuth } from '../store/auth';
import { memberFor, otherMember } from '../lib/members';

type ChatMsg = { id: string; role: 'user' | 'assistant'; content: string; author?: string };

/** Ask Alfred — the read-only agent chat (the web's floating bull, as a
 * screen). Reads everything, trades nothing; answers stream in live.
 * Backlog #20: a thread switcher (members can read + post in each other's
 * threads — the API's `owner` param) and symbol-aimed chat (?symbol=… from a
 * stock page adds the FOCUS block: signals + latest journal on that name). */
export default function ChatScreen() {
  const { p, scheme } = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const kbPad = Math.max(0, kb - insets.bottom);
  const me = useAuth((st) => st.me);
  const mine = memberFor(me?.email);
  const other = otherMember(me?.email);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewOther, setViewOther] = useState(false);
  const [aim, setAim] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMsg>>(null);

  // A seeded prompt (?prompt=…) prefills the draft — the Learn hub's starter
  // questions arrive this way. Prefill only; the member still hits send.
  // ?symbol=… (the stock page's bull button) AIMS the chat at that name.
  const { prompt, symbol } = useLocalSearchParams<{ prompt?: string; symbol?: string }>();
  useEffect(() => {
    if (typeof prompt === 'string' && prompt) setDraft(prompt);
  }, [prompt]);
  useEffect(() => {
    if (typeof symbol === 'string' && symbol) setAim(symbol.toUpperCase());
  }, [symbol]);

  // Load whichever thread is in view. Yours by default; the switcher swaps in
  // the other member's (their history, and your sends land in their thread).
  useEffect(() => {
    let dead = false;
    setMessages([]);
    setStatus(null);
    const q = viewOther ? `?owner=${encodeURIComponent(other.email)}` : '';
    api<{ messages: { id: number; role: string; content: string; email: string }[] }>(`/api/chat${q}`)
      .then((t) => {
        if (dead) return;
        setMessages(
          t.messages.map((m) => ({
            id: String(m.id),
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
            author: m.email,
          })),
        );
      })
      .catch(() => {
        if (!dead) setStatus('Could not load the thread — pull down or retry later.');
      });
    return () => {
      dead = true;
    };
  }, [viewOther, other.email]);

  const send = async () => {
    const message = draft.trim();
    if (!message || busy) return;
    setBusy(true);
    setDraft('');
    setMessages((m) => [...m, { id: `u-${m.length}-${message.length}`, role: 'user', content: message, author: me?.email }]);
    setPending('');
    await streamChat(
      {
        message,
        ...(aim ? { symbol: aim } : {}),
        ...(viewOther ? { owner: other.email } : {}),
      },
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

  const threadChip = (active: boolean) => ({
    backgroundColor: active ? p.accent + (scheme === 'dark' ? '2e' : '1f') : 'transparent',
    borderColor: active ? p.accent + '66' : p.cardBorder,
  });

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

      {/* Thread switcher — your conversation or the other member's (both are
          open books in a two-person fund; posting there is you, in their thread). */}
      <View style={s.threadRow}>
        <Pressable
          onPress={() => !busy && setViewOther(false)}
          style={[s.threadChip, threadChip(!viewOther), { opacity: busy && viewOther ? 0.5 : 1 }]}
        >
          <Image source={mine.avatar} style={s.chipAvatar} />
          <Text style={[s.chipText, { color: !viewOther ? p.accentText : p.textMuted }]}>Your thread</Text>
        </Pressable>
        <Pressable
          onPress={() => !busy && setViewOther(true)}
          style={[s.threadChip, threadChip(viewOther), { opacity: busy && !viewOther ? 0.5 : 1 }]}
        >
          <Image source={other.avatar} style={s.chipAvatar} />
          <Text style={[s.chipText, { color: viewOther ? p.accentText : p.textMuted }]}>{other.name}&apos;s</Text>
        </Pressable>
      </View>

      <View style={[s.fill, { paddingBottom: kbPad }]}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.thread}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => {
            const prev = index > 0 ? messages[index - 1] : null;
            const tight = !!prev && prev.role === item.role && prev.author === item.author;
            // Someone else's question (their thread, or them in yours) gets a face.
            const foreign = item.role === 'user' && !!item.author && item.author !== me?.email;
            return (
              <View style={[s.row, item.role === 'user' && s.mineRow, { marginTop: tight ? 2 : 10 }]}>
                {foreign &&
                  (tight ? <View style={s.msgAvatarGap} /> : <Image source={memberFor(item.author).avatar} style={s.msgAvatar} />)}
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
                {viewOther
                  ? `${other.name} hasn't asked Alfred anything yet. Anything you send here lands in ${other.name}'s thread — as you.`
                  : "Ask Alfred anything — the portfolio, a stock, a term you don't know. It reads the whole fund and answers with receipts. It can never place an order from here."}
              </Text>
            ) : null
          }
        />
        {aim && (
          <View style={[s.aimRow, { borderColor: p.accent + '55', backgroundColor: p.accent + (scheme === 'dark' ? '1f' : '14') }]}>
            <Text style={[s.aimText, { color: p.accentText }]}>
              🎯 Aimed at {aim} — Alfred reads its signals + latest journal first
            </Text>
            <Pressable onPress={() => setAim(null)} hitSlop={10}>
              <Ionicons name="close-circle" size={17} color={p.textMuted} />
            </Pressable>
          </View>
        )}
        <View style={[s.inputRow, { borderColor: p.cardBorder, backgroundColor: p.cardBg }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={viewOther ? `Ask in ${other.name}'s thread…` : aim ? `Ask Alfred about ${aim}…` : 'Ask Alfred…'}
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
  threadRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 },
  threadChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipAvatar: { width: 18, height: 18, borderRadius: 9 },
  chipText: { fontFamily: F.semi, fontSize: 11.5 },
  msgAvatar: { width: 20, height: 20, borderRadius: 10, marginRight: 6, alignSelf: 'flex-end', marginBottom: 2 },
  msgAvatarGap: { width: 26 },
  thread: { padding: 16, flexGrow: 1 },
  row: { flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleText: { fontFamily: F.reg, fontSize: 15, lineHeight: 21 },
  status: { fontFamily: F.reg, fontStyle: 'italic', fontSize: 11, textAlign: 'center', marginTop: 10 },
  empty: { fontFamily: F.reg, fontSize: 12.5, textAlign: 'center', marginTop: 40, lineHeight: 19, paddingHorizontal: 12 },
  aimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  aimText: { flex: 1, fontFamily: F.semi, fontSize: 11 },
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
