import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Divider, Loading, ErrorNote } from '../components/Chrome';
import ReconnectBanner from '../components/accounts/ReconnectBanner';
import StockLogo from '../components/StockLogo';
import { usePalette, F, type Palette } from '../constants/theme';
import { money } from '../lib/format';
import { api } from '../services/api';
import { useApi, useLiveQuotes } from '../services/hooks';
import type { AccountsResponse, ExternalAccount, ExternalHolding } from '../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

type Quotes = Record<string, { priceCents: number; changeBps: number }>;
type Member = AccountsResponse['members'][number];

// "US$1,234.56" — the house convention: $ is CAD unless it wears a US prefix.
const fmt = (cents: number, currency: string) =>
  currency === 'USD' ? money(cents).replace('$', 'US$') : money(cents);

const SCROOGE = require('../assets/scrooge.png');
const SNAPTRADE_DASH = 'https://dashboard.snaptrade.com/home?personal';

function avatarFor(email: string) {
  return email.includes('appleby')
    ? require('../assets/people/graham.png')
    : require('../assets/people/cam.png');
}

/** Cost basis for the unrealized line: the brokerage's explicit avg buy price × shares
 * when reported (the honest source), else derived from sync-time value − open P&L
 * (web accounts-page bookCostFor parity). */
function bookCostFor(h: ExternalHolding): number | null {
  if (h.avgCostCents != null && h.qty > 0) return Math.round(h.qty * h.avgCostCents);
  if (h.openPnlCents == null || h.marketValueCents == null) return null;
  return h.marketValueCents - h.openPnlCents;
}

/** Accounts — the web /accounts page on the phone: both members' personal
 * brokerage accounts (read-only via SnapTrade), side-by-side with the fund.
 * Same content, same links: live prices, per-account cards, connect / refresh /
 * unlink / one-tap reconnect. Alfred can neither see nor trade any of it. */
export default function AccountsScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const acc = useApi<AccountsResponse>('/api/accounts');

  const members = acc.data?.members ?? [];
  const self = members.find((m) => m.isSelf);

  // One poll covers every holding on the page (web LiveQuotesProvider parity).
  const symbols = [
    ...new Set(
      members.flatMap((m) => m.accounts.flatMap((a) => a.holdings.map((h) => h.quoteSymbol ?? h.symbol))),
    ),
  ];
  const quotes = useLiveQuotes(symbols);

  // The connection lives in SnapTrade and GRQ just reads — auto-sync once when the
  // page opens (web MyAccountControls parity), then re-read whenever the app comes
  // back to the foreground (returning from the SnapTrade portal in Safari).
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current || !self?.connected) return;
    synced.current = true;
    (async () => {
      await api('/api/external/sync', { method: 'POST' }).catch(() => {});
      acc.reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self?.connected]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') acc.reload();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView edges={['top']} style={[s.fill, { backgroundColor: p.bodyBg }]}>
      <View style={s.bar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={p.accentText} />
          <Text style={{ color: p.accentText, fontFamily: F.med, fontSize: 14 }}>back</Text>
        </Pressable>
        <Text style={[s.title, { color: p.textPrimary }]}>Accounts</Text>
        <View style={s.back} />
      </View>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={[s.pageSub, { color: p.textMuted }]}>
          Personal brokerage accounts — Cam &amp; Graham, side-by-side with the fund.
        </Text>

        {/* The guardrail, stated plainly (web copy, verbatim). */}
        <Card style={[s.guardCard, { borderColor: p.accent + '33', backgroundColor: p.accent + '0f' }]}>
          <Text style={{ fontSize: 15, lineHeight: 20 }}>🔒</Text>
          <Text style={[s.guardText, { color: p.textPrimary }]}>
            <Text style={{ fontFamily: F.semi }}>Visibility only.</Text> GRQ can&apos;t trade these
            accounts — the connection is <Text style={{ fontFamily: F.semi }}>read-only at the source</Text>,
            kept entirely separate from the fund&apos;s trading. It&apos;s here so you can see what you
            each hold outside the fund, and jump to the research on any name.
          </Text>
        </Card>

        {acc.loading && <Loading />}
        {acc.error && !acc.data && <View style={{ marginTop: 12 }}><ErrorNote message={acc.error} /></View>}

        {members.map((m) => (
          <MemberSection key={m.email} m={m} quotes={quotes} p={p} onChanged={acc.reload} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- one member: header, controls, accounts ---------- */

function totalsByCurrency(accounts: ExternalAccount[]): string {
  const by = new Map<string, number>();
  for (const a of accounts) by.set(a.currency, (by.get(a.currency) ?? 0) + (a.totalValueCents ?? 0));
  return [...by.entries()].map(([cur, cents]) => fmt(cents, cur)).join(' · ');
}

function MemberSection({
  m,
  quotes,
  p,
  onChanged,
}: {
  m: Member;
  quotes: Quotes;
  p: Palette;
  onChanged: () => void;
}) {
  return (
    <View style={{ marginTop: 22 }}>
      <View style={s.memberHead}>
        <Image source={avatarFor(m.email)} style={[s.memberAvatar, { borderColor: p.accent + '73' }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.memberNameRow}>
            <Text style={[s.memberName, { color: p.textPrimary }]}>{m.name}</Text>
            {m.isSelf && <Pill label="you" color={p.textMuted} p={p} />}
          </View>
          {m.accounts.length > 0 ? (
            <Text style={[s.memberSub, tabular, { color: p.textMuted }]} numberOfLines={1}>
              {totalsByCurrency(m.accounts)} · {m.accounts.length} account{m.accounts.length === 1 ? '' : 's'}
            </Text>
          ) : (
            <Text style={[s.memberSub, { color: p.textMuted }]}>No holdings yet</Text>
          )}
        </View>
      </View>

      {m.isSelf && m.connected && (
        <MyAccountControls hasAccounts={m.accounts.length > 0} p={p} onChanged={onChanged} />
      )}

      {!m.connected ? (
        m.isSelf ? (
          <ConnectSplash p={p} onChanged={onChanged} />
        ) : (
          <Card style={{ marginTop: 10 }}>
            <Text style={[s.emptyText, { color: p.textMuted }]}>{m.name} hasn&apos;t linked a brokerage yet.</Text>
          </Card>
        )
      ) : m.accounts.length === 0 ? (
        <Card style={{ marginTop: 10 }}>
          <Text style={[s.emptyText, { color: p.textMuted }]}>
            {m.isSelf
              ? 'Link your TD account in SnapTrade (or hit “Connect a brokerage”) and your holdings show up here automatically.'
              : `${m.name} hasn't linked a brokerage yet.`}
          </Text>
        </Card>
      ) : (
        m.accounts.map((a) => (
          <AccountCard key={a.id} a={a} canReconnect={m.isSelf} quotes={quotes} p={p} onChanged={onChanged} />
        ))
      )}
    </View>
  );
}

/* ---------- the signed-in member's own controls (web MyAccountControls parity) ---------- */

function MyAccountControls({
  hasAccounts,
  p,
  onChanged,
}: {
  hasAccounts: boolean;
  p: Palette;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<null | 'connect' | 'refresh' | 'disconnect'>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setErr(null);
    setBusy('refresh');
    try {
      await api('/api/external/sync', { method: 'POST' });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Refresh failed.');
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    setErr(null);
    setBusy('connect');
    try {
      const d = await api<{ url?: string; error?: string }>('/api/external/connect', { method: 'POST' });
      if (!d.url) throw new Error(d.error ?? "Couldn't start the connection.");
      await Linking.openURL(d.url); // SnapTrade Connection Portal (read-only) — refreshed on return
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start the connection.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = () => {
    Alert.alert(
      'Unlink your brokerage?',
      'Unlink your brokerage and remove its data from GRQ? You can reconnect anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            setErr(null);
            setBusy('disconnect');
            try {
              await api('/api/external/disconnect', { method: 'POST' });
              onChanged();
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Disconnect failed.');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ marginTop: 10 }}>
      <View style={s.controlsRow}>
        <SmallBtn
          label={busy === 'refresh' ? 'Refreshing…' : '↻ Refresh'}
          color={p.accentText}
          border={p.accent + '4d'}
          disabled={busy !== null}
          onPress={refresh}
        />
        {/* The connection itself lives in SnapTrade — when it breaks (TD forces a
            re-login), the fix is re-authing THERE. Straight to their dashboard. */}
        <SmallBtn
          label="Open SnapTrade ↗"
          color={p.accentText}
          border={p.accent + '4d'}
          disabled={false}
          onPress={() => Linking.openURL(SNAPTRADE_DASH)}
        />
        {hasAccounts ? (
          <SmallBtn
            label={busy === 'disconnect' ? 'Unlinking…' : 'Unlink'}
            color={p.neg}
            border={p.neg + '4d'}
            disabled={busy !== null}
            onPress={disconnect}
          />
        ) : (
          <SmallBtn
            label={busy === 'connect' ? 'Opening…' : 'Connect a brokerage'}
            color={p.accentText}
            border={p.accent + '80'}
            bg={p.accent + '26'}
            disabled={busy !== null}
            onPress={connect}
          />
        )}
      </View>
      {err && <Text style={[s.errText, { color: p.neg }]}>{err}</Text>}
    </View>
  );
}

/* ---------- one account: header, live total, holdings ---------- */

function AccountCard({
  a,
  canReconnect,
  quotes,
  p,
  onChanged,
}: {
  a: ExternalAccount;
  canReconnect: boolean;
  quotes: Quotes;
  p: Palette;
  onChanged: () => void;
}) {
  // Live total = cash + Σ qty × live price, falling back to the synced value per
  // holding until the first poll lands (web LiveAccountTotal parity).
  const cash = a.cashCents ?? 0;
  let total = cash;
  for (const h of a.holdings) {
    const live = quotes[h.quoteSymbol ?? h.symbol]?.priceCents ?? h.priceCents;
    total += live != null ? Math.round(h.qty * live) : (h.marketValueCents ?? 0);
  }
  const syncedDay = a.syncedAt ? String(a.syncedAt).slice(0, 10) : null;

  return (
    <Card style={{ marginTop: 10, paddingVertical: 12 }}>
      <View style={s.acctHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.acctInstitution, { color: p.textPrimary }]} numberOfLines={1}>
            {a.institution}
            {a.name ? <Text style={{ color: p.textMuted, fontFamily: F.reg }}>  {a.name}</Text> : null}
          </Text>
          <View style={s.acctChips}>
            {a.accountType ? <Pill label={a.accountType} color={p.accentText} p={p} /> : null}
            {a.numberMasked ? (
              <Text style={[s.acctMasked, tabular, { color: p.textMuted }]}>{a.numberMasked}</Text>
            ) : null}
            {/* Broken SnapTrade link: the owner gets the one-tap banner below,
                the other member this honest chip (web parity). */}
            {a.disabled && !canReconnect ? <Pill label="reconnect needed" color={p.neg} p={p} /> : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={s.acctTotalRow}>
            <View style={[s.liveDot, { backgroundColor: p.pos }]} />
            <Text style={[s.acctTotal, tabular, { color: p.textPrimary }]}>{fmt(total, a.currency)}</Text>
          </View>
          {/* Cash shown on its own, not silently folded into the total. */}
          {cash > 0 && (
            <Text style={[s.acctCash, tabular, { color: p.textMuted }]}>incl. cash {fmt(cash, a.currency)}</Text>
          )}
          <Text style={[s.acctSynced, { color: p.textMuted }]}>
            <Text style={{ color: p.pos }}>prices live</Text>
            {syncedDay ? ` · holdings as of ${syncedDay}` : ''}
          </Text>
        </View>
      </View>

      {a.disabled && canReconnect && (
        <ReconnectBanner
          authorizationId={a.authorizationId ?? null}
          syncedAt={syncedDay}
          p={p}
          onFixed={onChanged}
        />
      )}

      {a.holdings.length === 0 ? (
        <Text style={[s.emptyText, { color: p.textMuted, marginTop: 10 }]}>
          {cash > 0 ? `All cash — ${fmt(cash, a.currency)} uninvested, no holdings.` : 'No holdings reported.'}
        </Text>
      ) : (
        <View style={{ marginTop: 6 }}>
          {a.holdings.map((h, i) => (
            <View key={h.symbol}>
              {i > 0 && <Divider />}
              <HoldingRow h={h} quotes={quotes} p={p} />
            </View>
          ))}
          {/* Cash as its own row (like the portfolio lane) so it's a visible value,
              not just a bump in the account total. */}
          {cash > 0 && (
            <View>
              <Divider />
              <View style={s.row}>
                <Image
                  source={SCROOGE}
                  style={[s.scrooge, { borderColor: p.cardBorder }]}
                />
                <View style={s.rowMain}>
                  <Text style={[s.sym, { color: p.textPrimary }]}>Cash</Text>
                  <Text style={[s.rowSub, { color: p.textMuted }]}>uninvested cash</Text>
                </View>
                <Text style={[s.val, tabular, { color: p.textPrimary }]}>{fmt(cash, a.currency)}</Text>
              </View>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

function HoldingRow({ h, quotes, p }: { h: ExternalHolding; quotes: Quotes; p: Palette }) {
  const router = useRouter();
  const q = quotes[h.quoteSymbol ?? h.symbol];
  const price = q?.priceCents ?? h.priceCents;
  const value = price != null ? Math.round(h.qty * price) : h.marketValueCents;

  // Today's change on the position = qty × (live price − prior close), the prior
  // close derived from the day's % move — web LiveHoldingToday, same math.
  const changePct = q ? q.changeBps / 100 : null;
  const day =
    q && changePct != null && 100 + changePct !== 0
      ? Math.round((h.qty * (q.priceCents * changePct)) / (100 + changePct))
      : null;

  // Unrealized = live value − cost basis (web LiveHoldingUnrealized).
  const bookCost = bookCostFor(h);
  const pnl = bookCost != null && value != null ? value - bookCost : null;
  const pnlFrac = pnl != null && bookCost != null && bookCost > 0 ? pnl / bookCost : null;

  const signed = (cents: number) => `${cents >= 0 ? '+' : '−'}${fmt(Math.abs(cents), h.currency)}`;
  const pnlColor = (cents: number) => (cents >= 0 ? p.pos : p.neg);

  return (
    // Link by quoteSymbol (CAD → .TO, US → bare) so untracked TSX names resolve to
    // a Canadian quote — the same key the web's dossierHref uses.
    <Pressable onPress={() => router.push(`/stock/${h.quoteSymbol ?? h.symbol}`)} style={s.row}>
      <StockLogo symbol={h.symbol} logoUrl={h.logoUrl ?? null} size={32} />
      <View style={s.rowMain}>
        <Text style={[s.sym, { color: p.accentText }]}>{h.symbol}</Text>
        {h.description ? (
          <Text style={[s.rowSub, { color: p.textMuted }]} numberOfLines={1}>{h.description}</Text>
        ) : null}
        <Text style={[s.rowSub, tabular, { color: p.textMuted }]} numberOfLines={1}>
          {h.qty} sh{price != null ? ` @ ${fmt(price, h.currency)}` : ''}
        </Text>
      </View>
      <View style={s.rowRight}>
        <Text style={[s.val, tabular, { color: p.textPrimary }]}>{value != null ? fmt(value, h.currency) : '—'}</Text>
        <Text style={[s.rowStat, tabular, { color: day != null ? pnlColor(day) : p.textMuted }]}>
          {day != null && changePct != null
            ? `today ${signed(day)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`
            : 'today —'}
        </Text>
        <Text style={[s.rowStat, tabular, { color: pnl != null ? pnlColor(pnl) : p.textMuted }]}>
          {pnl != null
            ? `open ${signed(pnl)}${pnlFrac != null ? ` (${pnlFrac >= 0 ? '+' : ''}${(pnlFrac * 100).toFixed(1)}%)` : ''}`
            : 'open —'}
        </Text>
      </View>
    </Pressable>
  );
}

/* ---------- the guided, self-serve connect splash (web ConnectSplash + ConnectKeysForm) ---------- */

function ConnectSplash({ p, onChanged }: { p: Palette; onChanged: () => void }) {
  const [clientId, setClientId] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api('/api/external/keys', {
        method: 'POST',
        body: JSON.stringify({ clientId: clientId.trim(), consumerKey: consumerKey.trim() }),
      });
      onChanged(); // configured now → holdings render
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't connect those keys.");
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Text style={{ fontSize: 18, lineHeight: 22 }}>👋</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.splashTitle, { color: p.textPrimary }]}>See your own holdings here</Text>
          <Text style={[s.splashBody, { color: p.textMuted }]}>
            Link your brokerage (TD or any other), <Text style={{ fontFamily: F.semi }}>read-only</Text>, and
            your personal holdings show up beside the fund — each linked to GRQ&apos;s research, with
            Alfred&apos;s call stamped on it. GRQ can <Text style={{ fontFamily: F.semi }}>never trade
            these</Text>; it&apos;s a window, not a hand on the wheel.
          </Text>

          <SplashStep n="1" p={p}>
            Make a free account at{' '}
            <Text
              style={{ color: p.accentText, fontFamily: F.semi }}
              onPress={() => Linking.openURL('https://dashboard.snaptrade.com')}
            >
              SnapTrade ↗
            </Text>{' '}
            — the read-only middleman that talks to your brokerage so GRQ doesn&apos;t have to.
          </SplashStep>
          <SplashStep n="2" p={p}>
            Inside SnapTrade, connect your brokerage — pick{' '}
            <Text style={{ fontFamily: F.semi }}>TD Direct Investing</Text> and log in once with your normal
            TD credentials. (This is the only hands-on step, and it happens on TD&apos;s / SnapTrade&apos;s
            pages — never in GRQ.)
          </SplashStep>
          <SplashStep n="3" p={p}>
            Grab your two keys — a <Text style={{ fontFamily: F.semi }}>Client ID</Text> starting{' '}
            <Text style={[tabular, { fontFamily: F.semi }]}>PERS-</Text> and a{' '}
            <Text style={{ fontFamily: F.semi }}>Consumer Key</Text> — and paste them below. That&apos;s it:
            your accounts appear within a few seconds, no one else in the loop.
          </SplashStep>

          <TextInput
            value={clientId}
            onChangeText={setClientId}
            placeholder="Client ID (PERS-…)"
            placeholderTextColor={p.textMuted + '99'}
            autoCapitalize="none"
            autoCorrect={false}
            style={[s.field, { color: p.textPrimary, borderColor: p.cardBorder, backgroundColor: p.bodyBg }]}
          />
          <TextInput
            value={consumerKey}
            onChangeText={setConsumerKey}
            placeholder="Consumer Key"
            placeholderTextColor={p.textMuted + '99'}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={[s.field, { color: p.textPrimary, borderColor: p.cardBorder, backgroundColor: p.bodyBg }]}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <Pressable
              onPress={submit}
              disabled={busy || !clientId.trim() || !consumerKey.trim()}
              style={[
                s.connectBtn,
                {
                  backgroundColor: p.accent + '26',
                  borderColor: p.accent + '80',
                  opacity: busy || !clientId.trim() || !consumerKey.trim() ? 0.5 : 1,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={p.accentText} size="small" />
              ) : (
                <Text style={{ color: p.accentText, fontFamily: F.bold, fontSize: 13 }}>Connect</Text>
              )}
            </Pressable>
            {err && <Text style={[s.errText, { color: p.neg, flex: 1, marginTop: 0 }]}>{err}</Text>}
          </View>

          <Text style={[s.splashFine, { color: p.textMuted }]}>
            Stored privately and used read-only — GRQ can never trade these accounts. You can Unlink anytime
            to wipe the keys and data.
          </Text>
          <Text style={[s.splashFine, { color: p.textMuted }]}>
            Heads-up: once you&apos;re connected, the other fund member will see your holdings and
            you&apos;ll see theirs — that mutual view is the point.
          </Text>
        </View>
      </View>
    </Card>
  );
}

function SplashStep({ n, p, children }: { n: string; p: Palette; children: React.ReactNode }) {
  return (
    <View style={s.step}>
      <View style={[s.stepBadge, { borderColor: p.accent + '4d', backgroundColor: p.accent + '1a' }]}>
        <Text style={{ color: p.accentText, fontFamily: F.bold, fontSize: 11 }}>{n}</Text>
      </View>
      <Text style={[s.stepText, { color: p.textPrimary }]}>{children}</Text>
    </View>
  );
}

/* ---------- little pieces ---------- */

function Pill({ label, color, p }: { label: string; color: string; p: Palette }) {
  return (
    <View style={[s.pill, { borderColor: color + '55', backgroundColor: p.cardHi }]}>
      <Text style={{ color, fontFamily: F.semi, fontSize: 9.5, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

function SmallBtn({
  label,
  color,
  border,
  bg,
  disabled,
  onPress,
}: {
  label: string;
  color: string;
  border: string;
  bg?: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[s.smallBtn, { borderColor: border, backgroundColor: bg ?? 'transparent', opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={{ color, fontFamily: F.semi, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 12 },
  back: { flexDirection: 'row', alignItems: 'center', width: 70 },
  title: { flex: 1, textAlign: 'center', fontFamily: 'System', fontWeight: '800', fontSize: 17 },
  body: { paddingHorizontal: 16, paddingBottom: 40 },
  pageSub: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, marginTop: 4 },
  guardCard: { flexDirection: 'row', gap: 10, marginTop: 12, borderWidth: 1 },
  guardText: { flex: 1, fontFamily: F.reg, fontSize: 12.5, lineHeight: 18 },
  emptyText: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18 },
  errText: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 15, marginTop: 6 },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  memberName: { fontFamily: F.semi, fontSize: 15 },
  memberSub: { fontFamily: F.reg, fontSize: 11, marginTop: 2 },
  controlsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  acctHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  acctInstitution: { fontFamily: F.semi, fontSize: 13.5 },
  acctChips: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  acctMasked: { fontFamily: F.reg, fontSize: 10.5 },
  acctTotalRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  acctTotal: { fontFamily: F.semi, fontSize: 14.5 },
  acctCash: { fontFamily: F.reg, fontSize: 10.5, marginTop: 1 },
  acctSynced: { fontFamily: F.med, fontSize: 8.5, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowMain: { flex: 1, minWidth: 0 },
  rowRight: { alignItems: 'flex-end' },
  sym: { fontFamily: F.semi, fontSize: 14 },
  rowSub: { fontFamily: F.reg, fontSize: 11, marginTop: 1 },
  rowStat: { fontFamily: F.med, fontSize: 10.5, marginTop: 1 },
  val: { fontFamily: F.semi, fontSize: 13.5 },
  scrooge: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  splashTitle: { fontFamily: F.semi, fontSize: 14.5 },
  splashBody: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, marginTop: 4 },
  step: { flexDirection: 'row', gap: 9, marginTop: 12 },
  stepBadge: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontFamily: F.reg, fontSize: 12, lineHeight: 17, paddingTop: 2 },
  field: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, fontFamily: F.reg, fontSize: 13, marginTop: 8 },
  connectBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, minWidth: 90, alignItems: 'center' },
  splashFine: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 15, marginTop: 8 },
});
