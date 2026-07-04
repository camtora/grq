import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Card, SectionTitle, Footnote, Divider, Segmented, Loading, ErrorNote } from '../components/Chrome';
import { usePalette, F, type Palette } from '../constants/theme';
import { money } from '../lib/format';
import { api } from '../services/api';
import { useApi } from '../services/hooks';
import { useAuth } from '../store/auth';
import { useThemeStore } from '../store/theme';
import type { FundSettings, FxState, FxRequest, Health } from '../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

const RISK_LABELS: Record<FundSettings['riskLevel'], string> = {
  CAUTIOUS: 'Cautious',
  BALANCED: 'Balanced',
  AGGRESSIVE: 'Aggressive',
};

/** Settings — the dials the members control. The agent controls nothing on
 * this page, and never can (web settings parity; content from GRQNext). */
export default function SettingsScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const { me, signOut } = useAuth();
  const themeOverride = useThemeStore((s) => s.override);
  const setThemeOverride = useThemeStore((s) => s.setOverride);
  const fund = useApi<FundSettings>('/api/fund-settings');
  const fx = useApi<FxState>('/api/fx');
  const health = useApi<Health>('/api/health');
  const [busy, setBusy] = useState(false);

  const s7 = fund.data;

  const refreshAll = () => {
    fund.refresh();
    fx.refresh();
    health.refresh();
  };

  const setKillSwitch = (engaged: boolean) => {
    Alert.alert(
      engaged ? 'Halt all trading?' : 'Resume trading?',
      engaged
        ? 'Nothing trades while the kill switch is engaged — no buys, no sells, no exceptions.'
        : 'The agent goes back on duty and may trade within the guardrails.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: engaged ? 'Halt trading' : 'Resume',
          style: engaged ? 'destructive' : 'default',
          onPress: async () => {
            setBusy(true);
            try {
              await api('/api/killswitch', { method: 'POST', body: JSON.stringify({ engaged }) });
              refreshAll();
            } catch (e) {
              Alert.alert('Failed', e instanceof Error ? e.message : 'Try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const setRisk = (level: FundSettings['riskLevel']) => {
    if (!s7 || level === s7.riskLevel) return;
    Alert.alert(
      `Set the risk dial to ${RISK_LABELS[level]}?`,
      'Sets position size, cash floor, stops, and trade pace. Every order still clears the hard gate in code.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set',
          onPress: async () => {
            setBusy(true);
            try {
              await api('/api/settings', {
                method: 'POST',
                body: JSON.stringify({ riskLevel: level, feeBudgetCentsMonth: s7.feeBudgetCentsMonth }),
              });
              fund.refresh();
            } catch (e) {
              Alert.alert('Failed', e instanceof Error ? e.message : 'Try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', me?.email ?? '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const avatar = me?.email?.includes('appleby')
    ? require('../assets/people/graham.png')
    : require('../assets/people/cam.png');

  return (
    <SafeAreaView edges={['top']} style={[st.fill, { backgroundColor: p.bodyBg }]}>
      <View style={st.bar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={st.back}>
          <Ionicons name="chevron-back" size={22} color={p.accentText} />
          <Text style={{ color: p.accentText, fontFamily: F.med, fontSize: 14 }}>back</Text>
        </Pressable>
        <Text style={[st.title, { color: p.textPrimary }]}>Settings</Text>
        <View style={st.back} />
      </View>
      <ScrollView contentContainerStyle={st.body}>
        <Text style={[st.pageSub, { color: p.textMuted }]}>
          The dials you control. The agent controls nothing on this page — and never can.
        </Text>

        {/* Me */}
        <Card style={{ marginTop: 12 }}>
          <View style={st.meRow}>
            <Image source={avatar} style={[st.meAvatar, { borderColor: p.accent + '73' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[st.meName, { color: p.textPrimary }]}>{me?.name ?? 'Member'}</Text>
              <Text style={[st.meEmail, { color: p.textMuted }]}>{me?.email}</Text>
              <Text style={[st.meTheme, { color: p.textMuted }]}>
                {me?.theme === 'dark' ? 'dark mode' : 'light mode'} · set by who you are
              </Text>
            </View>
            <Pressable onPress={confirmSignOut} style={[st.ghostBtn, { borderColor: p.cardBorder }]}>
              <Text style={{ color: p.neg, fontFamily: F.semi, fontSize: 12 }}>Sign out</Text>
            </Pressable>
          </View>
        </Card>

        {fund.loading && <Loading />}
        {fund.error && !s7 && <View style={{ marginTop: 12 }}><ErrorNote message={fund.error} /></View>}

        {s7 && (
          <View>
            {/* Kill switch */}
            <SectionTitle sub="nothing trades while it's on">Kill switch</SectionTitle>
            <Card>
              <View style={st.ksRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: s7.killSwitch ? p.neg : p.pos, fontFamily: F.black, fontSize: 15 }}>
                    {s7.killSwitch ? 'ENGAGED' : 'TRADING LIVE'}
                  </Text>
                  <Text style={[st.mutedSmall, { color: p.textMuted }]}>
                    {s7.killSwitch
                      ? `halted${s7.killSwitchBy ? ` by ${s7.killSwitchBy}` : ''} — no buys, no sells`
                      : 'the agent is on duty, inside the guardrails'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setKillSwitch(!s7.killSwitch)}
                  disabled={busy}
                  style={[
                    st.ksBtn,
                    s7.killSwitch
                      ? { backgroundColor: p.accent + '26' }
                      : { backgroundColor: p.neg + '26' },
                    { opacity: busy ? 0.5 : 1 },
                  ]}
                >
                  <Text style={{ color: s7.killSwitch ? p.accentText : p.neg, fontFamily: F.bold, fontSize: 13 }}>
                    {s7.killSwitch ? 'Resume trading' : 'Halt trading'}
                  </Text>
                </Pressable>
              </View>
              <Footnote>both members hold it — flip it here or on the web, same switch</Footnote>
            </Card>

            {/* Risk dial */}
            <SectionTitle sub="position size · cash floor · stops · pace">Risk dial</SectionTitle>
            <Card>
              <Segmented
                options={[
                  { key: 'CAUTIOUS', label: 'Cautious' },
                  { key: 'BALANCED', label: 'Balanced' },
                  { key: 'AGGRESSIVE', label: 'Aggressive' },
                ]}
                value={s7.riskLevel}
                onChange={(v) => setRisk(v)}
              />
              <View style={st.dialGrid}>
                <DialStat label="cash floor" value={`${(s7.cashFloorBps / 100).toFixed(0)}%`} p={p} />
                <DialStat label="max position" value={`${(s7.maxPositionBps / 100).toFixed(0)}%`} p={p} />
                <DialStat label="stop-loss" value={`−${(s7.stopLossBps / 100).toFixed(0)}%`} p={p} />
                <DialStat label="take-profit" value={`+${(s7.takeProfitBps / 100).toFixed(0)}%`} p={p} />
              </View>
              <Footnote>humans-only — every order still clears the hard gate in code (§6)</Footnote>
            </Card>

            {/* Fees */}
            <SectionTitle sub="commissions this month">Fees</SectionTitle>
            <Card>
              <ProgressBar
                value={s7.feeSpentMonthCents}
                max={s7.feeBudgetCentsMonth}
                label={`${money(s7.feeSpentMonthCents)} of ${money(s7.feeBudgetCentsMonth)}`}
                p={p}
              />
            </Card>

            {/* Currency & FX */}
            <SectionTitle sub="the agent proposes, you approve (D62)">Currency & FX</SectionTitle>
            {fx.data ? (
              <FxSection fxState={fx.data} onChanged={refreshAll} p={p} />
            ) : (
              <Card><Text style={[st.mutedSmall, { color: p.textMuted }]}>loading…</Text></Card>
            )}

            {/* Appearance — member default, overridable per device (Cam 2026-07-03) */}
            <SectionTitle sub="light for Cam · dark for Graham, by default">Appearance</SectionTitle>
            <Card>
              <Segmented
                options={[
                  { key: 'light', label: 'Light' },
                  { key: 'dark', label: 'Dark' },
                  { key: 'default', label: 'My default' },
                ]}
                value={themeOverride ?? 'default'}
                onChange={(v) => setThemeOverride(v === 'default' ? null : (v as 'light' | 'dark'))}
              />
              <Footnote>remembered on this device</Footnote>
            </Card>

            {/* Notification options */}
            <SectionTitle sub="what pushes your phone">Notifications</SectionTitle>
            <Pressable onPress={() => router.push('/notification-settings')}>
              <Card>
                <View style={st.linkRow}>
                  <Text style={{ color: p.textPrimary, fontFamily: F.med, fontSize: 13.5 }}>
                    Delivery options
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={p.textMuted} />
                </View>
              </Card>
            </Pressable>

            {/* Road to real money */}
            <SectionTitle sub="the soak gate (§9)">Road to real money</SectionTitle>
            <Card>
              <ProgressBar
                value={s7.soakDaysClean}
                max={s7.soakDaysRequired}
                label={`clean days — ${s7.soakDaysClean} of ${s7.soakDaysRequired}`}
                p={p}
              />
              <View style={{ height: 12 }} />
              <ProgressBar
                value={s7.soakPaperDaysClean}
                max={s7.soakPaperDaysRequired}
                label={`on IBKR paper — ${s7.soakPaperDaysClean} of ${s7.soakPaperDaysRequired}`}
                p={p}
              />
              <Footnote>
                real money never trades until ≥4 clean weeks total, of which ≥2 on IBKR paper
              </Footnote>
            </Card>

            {/* Owner dashboards (web /traffic + /tokens parity) */}
            <SectionTitle sub="owners only">Dashboards</SectionTitle>
            <Pressable onPress={() => router.push('/traffic')}>
              <Card>
                <View style={st.linkRow}>
                  <Text style={{ color: p.textPrimary, fontFamily: F.med, fontSize: 13.5 }}>
                    Traffic — who&apos;s using GRQ
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={p.textMuted} />
                </View>
              </Card>
            </Pressable>
            <Pressable onPress={() => router.push('/tokens')}>
              <Card>
                <View style={st.linkRow}>
                  <Text style={{ color: p.textPrimary, fontFamily: F.med, fontSize: 13.5 }}>
                    Token usage — the agent&apos;s Claude burn
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={p.textMuted} />
                </View>
              </Card>
            </Pressable>

            {/* System */}
            <SectionTitle sub="what's running">System</SectionTitle>
            <Card>
              <InfoRow k="Broker" v={(health.data?.broker ?? '—').toUpperCase() + (health.data?.broker?.includes('paper') ? ' (paper)' : '')} p={p} />
              <Divider />
              <InfoRow
                k="Agent"
                v={health.data?.agent?.lastTickAt ? `on duty · ticked ${agoLabel(health.data.agent.lastTickAt)}` : '—'}
                p={p}
              />
              <Divider />
              <InfoRow k="App" v={`GRQ Go ${Constants.expoConfig?.version ?? ''}`.trim()} p={p} />
              <Divider />
              <InfoRow k="Members" v="Cam & Graham" p={p} />
              <Footnote>both members are equal admins — both hold the kill switch</Footnote>
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- FX ---------- */

function FxSection({ fxState, onChanged, p }: { fxState: FxState; onChanged: () => void; p: Palette }) {
  const [busy, setBusy] = useState<number | null>(null);

  const decide = (r: FxRequest, action: 'approve' | 'reject') => {
    const line = r.amountUsdCents != null ? `US${money(r.amountUsdCents)}` : money(r.estCadCents ?? 0);
    Alert.alert(
      `${action === 'approve' ? 'Approve' : 'Reject'} FX #${r.id}?`,
      `${r.fromCurrency}→${r.toCurrency} · ${line}${r.symbol ? ` · for ${r.symbol}` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'approve' ? 'Approve & convert' : 'Reject',
          style: action === 'approve' ? 'default' : 'destructive',
          onPress: async () => {
            setBusy(r.id);
            try {
              await api('/api/fx', { method: 'POST', body: JSON.stringify({ action, id: r.id }) });
              onChanged();
            } catch (e) {
              Alert.alert('Failed', e instanceof Error ? e.message : 'Try again.');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <Card>
      <View style={st.fxBalances}>
        <DialStat label="CAD cash" value={money(fxState.cadCashCents)} p={p} />
        <DialStat label="USD cash" value={`US${money(fxState.usdCashCents)}`} p={p} />
        <DialStat label="USD share" value={`${fxState.usdPct}%`} p={p} />
        {fxState.fxUsdCad != null && <DialStat label="USD/CAD" value={fxState.fxUsdCad.toFixed(4)} p={p} />}
      </View>

      {fxState.pending.length > 0 ? (
        <View style={{ marginTop: 12, gap: 12 }}>
          {fxState.pending.map((r) => (
            <View key={r.id} style={[st.fxPending, { borderColor: p.warn + '55' }]}>
              <Text style={[st.fxTitle, { color: p.textPrimary }, tabular]}>
                {r.fromCurrency}→{r.toCurrency} ·{' '}
                {r.amountUsdCents != null ? `US${money(r.amountUsdCents)}` : money(r.estCadCents ?? 0)}
                {r.symbol ? `  · ${r.symbol}` : ''}
              </Text>
              {r.reason && (
                <Text style={[st.mutedSmall, { color: p.textMuted }]} numberOfLines={3}>{r.reason}</Text>
              )}
              <View style={st.fxBtns}>
                <Pressable
                  onPress={() => decide(r, 'approve')}
                  disabled={busy === r.id}
                  style={[st.fxBtn, { backgroundColor: p.accent + '26', opacity: busy === r.id ? 0.5 : 1 }]}
                >
                  <Text style={{ color: p.accentText, fontFamily: F.bold, fontSize: 12.5 }}>Approve & convert</Text>
                </Pressable>
                <Pressable
                  onPress={() => decide(r, 'reject')}
                  disabled={busy === r.id}
                  style={[st.fxBtn, { backgroundColor: p.neg + '1f', opacity: busy === r.id ? 0.5 : 1 }]}
                >
                  <Text style={{ color: p.neg, fontFamily: F.bold, fontSize: 12.5 }}>Reject</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[st.mutedSmall, { color: p.textMuted, marginTop: 12 }]}>
          No conversions waiting on you.
        </Text>
      )}

      {fxState.recent.length > 0 && (
        <View style={{ marginTop: 12 }}>
          {fxState.recent.slice(0, 3).map((r, i) => (
            <View key={r.id}>
              {i > 0 && <Divider />}
              <View style={st.fxRecent}>
                <Text style={[st.mutedSmall, tabular, { color: p.textMuted, flex: 1 }]} numberOfLines={1}>
                  {r.fromCurrency}→{r.toCurrency} ·{' '}
                  {r.amountUsdCents != null ? `US${money(r.amountUsdCents)}` : money(r.estCadCents ?? 0)}
                  {r.symbol ? ` · ${r.symbol}` : ''}
                </Text>
                <Text
                  style={[
                    st.fxStatus,
                    { color: r.status === 'EXECUTED' ? p.pos : r.status === 'REJECTED' ? p.textMuted : p.neg },
                  ]}
                >
                  {r.status.toLowerCase()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
      <Footnote>
        a US buy needs USD cash — no auto-FX, no margin; conversions run only after a member
        approves
      </Footnote>
    </Card>
  );
}

/* ---------- little pieces ---------- */

function DialStat({ label, value, p }: { label: string; value: string; p: Palette }) {
  return (
    <View style={st.dialStat}>
      <Text style={[st.dialLabel, { color: p.textMuted }]}>{label}</Text>
      <Text style={[st.dialValue, tabular, { color: p.textPrimary }]}>{value}</Text>
    </View>
  );
}

function ProgressBar({ value, max, label, p }: { value: number; max: number; label: string; p: Palette }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <View>
      <View style={st.progressHead}>
        <Text style={[st.mutedSmall, tabular, { color: p.textPrimary }]}>{label}</Text>
        <Text style={[st.mutedSmall, tabular, { color: p.textMuted }]}>{pct}%</Text>
      </View>
      <View style={[st.progressTrack, { backgroundColor: p.cardHi }]}>
        <View style={[st.progressFill, { width: `${Math.max(2, pct)}%`, backgroundColor: pct >= 100 ? p.pos : p.accent }]} />
      </View>
    </View>
  );
}

function InfoRow({ k, v, p }: { k: string; v: string; p: Palette }) {
  return (
    <View style={st.infoRow}>
      <Text style={[st.mutedSmall, { color: p.textMuted }]}>{k}</Text>
      <Text style={[st.infoVal, { color: p.textPrimary }]} numberOfLines={1}>{v}</Text>
    </View>
  );
}

function agoLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 12 },
  back: { flexDirection: 'row', alignItems: 'center', width: 70 },
  title: { flex: 1, textAlign: 'center', fontFamily: 'System', fontWeight: '800', fontSize: 17 },
  body: { paddingHorizontal: 16, paddingBottom: 40 },
  pageSub: { fontFamily: F.reg, fontSize: 12, lineHeight: 17, marginTop: 4 },
  meRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5 },
  meName: { fontFamily: F.semi, fontSize: 15 },
  meEmail: { fontFamily: F.reg, fontSize: 11.5, marginTop: 1 },
  meTheme: { fontFamily: F.reg, fontSize: 10.5, marginTop: 3, opacity: 0.8 },
  ghostBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  ksRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ksBtn: { borderRadius: 11, paddingHorizontal: 14, paddingVertical: 10 },
  mutedSmall: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  dialGrid: { flexDirection: 'row', marginTop: 14 },
  dialStat: { flex: 1, alignItems: 'center' },
  dialLabel: { fontFamily: F.med, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5 },
  dialValue: { fontFamily: F.semi, fontSize: 13.5, marginTop: 3 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  infoVal: { fontFamily: F.semi, fontSize: 12.5, maxWidth: '65%' },
  fxBalances: { flexDirection: 'row' },
  fxPending: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  fxTitle: { fontFamily: F.semi, fontSize: 13.5 },
  fxBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  fxBtn: { flex: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 9 },
  fxRecent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  fxStatus: { fontFamily: F.bold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
});
