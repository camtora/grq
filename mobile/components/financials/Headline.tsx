import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, SectionTitle } from '../Chrome';
import { usePalette, F, type Palette } from '../../constants/theme';
import { useGlossary } from '../../store/glossary';
import { bigMoney, bpsText, epsMoney, growthText, growthTone, monthLabel, ptsText, type FinancialsCompany, type FinGrowth } from '../../lib/financials';

// "The business" headline — the web's Report card (D140, decided 2026-10-23): one sentence, four
// tiles, and the 8-quarter bars. Three cards by kind of company, exactly as on the web: a lender or
// insurer leads with profit, EPS and return on equity (its revenue flips gross/net in our feed); a
// company with no sales yet leads with the cash it uses and its runway; everyone else with sales.

const tabular = { fontVariant: ['tabular-nums' as const] };

export function Term({ k, children, style }: { k: string; children: React.ReactNode; style?: object }) {
  const { p } = usePalette();
  const { open } = useGlossary();
  return (
    <Text onPress={() => open(k)} style={[{ textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: p.textMuted }, style]}>
      {children}
    </Text>
  );
}

export const toneColor = (g: FinGrowth | null | undefined, p: Palette) =>
  growthTone(g) === 'up' ? p.pos : growthTone(g) === 'down' ? p.neg : p.textMuted;

function G({ g }: { g: FinGrowth | null | undefined }) {
  const { p } = usePalette();
  return <Text style={{ color: toneColor(g, p) }}>{growthText(g)}</Text>;
}

function B({ children, color }: { children: React.ReactNode; color?: string }) {
  const { p } = usePalette();
  return <Text style={{ fontFamily: F.bold, color: color ?? p.textPrimary }}>{children}</Text>;
}

function Tile({ label, term, value, note, valueColor }: { label: string; term?: string; value: string; note?: React.ReactNode; valueColor?: string }) {
  const { p } = usePalette();
  return (
    <View style={[st.tile, { borderColor: p.cardBorder }]}>
      <Text style={[st.tileLabel, { color: p.textMuted }]} numberOfLines={1}>
        {term ? <Term k={term}>{label}</Term> : label}
      </Text>
      <Text style={[st.tileValue, tabular, { color: valueColor ?? p.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {note ? (
        <Text style={[st.tileNote, { color: p.textMuted }]} numberOfLines={2}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

type Metric = 'revenue' | 'profit' | 'eps' | 'fcf' | 'margin';
const METRIC: Record<Metric, { label: string; term: string }> = {
  revenue: { label: 'Sales', term: 'revenue' },
  profit: { label: 'Profit', term: 'earnings' },
  eps: { label: 'EPS', term: 'eps' },
  fcf: { label: 'Free cash', term: 'free-cash-flow' },
  margin: { label: 'Op. margin', term: 'operating-margin' },
};

/** Eight quarters, one metric at a time; bars hang from a zero line so a loss reads as a loss. On a
 *  phone only the latest bar carries its figure (eight labels don't fit). */
function QuarterBars({ v, metrics }: { v: FinancialsCompany; metrics: Metric[] }) {
  const { p } = usePalette();
  const [m, setM] = useState<Metric>(metrics[0]);
  const ccy = v.currency;
  const pts = v.quarters;
  const val = (q: (typeof pts)[number]) => (m === 'revenue' ? q.revenue : m === 'profit' ? q.netIncome : m === 'eps' ? q.epsQ4 : m === 'fcf' ? q.fcf : q.operatingMarginBps);
  const fmt = (x: number | null) => (x == null ? '—' : m === 'eps' ? epsMoney(x, ccy) : m === 'margin' ? bpsText(x) : bigMoney(x, ccy));
  const yoy = (q: (typeof pts)[number]) => (m === 'revenue' ? q.revenueYoY : m === 'profit' ? q.netIncomeYoY : m === 'eps' ? q.epsYoY : null);
  const vals = pts.map(val);
  const pos = Math.max(0, ...vals.map((x) => x ?? 0));
  const neg = Math.max(0, ...vals.map((x) => -(x ?? 0)));
  const span = pos + neg || 1;
  const H = 96;
  const top = (pos / span) * H;
  const last = pts.length - 1;
  return (
    <View style={{ marginTop: 16 }}>
      <View style={st.chips}>
        {metrics.map((k) => (
          <Pressable key={k} onPress={() => setM(k)} style={[st.chip, m === k && { backgroundColor: p.accent + '26' }]}>
            <Text style={[st.chipText, { color: m === k ? p.accent : p.textMuted }]}>{k === 'revenue' && v.financial ? 'Revenue' : METRIC[k].label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={st.barRow}>
        {pts.map((q, i) => {
          const x = vals[i];
          const h = x == null ? 0 : Math.max((Math.abs(x) / span) * H, 1);
          const g = yoy(q);
          return (
            <View key={q.periodEnd} style={st.barCol}>
              <Text style={[st.barFig, tabular, { color: p.textPrimary, opacity: i === last ? 1 : 0 }]} numberOfLines={1}>
                {fmt(x)}
              </Text>
              <View style={{ height: H, width: '100%' }}>
                {x != null && (
                  <View
                    style={{
                      position: 'absolute',
                      left: '18%',
                      right: '18%',
                      height: h,
                      borderRadius: 2,
                      backgroundColor: x >= 0 ? p.pos : p.neg,
                      opacity: i === last ? 0.95 : 0.5,
                      ...(x >= 0 ? { bottom: H - top } : { top }),
                    }}
                  />
                )}
                <View style={{ position: 'absolute', left: 0, right: 0, top, height: StyleSheet.hairlineWidth, backgroundColor: p.cardBorder }} />
              </View>
              <Text style={[st.barAxis, { color: p.textMuted }]} numberOfLines={1}>
                {monthLabel(q.periodEnd).replace(' 20', " '")}
              </Text>
              {g && i === last ? <Text style={[st.barAxis, tabular, { color: toneColor(g, p) }]}>{growthText(g)}</Text> : null}
            </View>
          );
        })}
      </View>
      <Text style={[st.foot, { color: p.textMuted }]}>
        Each bar is one quarter, oldest on the left. <Term k={METRIC[m].term}>What is this?</Term> Figures in {ccy}, the currency the company reports in.
      </Text>
    </View>
  );
}

export default function Headline({ v, symbol, listingCurrency }: { v: FinancialsCompany; symbol: string; listingCurrency: string | null }) {
  const { p } = usePalette();
  const h = v.headline;
  const ccy = v.currency;
  const rev = v.financial ? 'Revenue' : 'Sales';
  const niDelta = h.netIncomeQ != null && h.netIncomeQYearAgo != null ? h.netIncomeQ - h.netIncomeQYearAgo : null;
  const revDelta = h.revenueQ != null && h.revenueQYearAgo != null ? h.revenueQ - h.revenueQYearAgo : null;
  const otherCcy = listingCurrency && listingCurrency.toUpperCase() !== ccy.toUpperCase();
  const neg = (x: number | null | undefined) => (x != null && x < 0 ? p.neg : undefined);

  let sentence: React.ReactNode;
  if (h.preRevenue) {
    sentence = (
      <>
        <B>No sales yet.</B> {symbol} isn't earning revenue so far (common for explorers and drug developers).
        {h.netIncomeTtm != null && (
          <>
            {' '}Over the last year it {h.netIncomeTtm < 0 ? 'lost' : 'made'} <B>{bigMoney(Math.abs(h.netIncomeTtm), ccy)}</B>
          </>
        )}
        {h.fcfTtm != null && (
          <>
            {' '}and {h.fcfTtm < 0 ? 'used' : 'generated'} <B color={h.fcfTtm < 0 ? p.neg : p.pos}>{bigMoney(Math.abs(h.fcfTtm), ccy)}</B> of cash
          </>
        )}
        .{h.netDebt != null && h.netDebt < 0 ? ` It holds ${bigMoney(-h.netDebt, ccy)} more cash than debt: that runway is the number to watch.` : ''}
      </>
    );
  } else if (v.financial) {
    sentence = (
      <>
        Profit was <B>{bigMoney(h.netIncomeQ, ccy)}</B> in the latest quarter ({h.label}, to {monthLabel(h.asOf)})
        {niDelta != null && h.netIncomeYoY?.kind === 'ok' ? (
          <>
            , {niDelta >= 0 ? 'up' : 'down'} <B color={niDelta >= 0 ? p.pos : p.neg}>{bigMoney(Math.abs(niDelta), ccy)}</B> (<G g={h.netIncomeYoY} />) on the same quarter a year ago
          </>
        ) : null}
        . Earnings per share {epsMoney(h.epsQ4, ccy)} (<G g={h.epsYoY} />).
        {h.netIncomeTtm != null && (
          <>
            {' '}Over the last year: <B>{bigMoney(h.netIncomeTtm, ccy)}</B> of profit.
          </>
        )}
        {h.revenueYoY?.kind === 'nm' && (
          <Text style={{ color: p.textMuted }}>
            {' '}Revenue growth isn't shown: our data feed changed how it counts this {v.sector?.match(/insur/i) ? 'company' : 'bank'}'s revenue (<Term k="bank-revenue">why</Term>).
          </Text>
        )}
      </>
    );
  } else {
    sentence = (
      <>
        {rev} were <B>{bigMoney(h.revenueQ, ccy)}</B> in the latest quarter ({h.label}, to {monthLabel(h.asOf)})
        {revDelta != null && h.revenueYoY?.kind === 'ok' ? (
          <>
            , {revDelta >= 0 ? 'up' : 'down'} <B color={revDelta >= 0 ? p.pos : p.neg}>{bigMoney(Math.abs(revDelta), ccy)}</B> (<G g={h.revenueYoY} />) on the same quarter a year ago
          </>
        ) : null}
        .
        {h.revenueTtm != null && (
          <>
            {' '}Over the last year: <B>{bigMoney(h.revenueTtm, ccy)}</B> of {rev.toLowerCase()}
            {h.netIncomeTtm != null ? `, ${bigMoney(h.netIncomeTtm, ccy)} of profit` : ''}
            {h.fcfTtm != null ? `, ${bigMoney(h.fcfTtm, ccy)} of free cash flow` : ''}.
          </>
        )}
      </>
    );
  }

  return (
    <View>
      <SectionTitle sub={`to ${monthLabel(h.asOf)}`}>The business</SectionTitle>
      <Card>
        <Text style={[st.body, { color: p.textPrimary }]}>
          {sentence}
          {otherCcy ? <Text style={{ color: p.textMuted }}>{` Figures are in ${ccy}, the currency ${symbol} reports in, not the ${listingCurrency} it trades in.`}</Text> : null}
        </Text>

        <View style={st.tiles}>
          {v.financial ? (
            <Tile label="Profit (quarter)" term="earnings" value={bigMoney(h.netIncomeQ, ccy)} note={<><G g={h.netIncomeYoY} /> YoY</>} />
          ) : h.preRevenue ? (
            <Tile label="Sales (12 mo)" term="revenue" value="none yet" valueColor={p.textMuted} />
          ) : (
            <Tile
              label={`${rev} (12 mo)`}
              term="ttm"
              value={bigMoney(h.revenueTtm, ccy)}
              note={
                <>
                  <G g={h.revenueYoY} /> YoY
                  {h.revenueAccelBps != null ? ` · ${h.revenueAccelBps >= 0 ? 'speeding up' : 'slowing'} ${ptsText(Math.abs(h.revenueAccelBps)).replace(/^\+/, '')}` : ''}
                </>
              }
            />
          )}
          <Tile
            label="EPS (quarter)"
            term="eps"
            value={epsMoney(h.epsQ4, ccy)}
            valueColor={neg(h.epsQ4)}
            note={<><G g={h.epsYoY} /> YoY{h.epsQ4YearAgo != null ? ` (was ${epsMoney(h.epsQ4YearAgo, ccy)})` : ''}</>}
          />
          {v.financial ? (
            <Tile label="Return on equity" term="return-on-equity" value={bpsText(h.roeBps)} note="last year's profit ÷ shareholders' money" />
          ) : h.preRevenue ? (
            <Tile label="Profit (12 mo)" term="earnings" value={bigMoney(h.netIncomeTtm, ccy)} valueColor={neg(h.netIncomeTtm)} />
          ) : (
            <Tile
              label="Operating margin"
              term="operating-margin"
              value={bpsText(h.operatingMarginBps)}
              valueColor={neg(h.operatingMarginBps)}
              note={h.operatingMarginChangeBps != null ? `${ptsText(h.operatingMarginChangeBps)} vs a year ago` : undefined}
            />
          )}
          {v.financial ? (
            <Tile
              label="Revenue (12 mo)"
              term="bank-revenue"
              value={h.revenueTtm != null ? bigMoney(h.revenueTtm, ccy) : 'n/m'}
              valueColor={h.revenueTtm != null ? undefined : p.textMuted}
              note={h.revenueTtm != null ? <><G g={h.revenueYoY} /> YoY</> : 'our feed changed how it counts it'}
            />
          ) : (
            <Tile
              label="Free cash (12 mo)"
              term="free-cash-flow"
              value={bigMoney(h.fcfTtm, ccy)}
              valueColor={neg(h.fcfTtm)}
              note={h.fcfMarginBps != null && !h.preRevenue ? `${bpsText(h.fcfMarginBps)} of sales` : h.preRevenue ? 'cash used running the business' : undefined}
            />
          )}
        </View>

        {v.quarters.length >= 2 && (
          <QuarterBars v={v} metrics={v.financial ? ['profit', 'eps'] : h.preRevenue ? ['fcf', 'eps'] : ['revenue', 'eps', 'fcf', 'margin']} />
        )}
      </Card>
    </View>
  );
}

const st = StyleSheet.create({
  body: { fontFamily: F.reg, fontSize: 14, lineHeight: 21 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  tile: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  tileLabel: { fontFamily: F.semi, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  tileValue: { fontFamily: 'System', fontWeight: '800', fontSize: 18, marginTop: 3 },
  tileNote: { fontFamily: F.reg, fontSize: 11, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 },
  chip: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontFamily: F.bold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  barRow: { flexDirection: 'row', gap: 4 },
  barCol: { flex: 1, alignItems: 'center', minWidth: 0 },
  barFig: { fontFamily: F.med, fontSize: 10, marginBottom: 2, alignSelf: 'flex-end' },
  barAxis: { fontFamily: F.reg, fontSize: 9, marginTop: 3 },
  foot: { fontFamily: F.reg, fontSize: 11, marginTop: 10, lineHeight: 15 },
});
