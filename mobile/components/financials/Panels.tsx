import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Card, Divider, SectionTitle } from '../Chrome';
import { usePalette, F, type Palette } from '../../constants/theme';
import { bigMoney, epsMoney, growthText, grow, monthLabel, tidyName, type FinancialsCompany, type FinGrowth } from '../../lib/financials';
import { Term, toneColor } from './Headline';

// The panels under "The business" headline — each a port of its web component (D140 display loop,
// all decided 2026-10-23), same wording: Financial health (checklist, graded) · Health scores ·
// What analysts expect (vs last year) · Where the money comes from (split + growth) · The last
// earnings call · Filings & insiders (the company's own people; Smart Money is outside money).

type V = FinancialsCompany;
const tabular = { fontVariant: ['tabular-nums' as const] };

function B({ children, color }: { children: React.ReactNode; color?: string }) {
  const { p } = usePalette();
  return <Text style={{ fontFamily: F.bold, color: color ?? p.textPrimary }}>{children}</Text>;
}
function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  const { p } = usePalette();
  return <Text style={[st.eyebrow, { color: color ?? p.textMuted }]}>{children}</Text>;
}
function Body({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  const { p } = usePalette();
  return <Text style={[st.body, { color: muted ? p.textMuted : p.textPrimary }]}>{children}</Text>;
}
function Small({ children, style }: { children: React.ReactNode; style?: object }) {
  const { p } = usePalette();
  return <Text style={[st.small, { color: p.textMuted }, style]}>{children}</Text>;
}

/* ───────────── Financial health — the checklist ───────────── */

const x10 = (n: number) => (n >= 1000 ? `${Math.round(n / 10)}` : (n / 10).toFixed(1).replace(/\.0$/, ''));

/** One sentence per fact, in dollars — the web's HealthChecklist `lines()`. */
function healthLines(v: V, p: Palette) {
  const f = v.facts;
  const h = v.headline;
  const c = v.currency;
  const out: Partial<Record<'debt' | 'interest' | 'cash' | 'shares' | 'profit' | 'trend' | 'returned', React.ReactNode>> = {};
  if (!f) return out;
  if (f.netDebt != null) {
    out.debt =
      f.netDebt <= 0 ? (
        <>It holds <B>{bigMoney(f.cash, c)}</B> of cash against <B>{bigMoney(f.debt, c)}</B> of debt: <B>{bigMoney(-f.netDebt, c)}</B> more than it owes.</>
      ) : f.debtYearsX10 != null ? (
        <>It owes <B>{bigMoney(f.netDebt, c)}</B> more than it holds in cash. A year's free cash ({bigMoney(f.fcfTtm, c)}) would clear that in about <B>{x10(f.debtYearsX10)} years</B>.</>
      ) : (
        <>It owes <B>{bigMoney(f.netDebt, c)}</B> more than it holds in cash, and it isn't bringing in free cash to pay it down.</>
      );
  }
  if (f.interestTtm != null && f.netDebt != null && f.netDebt <= 0 && !(f.interestCoverX10 != null && f.interestCoverX10 > 0)) {
    out.interest =
      f.interestTtm > 0 ? (
        <>It paid <B>{bigMoney(f.interestTtm, c)}</B> of interest last year. Not a worry: it holds more cash than all its debt and could repay the lot today.</>
      ) : (
        <>It has no meaningful interest bill.</>
      );
  } else if (f.interestCoverX10 != null && f.interestTtm != null) {
    out.interest =
      f.interestCoverX10 > 0 ? (
        <>It paid <B>{bigMoney(f.interestTtm, c)}</B> of interest last year and made <B>{bigMoney(f.operatingIncomeTtm, c)}</B> running the business: enough to cover the bill <B>{x10(f.interestCoverX10)} times</B> (<Term k="interest-cover">interest cover</Term>).</>
      ) : (
        <>It paid <B>{bigMoney(f.interestTtm, c)}</B> of interest last year while the business itself <B>lost money</B>: the interest comes out of its cash.</>
      );
  }
  if (f.fcfTtm != null) {
    out.cash =
      f.fcfTtm > 0 ? (
        <>Coming in: <B>{bigMoney(f.fcfTtm, c)}</B> of <Term k="free-cash-flow">free cash</Term> last year, after paying for everything including new equipment.</>
      ) : (
        <>Going out: it used <B>{bigMoney(-f.fcfTtm, c)}</B> last year.{f.runwayMonths != null ? <> Its cash lasts about <B>{f.runwayMonths} months</B> at that pace (<Term k="cash-runway">runway</Term>).</> : null}</>
      );
  }
  if (f.financial && h.roeBps != null) {
    out.profit = <>Every <B>$100</B> of the owners' money in it earned <B>${(h.roeBps / 100).toFixed(2)}</B> last year (<Term k="return-on-equity">return on equity</Term>).</>;
  }
  if (f.financial && h.netIncomeYoY?.kind === 'ok' && h.netIncomeQ != null && h.netIncomeQYearAgo != null) {
    const d = h.netIncomeQ - h.netIncomeQYearAgo;
    out.trend = <>Latest quarter's profit was <B>{bigMoney(h.netIncomeQ, c)}</B>, {bigMoney(Math.abs(d), c)} {d >= 0 ? 'more' : 'less'} than a year earlier ({growthText(h.netIncomeYoY)}).</>;
  }
  const s = h.shareChangeYoY;
  if (s?.kind === 'ok') {
    out.shares =
      s.bps <= -50 ? (
        <>The share count fell <B>{growthText(s).replace('−', '')}</B> over the year: it's <Term k="buyback">buying back stock</Term>, so each share owns a little more.</>
      ) : s.bps <= 200 ? (
        <>The share count is about flat over the year ({growthText(s)}): your slice isn't being shrunk.</>
      ) : (
        <>The share count rose <B>{growthText(s)}</B> over the year: new shares make each existing one a smaller slice (<Term k="dilution">dilution</Term>).</>
      );
  }
  const scale = Math.max(Math.abs(f.cash ?? 0), Math.abs(f.fcfTtm ?? 0), Math.abs(h.netIncomeTtm ?? 0));
  const tiny = (x: number) => x < scale / 100; // housekeeping, not a return to owners (TN.CN's "$377 of buybacks")
  const div = f.dividendsTtm != null && !tiny(f.dividendsTtm) ? f.dividendsTtm : 0;
  const bb = f.buybacksTtm != null && !tiny(f.buybacksTtm) ? f.buybacksTtm : 0;
  if (f.dividendsTtm != null || f.buybacksTtm != null) {
    out.returned =
      div + bb > 0 ? (
        <>
          {div > 0 ? <><B>{bigMoney(div, c)}</B> in <Term k="dividend">dividends</Term></> : null}
          {div > 0 && bb > 0 ? ' and ' : ''}
          {bb > 0 ? <><B>{bigMoney(bb, c)}</B> buying back its own shares</> : null} over the last year.
          {f.stockCompTtm != null && f.stockCompTtm > 0 ? <> It also paid staff <B>{bigMoney(f.stockCompTtm, c)}</B> in <Term k="stock-based-pay">stock</Term>.</> : null}
        </>
      ) : (
        <>Nothing paid out last year: it keeps its cash in the business.</>
      );
  }
  return out;
}

const CHECK_TITLE = { debt: 'Debt', interest: 'Interest', cash: 'Cash flow', shares: 'Your slice', profit: 'Earning power', trend: 'Profit trend' } as const;

export function HealthPanel({ v }: { v: V }) {
  const { p } = usePalette();
  const L = healthLines(v, p);
  const checks = v.checks.filter((k) => L[k.key] != null);
  const good = checks.filter((k) => k.tone === 'good').length;
  const bad = checks.filter((k) => k.tone === 'bad').length;
  const dot = { good: p.pos, ok: p.warn, bad: p.neg } as const;
  return (
    <View>
      <SectionTitle sub="weekly">Financial health</SectionTitle>
      <Card>
        {checks.length > 0 ? (
          <Body>
            <B>{good} of {checks.length}</B> checks look healthy{bad > 0 ? <Text style={{ color: p.neg }}>; {bad} to worry about</Text> : null}.
          </Body>
        ) : (
          <Body muted>Not enough in our feed to grade this yet.</Body>
        )}
        {checks.map((k) => (
          <View key={k.key} style={st.check}>
            <View style={[st.dot, { backgroundColor: dot[k.tone] }]} accessibilityLabel={k.tone} />
            <View style={{ flex: 1 }}>
              <Eyebrow color={p.accent}>{CHECK_TITLE[k.key]}</Eyebrow>
              <Body>{L[k.key]}</Body>
            </View>
          </View>
        ))}
        {L.returned ? (
          <View style={[st.rule, { borderColor: p.cardBorder }]}>
            <Body>
              <Text style={[st.eyebrow, { color: p.accent }]}>HANDED BACK · </Text>
              {L.returned}
            </Body>
          </View>
        ) : null}
      </Card>
    </View>
  );
}

/* ───────────── Health scores ───────────── */

const piotroskiWord = (n: number) => (n >= 7 ? 'strong' : n >= 4 ? 'middling' : 'weak');
const altmanWord = (z: number) => (z >= 3 ? 'safe zone' : z >= 1.8 ? 'grey zone' : 'danger zone');

export function ScoresPanel({ v, listingCurrency }: { v: V; listingCurrency: string | null }) {
  const { p } = usePalette();
  const s = v.health;
  const any = s && (s.piotroski != null || s.altmanZ != null || (s.freeFloatBps != null && s.freeFloatBps > 0) || s.fmpRating);
  const chip = (word: string, tone: 'good' | 'ok' | 'bad') => (
    <Text style={[st.pill, { color: tone === 'good' ? p.pos : tone === 'bad' ? p.neg : p.accent, borderColor: p.cardBorder }]}>{word.toUpperCase()}</Text>
  );
  // FMP's DCF only where it can be read straight (web dcfShowable): same currency, has sales, ≥ $1, within 4×.
  const dcfOk =
    s?.fmpDcfCents != null && s.fmpDcfPriceCents != null && !v.headline.preRevenue && s.fmpDcfPriceCents >= 100 &&
    (!listingCurrency || listingCurrency.toUpperCase() === v.currency.toUpperCase()) &&
    s.fmpDcfCents / s.fmpDcfPriceCents >= 0.25 && s.fmpDcfCents / s.fmpDcfPriceCents <= 4;
  return (
    <View>
      <SectionTitle sub="weekly">Health scores</SectionTitle>
      <Card>
        {!any ? (
          <Body muted>No scores in our feed for this company.</Body>
        ) : (
          <>
            {s!.piotroski != null && (
              <View style={st.score}>
                <View style={st.scoreRow}>
                  <Term k="piotroski" style={[st.eyebrow, { color: p.textMuted }]}>PIOTROSKI</Term>
                  <Text style={[st.scoreVal, tabular, { color: p.textPrimary }]}>{s!.piotroski}/9  {chip(piotroskiWord(s!.piotroski), s!.piotroski >= 7 ? 'good' : s!.piotroski >= 4 ? 'ok' : 'bad')}</Text>
                </View>
                <Small>Passes {s!.piotroski} of 9 yes-or-no tests: is it profitable, is cash coming in, is debt falling, are margins and efficiency improving, has it avoided issuing shares. 7 or more is strong, 3 or less weak.</Small>
              </View>
            )}
            {s!.altmanZ != null && (
              <View style={st.score}>
                <View style={st.scoreRow}>
                  <Term k="altman-z" style={[st.eyebrow, { color: p.textMuted }]}>ALTMAN Z</Term>
                  <Text style={[st.scoreVal, tabular, { color: p.textPrimary }]}>{s!.altmanZ.toFixed(1)}  {chip(altmanWord(s!.altmanZ), s!.altmanZ >= 3 ? 'good' : s!.altmanZ >= 1.8 ? 'ok' : 'bad')}</Text>
                </View>
                <Small>A 1968 formula for the risk of going bust, from profit, assets, debt and market value. Above 3 is safe, below 1.8 is the danger zone. Utilities and other heavy borrowers often sit low by design.</Small>
              </View>
            )}
            {s!.freeFloatBps != null && s!.freeFloatBps > 0 && (
              <View style={st.score}>
                <View style={st.scoreRow}>
                  <Term k="free-float" style={[st.eyebrow, { color: p.textMuted }]}>FREE FLOAT</Term>
                  <Text style={[st.scoreVal, tabular, { color: p.textPrimary }]}>
                    {(s!.freeFloatBps / 100).toFixed(0)}%{s!.freeFloatBps < 2000 ? <Text style={{ color: p.warn, fontSize: 11 }}> small: can be jumpy</Text> : null}
                  </Text>
                </View>
                <Small>The share of stock that trades freely, not locked up by founders, insiders or governments.</Small>
              </View>
            )}
          </>
        )}
        {s?.fmpRating ? (
          <View style={[st.rule, { borderColor: p.cardBorder }]}>
            <Small>
              FMP'S OWN MODEL, NOT OURS: grade {s.fmpRating}
              {dcfOk ? ` · fair value ${bigMoney(s.fmpDcfCents, listingCurrency).replace(/(\d)([KMBT])$/, '$1$2')} vs price ${bigMoney(s.fmpDcfPriceCents, listingCurrency)}` : ''}
            </Small>
          </View>
        ) : null}
        {v.financial ? <Small style={{ marginTop: 8 }}>A bank's card skips the Altman Z-score: it doesn't fit a lender.</Small> : null}
      </Card>
    </View>
  );
}

/* ───────────── What analysts expect — vs last year ───────────── */

type Est = NonNullable<NonNullable<V['estimates']>['nextYear']>;

export function EstimatesPanel({ v }: { v: V }) {
  const { p } = usePalette();
  const e = v.estimates;
  const c = v.currency;
  type Slot = { key: string; title: string; t: Est; vsLabel: string; vsRev: number | null; vsEps: number | null };
  const slots: Slot[] = [];
  const add = (key: string, t: Est | null, kind: 'quarter' | 'year', prev: Est | null) => {
    if (!t) return;
    const title = `${kind === 'quarter' ? 'The quarter' : 'The year'} to ${monthLabel(t.targetEnd)}`;
    if (t.base) slots.push({ key, title, t, vsLabel: kind === 'quarter' ? 'the same quarter last year' : 'the year before', vsRev: t.base.revenue, vsEps: t.base.epsAvg4 });
    else if (prev) slots.push({ key, title, t, vsLabel: 'the forecast for the year before', vsRev: prev.revenueAvg, vsEps: prev.epsAvg4 });
    else slots.push({ key, title, t, vsLabel: '', vsRev: null, vsEps: null });
  };
  if (e) {
    add('q', e.nextQuarter, 'quarter', null);
    add('y1', e.nextYear, 'year', null);
    add('y2', e.followingYear, 'year', e.nextYear);
  }
  const G = ({ g }: { g: FinGrowth | null }) => <Text style={{ color: toneColor(g, p) }}>{growthText(g)}</Text>;
  return (
    <View>
      <SectionTitle sub="daily">What analysts expect</SectionTitle>
      <Card>
        {slots.length === 0 ? (
          <Body muted>No analyst forecasts in our feed for this company.</Body>
        ) : (
          slots.map(({ key, title, t, vsLabel, vsRev, vsEps }, i) => {
            const gRev = t.revenueAvg != null && vsRev != null ? grow(t.revenueAvg, vsRev) : null;
            const gEps = t.epsAvg4 != null && vsEps != null && vsEps > 0 ? grow(t.epsAvg4, vsEps) : null;
            const dRev = t.revenueAvg != null && vsRev != null ? t.revenueAvg - vsRev : null;
            const showRev = !v.financial && t.revenueAvg != null;
            const n = t.analysts;
            const revs = ([30, 90] as const).map((d) => [d, d === 30 ? t.rev30 : t.rev90] as const).filter(([, r]) => r.kind === 'ok');
            return (
              <View key={key} style={i > 0 ? st.slot : undefined}>
                {i > 0 && <Divider />}
                <Eyebrow color={p.accent}>{title}</Eyebrow>
                <Body>
                  {showRev ? (
                    <>
                      Sales of <B>{bigMoney(t.revenueAvg, c)}</B>
                      {dRev != null && gRev ? <>, <B>{bigMoney(Math.abs(dRev), c)}</B> {dRev >= 0 ? 'more' : 'less'} than {vsLabel} (<G g={gRev} />)</> : null}.{' '}
                    </>
                  ) : null}
                  <Term k="eps">Earnings per share</Term> of <B>{epsMoney(t.epsAvg4, c)}</B>
                  {vsEps != null ? <>, against {epsMoney(vsEps, c)} for {vsLabel}{gEps ? <> (<G g={gEps} />)</> : null}</> : null}.
                </Body>
                <Small>
                  {n != null ? `${n} analyst${n === 1 ? '' : 's'}${n <= 2 ? ' (a thin read)' : ''}` : ''}
                  {showRev && t.revenueLow != null && t.revenueHigh != null ? ` · the most cautious says ${bigMoney(t.revenueLow, c)}, the boldest ${bigMoney(t.revenueHigh, c)}` : ''}
                  {!showRev && t.epsLow4 != null && t.epsHigh4 != null ? ` · from ${epsMoney(t.epsLow4, c)} to ${epsMoney(t.epsHigh4, c)} a share` : ''}
                </Small>
                {key !== 'q' && revs.length > 0 ? (
                  <Small>
                    Forecast moves:{' '}
                    {revs.map(([d, r], j) => (r.kind === 'ok' ? `${j > 0 ? ' · ' : ''}${d} days, EPS ${growthText(r.eps)}${v.financial ? '' : `, sales ${growthText(r.revenue)}`}` : '')).join('')}
                  </Small>
                ) : null}
              </View>
            );
          })
        )}
        <Small style={{ marginTop: 10 }}>
          <Term k="estimate-revision">Revisions</Term> (how these forecasts move) appear once our own record is long enough: 30 days from {e?.historySince ?? 'the first snapshot'} for the 30-day change, 90 for the 90-day. Our feed keeps no history of its own.
          {v.financial ? " For banks, the analysts' 'sales' may be counted differently from our feed's revenue." : ''}
        </Small>
      </Card>
    </View>
  );
}

/* ───────────── Where the money comes from — split + growth ───────────── */

type Seg = NonNullable<V['segments']['product']>;
const TOP = 5;

function SegmentBlock({ seg, title, company }: { seg: Seg; title: string; company: string }) {
  const { p } = usePalette();
  const shades = [p.accent, p.accent + 'B3', p.accent + '73', p.pos + '99', p.warn + '99', p.accent + '40'];
  const ccy = seg.currency;
  const c = seg.compare;
  const all =
    c.kind === 'ok' ? c.parts.map((x) => ({ name: x.name, cents: x.cents, prev: x.prevCents as number | null })) : seg.parts.map((x) => ({ name: x.name, cents: x.cents, prev: null as number | null }));
  const ls =
    all.length <= TOP + 1
      ? all
      : [...all.slice(0, TOP), { name: 'Other', cents: all.slice(TOP).reduce((a, x) => a + x.cents, 0), prev: c.kind === 'ok' ? all.slice(TOP).reduce((a, x) => a + (x.prev ?? 0), 0) : null }];
  const total = ls.reduce((a, x) => a + x.cents, 0) || 1;
  let sentence: React.ReactNode;
  if (c.kind === 'ok') {
    const prevTotal = c.parts.reduce((a, x) => a + x.prevCents, 0);
    const up = c.totalChange >= 0;
    const lead = [...c.parts].sort((a, b) => (up ? b.cents - b.prevCents - (a.cents - a.prevCents) : a.cents - a.prevCents - (b.cents - b.prevCents)))[0];
    const leadMove = lead.cents - lead.prevCents;
    const tg = grow(prevTotal + c.totalChange, prevTotal);
    sentence = (
      <>
        Sales {up ? 'grew' : 'fell'} <B>{bigMoney(Math.abs(c.totalChange), ccy)}</B> on a year earlier{tg ? <> (<Text style={{ color: toneColor(tg, p) }}>{growthText(tg)}</Text>)</> : null}.
        {c.totalChange !== 0 && Math.sign(leadMove) === Math.sign(c.totalChange) ? (
          <>
            {' '}<B>{tidyName(lead.name)}</B> {up ? 'brought in' : 'lost'} {bigMoney(Math.abs(leadMove), ccy)} of that
            {lead.shareOfChangeBps != null && lead.shareOfChangeBps <= 10_000 ? ` (${Math.round(lead.shareOfChangeBps / 100)}%)` : ', more than the whole, while others shrank'}.
          </>
        ) : null}
      </>
    );
  } else {
    sentence = <><B>{tidyName(ls[0].name)}</B> brings in <B>{bigMoney(ls[0].cents, ccy)}</B>, {Math.round((ls[0].cents / total) * 100)}% of the total.</>;
  }
  const maxMove = Math.max(1, ...ls.map((x) => (x.prev == null ? 0 : Math.abs(x.cents - x.prev))));
  return (
    <View>
      <View style={st.segHead}>
        <Eyebrow>{title}</Eyebrow>
        <Small>{seg.period === 'FY' ? 'the year' : 'the quarter'} to {monthLabel(seg.periodEnd)}</Small>
      </View>
      <View style={st.shareBar}>
        {ls.map((x, i) => (
          <View key={x.name} style={{ flex: x.cents / total, backgroundColor: shades[i % shades.length] }} />
        ))}
      </View>
      <View style={{ marginTop: 8 }}>
        <Body>{sentence}</Body>
      </View>
      {ls.map((x, i) => {
        const d = x.prev == null ? null : x.cents - x.prev;
        const g = x.prev == null ? null : grow(x.cents, x.prev);
        return (
          <View key={x.name} style={{ marginTop: 7 }}>
            <View style={st.segRow}>
              <View style={[st.segDot, { backgroundColor: shades[i % shades.length] }]} />
              <Text style={[st.segName, { color: p.textPrimary }]} numberOfLines={1}>{tidyName(x.name)}</Text>
              <Text style={[st.small, tabular, { color: p.textMuted }]}>{bigMoney(x.cents, ccy)} · {Math.round((x.cents / total) * 100)}%</Text>
            </View>
            {d != null ? (
              <View style={st.segMove}>
                <Text style={[st.small, tabular, { color: toneColor(g, p), width: 120 }]}>
                  {d >= 0 ? '+' : '−'}{bigMoney(Math.abs(d), ccy)} ({growthText(g)})
                </Text>
                <View style={st.diverge}>
                  <View style={st.half}>{d < 0 ? <View style={{ alignSelf: 'flex-end', height: 4, borderRadius: 2, width: `${(-d / maxMove) * 100}%`, backgroundColor: p.neg }} /> : null}</View>
                  <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: p.cardBorder }} />
                  <View style={st.half}>{d > 0 ? <View style={{ height: 4, borderRadius: 2, width: `${(d / maxMove) * 100}%`, backgroundColor: p.pos }} /> : null}</View>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      {c.kind !== 'ok' ? (
        <Small style={{ marginTop: 6 }}>
          {c.kind === 'resegmented'
            ? `${company} changed how it splits its sales from ${monthLabel(c.since)}, so there's no like-for-like comparison with a year earlier.`
            : 'No figures from a year earlier to compare with yet.'}
        </Small>
      ) : null}
    </View>
  );
}

export function SegmentsPanel({ v }: { v: V }) {
  const { product, geographic } = v.segments;
  const company = v.name ?? 'The company';
  return (
    <View>
      <SectionTitle sub="quarterly">Where the money comes from</SectionTitle>
      <Card>
        {!product && !geographic ? (
          <Body muted>This company doesn't break its sales into separate lines of business in our feed, or reports just one.</Body>
        ) : (
          <View style={{ gap: 18 }}>
            {product ? <SegmentBlock seg={product} title="By business" company={company} /> : null}
            {geographic ? <SegmentBlock seg={geographic} title="By region" company={company} /> : null}
          </View>
        )}
        <Small style={{ marginTop: 10 }}>
          <Term k="business-segment">Segments</Term> show which part of the company is doing the growing.
        </Small>
      </Card>
    </View>
  );
}

/* ───────────── The last earnings call ───────────── */

export function CallPanel({ v }: { v: V }) {
  const { p } = usePalette();
  const c = v.call;
  const s = c?.summary ?? null;
  const gTone = s?.guidance.direction === 'raised' ? p.pos : s && ['lowered', 'withdrawn'].includes(s.guidance.direction) ? p.neg : p.accent;
  const tTone = s?.tone === 'confident' ? p.pos : s?.tone === 'defensive' ? p.neg : p.accent;
  return (
    <View>
      <SectionTitle sub={c ? `call ${monthLabel(c.callDate)}` : 'per quarter'}>The last earnings call</SectionTitle>
      <Card>
        {!c ? (
          <Body muted>No <Term k="earnings-call">earnings-call</Term> transcript in our feed for this company.</Body>
        ) : !s ? (
          <Body muted>The {c.callDate} call (fiscal {c.fiscalYear} Q{c.fiscalQuarter}) isn't summarized yet. We summarize calls for names the fund holds, watches or trades, within about a day.</Body>
        ) : (
          <View style={{ gap: 10 }}>
            <View style={st.pills}>
              <Text style={[st.pill, { color: gTone, borderColor: p.cardBorder }]}>GUIDANCE {s.guidance.direction === 'none' ? 'NOT GIVEN' : s.guidance.direction.toUpperCase()}</Text>
              <Text style={[st.pill, { color: tTone, borderColor: p.cardBorder }]}>TONE: {s.tone.toUpperCase()}</Text>
              <Small>fiscal {c.fiscalYear} Q{c.fiscalQuarter} · {c.callDate}</Small>
            </View>
            <Text style={[st.body, { fontFamily: F.bold, color: p.textPrimary }]}>{s.headline}</Text>
            {s.guidance.detail ? <Body>{s.guidance.detail}</Body> : null}
            {s.highlights.length > 0 ? (
              <View>
                <Eyebrow color={p.accent}>The numbers</Eyebrow>
                {s.highlights.map((x, i) => <Body key={i}>• {x}</Body>)}
              </View>
            ) : null}
            {s.dodged.length > 0 ? (
              <View>
                <Eyebrow color={p.warn}>What they didn't answer</Eyebrow>
                {s.dodged.map((x, i) => <Body key={i}>• {x}</Body>)}
              </View>
            ) : null}
            {s.quotes.map((q, i) => (
              <View key={i} style={[st.quote, { borderColor: p.accent + '55' }]}>
                <Text style={[st.body, { color: p.textPrimary, fontStyle: 'italic' }]}>
                  “{q.text}” <Text style={[st.small, { color: p.textMuted, fontStyle: 'normal' }]}>— {q.speaker}</Text>
                </Text>
              </View>
            ))}
            <Small>{s.toneWhy}</Small>
          </View>
        )}
      </Card>
    </View>
  );
}

/* ───────────── Filings & insiders ───────────── */

const FORM_MEANING: Record<string, string> = {
  '8-K': 'something important happened', '8-K/A': 'a correction to an 8-K', '10-Q': 'quarterly report', '10-Q/A': 'a corrected quarterly report',
  '10-K': 'annual report', '10-K/A': 'a corrected annual report', '6-K': 'an update filed by a foreign company', '20-F': "a foreign company's annual report",
  '40-F': "a Canadian company's annual report, filed in the US", 'S-1': 'registering new shares', 'DEF 14A': 'notice of the shareholder meeting',
  'SC 13D': 'an investor now owns 5%+ and may push for change', 'SC 13D/A': 'an update from a 5%+ activist holder',
};
const ANNUAL = new Set(['10-K', '40-F', '20-F']);

export function FilingsPanel({ v }: { v: V }) {
  const { p } = usePalette();
  const s = v.insiders;
  const fs = v.filings;
  const annual = fs.find((f) => ANNUAL.has(f.form));
  const quarterly = fs.find((f) => f.form === '10-Q');
  const rest = fs.filter((f) => !ANNUAL.has(f.form) && f.form !== '10-Q').slice(0, 5);
  const usd = (c: number) => bigMoney(c, 'USD');
  let insiders: React.ReactNode;
  if (!v.sec) insiders = <Body muted>No US filer we can match for this company. Canadian insiders report on SEDI, which our feed doesn't cover; Alfred's research picks them up instead.</Body>;
  else if (!s) insiders = <Body muted>Insider trades not pulled yet for this company; they arrive with the next daily refresh.</Body>;
  else if (s.buys.count === 0 && s.sells.count === 0)
    insiders = (
      <Body muted>
        {v.sec.crossListed && !fs.some((f) => f.form === '10-K' || f.form === '10-Q')
          ? "No insider trades filed in the US. Canadian companies that file a 40-F report their insiders' trades in Canada (SEDI), which our feed doesn't cover."
          : 'No open-market insider trades in our feed for the last 12 months.'}
      </Body>
    );
  else
    insiders = (
      <>
        <Body>
          Over the last 12 months, insiders{' '}
          {s.sells.count > 0 ? <><B>sold {usd(s.sells.cents)}</B> ({s.sells.count} sale{s.sells.count === 1 ? '' : 's'} by {s.sells.people} {s.sells.people === 1 ? 'person' : 'people'})</> : null}
          {s.sells.count > 0 ? ' and ' : ''}
          {s.buys.count > 0 ? <><B color={p.pos}>bought {usd(s.buys.cents)}</B> ({s.buys.count} purchase{s.buys.count === 1 ? '' : 's'} by {s.buys.people} {s.buys.people === 1 ? 'person' : 'people'})</> : <B>bought nothing</B>}.
        </Body>
        {s.people.map((x) => (
          <View key={x.name} style={st.person}>
            <View style={{ flex: 1 }}>
              <Text style={[st.body, { color: p.textPrimary }]} numberOfLines={1}>{x.name}</Text>
              {x.title ? <Small>{x.title}</Small> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {x.soldCents > 0 ? <Text style={[st.small, tabular, { color: p.warn }]}>sold {usd(x.soldCents)}</Text> : null}
              {x.boughtCents > 0 ? <Text style={[st.small, tabular, { color: p.pos }]}>bought {usd(x.boughtCents)}</Text> : null}
              <Small>last {monthLabel(x.last)}</Small>
            </View>
          </View>
        ))}
        <Small style={{ marginTop: 6 }}>Open-market trades only, not awards or option exercises. Executives selling is common (much of their pay comes in stock); buying with their own cash is the rarer signal.</Small>
      </>
    );
  const Row = ({ f, label }: { f: (typeof fs)[number]; label?: string }) => (
    <Text onPress={() => Linking.openURL(f.docUrl ?? f.url)} style={[st.small, { color: p.textPrimary, marginTop: 4 }]}>
      {label ? `${label} ` : ''}<Text style={{ fontFamily: F.bold, color: p.accent }}>{f.form}</Text>
      {!label ? <Text style={{ color: p.textMuted }}> {FORM_MEANING[f.form] ?? ''}</Text> : null}
      <Text style={{ color: p.textMuted }}>  ·  {f.filedAt}</Text>
    </Text>
  );
  return (
    <View>
      <SectionTitle sub="daily">Filings & insiders</SectionTitle>
      <Card>
        <Eyebrow>The company's own <Term k="insider">insiders</Term></Eyebrow>
        {insiders}
        {fs.length > 0 ? (
          <View style={[st.rule, { borderColor: p.cardBorder }]}>
            <Eyebrow><Term k="sec-filing">SEC filings</Term></Eyebrow>
            {annual ? <Row f={annual} label="Latest annual report" /> : null}
            {quarterly ? <Row f={quarterly} label="Latest quarterly report" /> : null}
            {rest.length > 0 ? <Small style={{ marginTop: 8 }}>OTHER RECENT FILINGS</Small> : null}
            {rest.map((f) => <Row key={f.url} f={f} />)}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

const st = StyleSheet.create({
  body: { fontFamily: F.reg, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: F.reg, fontSize: 11, lineHeight: 15 },
  eyebrow: { fontFamily: F.bold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  check: { flexDirection: 'row', gap: 10, marginTop: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  rule: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  score: { marginBottom: 12 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  scoreVal: { fontFamily: F.semi, fontSize: 14 },
  pill: { fontFamily: F.bold, fontSize: 10, letterSpacing: 0.6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  slot: { paddingTop: 10, marginTop: 10, gap: 6 },
  segHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  shareBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
  segRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segDot: { width: 8, height: 8, borderRadius: 4 },
  segName: { flex: 1, fontFamily: F.reg, fontSize: 13 },
  segMove: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 14, marginTop: 2 },
  diverge: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 6 },
  half: { flex: 1 },
  quote: { borderLeftWidth: 2, paddingLeft: 10 },
  person: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
