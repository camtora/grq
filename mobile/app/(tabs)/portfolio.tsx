import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen, Card, SectionTitle, Footnote, Divider, Segmented, Loading, ErrorNote } from '../../components/Chrome';
import StockLogo from '../../components/StockLogo';
import Sparkline from '../../components/Sparkline';
import { usePalette, F, type Palette } from '../../constants/theme';
import { money, signedMoney, signedPctFromBps, pnlColor } from '../../lib/format';
import { useApi } from '../../services/hooks';
import type { Portfolio, PortfolioPosition, AccountsResponse, Today } from '../../services/types';

const tabular = { fontVariant: ['tabular-nums' as const] };

/** Portfolio — split between the fund (Alfred, default) and the members' own
 * TD accounts (Personal, read-only via SnapTrade; Alfred can't see these — D97). */
export default function PortfolioScreen() {
  const [view, setView] = useState<'alfred' | 'personal'>('alfred');
  const pf = useApi<Portfolio>('/api/portfolio');
  const today = useApi<Today>('/api/today');
  const accounts = useApi<AccountsResponse>('/api/accounts');

  const refreshing = pf.refreshing || today.refreshing || accounts.refreshing;
  const refresh = () => {
    pf.refresh();
    today.refresh();
    accounts.refresh();
  };

  return (
    <Screen title="Portfolio" refreshing={refreshing} onRefresh={refresh}>
      <View style={{ marginTop: 8 }}>
        <Segmented
          options={[
            { key: 'alfred', label: 'Alfred' },
            { key: 'personal', label: 'Personal' },
          ]}
          value={view}
          onChange={setView}
        />
      </View>
      {view === 'alfred' ? (
        <AlfredView pf={pf.data} t={today.data} loading={pf.loading} error={pf.error} />
      ) : (
        <PersonalView data={accounts.data} loading={accounts.loading} error={accounts.error} />
      )}
    </Screen>
  );
}

/* ---------- Alfred (the fund) ---------- */

function AlfredView({ pf, t, loading, error }: { pf: Portfolio | null; t: Today | null; loading: boolean; error: string | null }) {
  const { p } = usePalette();
  if (loading) return <Loading />;
  if (error && !pf) return <View style={{ marginTop: 16 }}><ErrorNote message={error} /></View>;
  if (!pf) return null;

  const positions = [...pf.positions].sort((a, b) => b.marketValueCents - a.marketValueCents);
  const tape = t?.tape ?? [];

  return (
    <View>
      {pf.killSwitch && (
        <Card style={{ marginTop: 14, borderColor: p.neg }}>
          <Text style={{ color: p.neg, fontFamily: F.bold, fontSize: 13 }}>
            KILL SWITCH ENGAGED{pf.killSwitchBy ? ` — by ${pf.killSwitchBy}` : ''}
          </Text>
          <Text style={{ color: p.textMuted, fontFamily: F.reg, fontSize: 11.5, marginTop: 3 }}>
            Nothing trades while it's on. Flip it back on the web Settings page.
          </Text>
        </Card>
      )}

      {/* Hero — NAV + day & total P&L */}
      <View style={s.hero}>
        <Text style={[s.heroLabel, { color: p.textMuted }]}>NET ASSET VALUE</Text>
        <Text style={[s.heroNav, tabular, { color: p.textPrimary }]}>{money(pf.navCents)}</Text>
        <View style={s.heroRow}>
          {t && (
            <Text style={[s.heroPnl, tabular, { color: pnlColor(t.dayPnlCents, p) }]}>
              {signedMoney(t.dayPnlCents)} ({signedPctFromBps(t.dayPnlBps)}) today
            </Text>
          )}
          <Text style={[s.heroPnl, tabular, { color: pnlColor(pf.totalPnlCents, p) }]}>
            {signedMoney(pf.totalPnlCents)} all-time
          </Text>
        </View>
      </View>

      {/* The Tape — intraday NAV */}
      {tape.length >= 2 && (
        <View>
          <SectionTitle sub="intraday NAV, open → now">The Tape</SectionTitle>
          <Card>
            <Sparkline values={tape.map((x) => x.navCents)} height={64} />
            <View style={s.tapeLabels}>
              <Text style={[s.tapeLabel, { color: p.textMuted }]}>{tape[0].at}</Text>
              <Text style={[s.tapeLabel, { color: p.textMuted }]}>{tape[tape.length - 1].at}</Text>
            </View>
          </Card>
        </View>
      )}

      {/* Cash & book */}
      <SectionTitle sub="what the fund is holding">The book</SectionTitle>
      <Card style={s.cashCard}>
        <CashStat label="CAD cash" cents={pf.cadCashCents} p={p} />
        <CashStat label="USD cash" cents={pf.usdCashCents} p={p} usd />
        <CashStat label="Positions" cents={pf.positionsCents} p={p} />
      </Card>

      {/* Positions */}
      <View style={{ marginTop: 10 }}>
        <Card style={s.listCard}>
          {positions.length ? (
            positions.map((pos, i) => (
              <View key={pos.symbol}>
                {i > 0 && <Divider />}
                <PositionRow pos={pos} />
              </View>
            ))
          ) : (
            <Text style={[s.empty, { color: p.textMuted }]}>
              All cash — Alfred only buys when a thesis clears every guardrail. Patience is a
              position.
            </Text>
          )}
        </Card>
        <Footnote>
          risk dial {pf.riskLevel.toLowerCase()} · fees {money(pf.feeSpentMonthCents)} of {money(pf.feeBudgetCentsMonth)} this month
          {pf.quotesAsOf ? ` · quotes ${pf.quotesAsOf.slice(11, 16)}Z` : ''}
        </Footnote>
      </View>

      {/* Latest fund-level briefing (symbol-null reads only — the house rule) */}
      {t?.leadStoryMarkdown && (
        <View>
          <SectionTitle sub="the latest fund-level read">{t.leadTitle.split('·')[0].trim()}</SectionTitle>
          <Card>
            <Briefing body={t.leadStoryMarkdown} />
          </Card>
        </View>
      )}
    </View>
  );
}

function CashStat({ label, cents, p, usd }: { label: string; cents: number; p: Palette; usd?: boolean }) {
  return (
    <View style={s.cashStat}>
      <Text style={[s.cashLabel, { color: p.textMuted }]}>{label}</Text>
      <Text style={[s.cashValue, tabular, { color: p.textPrimary }]}>
        {usd ? 'US' : ''}
        {money(cents)}
      </Text>
    </View>
  );
}

function PositionRow({ pos }: { pos: PortfolioPosition }) {
  const { p } = usePalette();
  return (
    <View style={s.row}>
      <StockLogo symbol={pos.symbol} logoUrl={pos.logoUrl} size={32} />
      <View style={s.rowMain}>
        <Text style={[s.sym, { color: p.accentText }]}>{pos.symbol}</Text>
        <Text style={[s.sub, tabular, { color: p.textMuted }]}>
          {pos.qty} sh @ {money(pos.avgCostCents)}{pos.currency === 'USD' ? ' US' : ''}
        </Text>
      </View>
      <View style={s.rowRight}>
        <Text style={[s.val, tabular, { color: p.textPrimary }]}>{money(pos.marketValueCents)}</Text>
        <View style={s.rowRightSub}>
          <Text style={[s.subPct, tabular, { color: pnlColor(pos.dayChangeBps, p) }]}>
            {signedPctFromBps(pos.dayChangeBps)}
          </Text>
          <Text style={[s.subPct, tabular, { color: pnlColor(pos.unrealizedPnlCents, p) }]}>
            {signedMoney(pos.unrealizedPnlCents)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Markdown briefing, shown as plain text with a read-more fold. */
function Briefing({ body }: { body: string }) {
  const { p } = usePalette();
  const [open, setOpen] = useState(false);
  const text = body
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`/g, '')
    .trim();
  const folded = !open && text.length > 420;
  return (
    <View>
      <Text style={{ color: p.textPrimary, fontFamily: F.reg, fontSize: 13, lineHeight: 20 }}>
        {folded ? `${text.slice(0, 420).trimEnd()}…` : text}
      </Text>
      {text.length > 420 && (
        <Text
          onPress={() => setOpen(!open)}
          style={{ color: p.accentText, fontFamily: F.semi, fontSize: 12, marginTop: 8 }}
        >
          {open ? 'show less' : 'read more'}
        </Text>
      )}
    </View>
  );
}

/* ---------- Personal (SnapTrade — read-only) ---------- */

function PersonalView({ data, loading, error }: { data: AccountsResponse | null; loading: boolean; error: string | null }) {
  const { p } = usePalette();
  if (loading) return <Loading />;
  if (error && !data) return <View style={{ marginTop: 16 }}><ErrorNote message={error} /></View>;
  if (!data) return null;

  return (
    <View>
      {data.members.map((m) => (
        <View key={m.email}>
          <SectionTitle sub={m.isSelf ? '· you' : undefined}>{m.name}</SectionTitle>
          {m.connected && m.accounts.length > 0 ? (
            m.accounts.map((a) => (
              <Card key={a.id} style={{ marginBottom: 10 }}>
                <View style={s.acctHead}>
                  <View style={s.rowMain}>
                    <Text style={[s.sym, { color: p.textPrimary }]}>
                      {a.institution}
                      {a.accountType ? ` · ${a.accountType}` : ''}
                    </Text>
                    <Text style={[s.sub, { color: p.textMuted }]}>
                      {a.name ?? ''}{a.numberMasked ? `  ${a.numberMasked}` : ''}
                    </Text>
                  </View>
                  {a.totalValueCents != null && (
                    <Text style={[s.val, tabular, { color: p.textPrimary }]}>{money(a.totalValueCents)}</Text>
                  )}
                </View>
                {a.holdings.map((h, i) => (
                  <View key={`${h.symbol}-${i}`}>
                    <Divider />
                    <View style={s.row}>
                      <StockLogo symbol={h.symbol} logoUrl={null} size={26} />
                      <View style={s.rowMain}>
                        <Text style={[s.sym, { color: p.accentText }]}>{h.symbol}</Text>
                        <Text style={[s.sub, tabular, { color: p.textMuted }]} numberOfLines={1}>
                          {h.qty} sh{h.priceCents != null ? ` @ ${money(h.priceCents)}` : ''}
                        </Text>
                      </View>
                      <View style={s.rowRight}>
                        {h.marketValueCents != null && (
                          <Text style={[s.val, tabular, { color: p.textPrimary }]}>{money(h.marketValueCents)}</Text>
                        )}
                        {h.openPnlCents != null && (
                          <Text style={[s.subPct, tabular, { color: pnlColor(h.openPnlCents, p) }]}>
                            {signedMoney(h.openPnlCents)}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
                {a.syncedAt && (
                  <Text style={[s.synced, { color: p.textMuted }]}>synced {a.syncedAt.slice(0, 10)}</Text>
                )}
              </Card>
            ))
          ) : (
            <Card style={{ marginBottom: 10 }}>
              <Text style={[s.empty, { color: p.textMuted }]}>
                {m.isSelf
                  ? 'Not connected yet — link your brokerage on the web Accounts page.'
                  : `${m.name} hasn't connected an account yet.`}
              </Text>
            </Card>
          )}
        </View>
      ))}
      <Footnote>
        read-only via SnapTrade — Alfred can neither see nor trade these accounts, ever
      </Footnote>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 22 },
  heroLabel: { fontFamily: F.semi, fontSize: 10, letterSpacing: 2 },
  heroNav: { fontFamily: F.display, fontSize: 40, marginTop: 4, letterSpacing: -0.5 },
  heroRow: { flexDirection: 'row', gap: 14, marginTop: 6 },
  heroPnl: { fontFamily: F.semi, fontSize: 12.5 },
  tapeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tapeLabel: { fontFamily: F.reg, fontSize: 9.5 },
  cashCard: { flexDirection: 'row', paddingVertical: 12 },
  cashStat: { flex: 1, alignItems: 'center' },
  cashLabel: { fontFamily: F.med, fontSize: 10 },
  cashValue: { fontFamily: F.semi, fontSize: 14, marginTop: 3 },
  listCard: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowMain: { flex: 1, minWidth: 0 },
  rowRight: { alignItems: 'flex-end' },
  rowRightSub: { flexDirection: 'row', gap: 8, marginTop: 1 },
  sym: { fontFamily: F.semi, fontSize: 14 },
  sub: { fontFamily: F.reg, fontSize: 11, marginTop: 1 },
  subPct: { fontFamily: F.semi, fontSize: 11 },
  val: { fontFamily: F.semi, fontSize: 13.5 },
  empty: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 18, paddingVertical: 6 },
  acctHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8 },
  synced: { fontFamily: F.reg, fontSize: 9.5, marginTop: 8, opacity: 0.7 },
});
