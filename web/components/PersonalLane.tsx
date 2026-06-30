"use client";

import Link from "next/link";
import { money, pnlClass, pct } from "@/lib/money";
import { Card } from "@/components/ui";
import Term from "@/components/Term";
import SortableTable from "@/components/SortableTable";
import RollingNumber from "@/components/RollingNumber";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import { useLiveQuotes } from "@/components/LiveQuotes";

// A member's personal lane on the Portfolio page — their external (read-only) holdings,
// rendered with the SAME columns + spacing as Alfred's own positions table (Cam 2026-06-30):
// Symbol · Qty · Avg cost · Last · Market value · Unrealized P&L · Alfred's call (the call
// replaces the fund table's Weight column). The numbers tick LIVE off the page's
// <LiveQuotesProvider> — the same quote map the fund positions use — so price/value/change and
// the footer totals roll intraday instead of sitting at the last sync. Each lane is ONE member
// (Graham + Cam get separate lanes). The agent never sees these holdings; we just contrast them
// with the read GRQ already has.
export type PersonalRow = {
  symbol: string;
  quoteSymbol: string; // the key our live quote feed knows this holding by (.TO for CA, bare for US)
  dossierHref: string;
  description: string | null;
  account: string; // dedupe key (a symbol can sit in more than one account)
  acctCurrency: string; // the holding's ACCOUNT currency — the bucket its footer total rolls up into
  qty: string;
  priceCents: number; // last-synced per-share price (the SSR fallback until the first poll)
  marketValueCents: number; // SSR fallback market value
  bookCostCents: number | null; // total cost basis (market value − unrealized P&L), when reported
  openPnlCents: number | null; // SSR fallback unrealized P&L (the "change")
  currency: string; // the holding's own currency
  stance: string | null; // Alfred's 7-point call, if it covers the name
};

// Static per-currency cash (cash doesn't move intraday) — the anchor each footer Total rolls
// up from. Derived server-side (account total − holdings) because TD-via-SnapTrade reports the
// explicit cash field as 0 (Cam 2026-06-29).
export type PersonalCash = { currency: string; cashCents: number };

export type PersonalOwner = { name: string; photo: string | null };

function CallChip({ stance }: { stance: string | null }) {
  const m = stanceMeta(stance);
  if (!m) return <span className="text-xs text-teal-200/30">not covered</span>;
  const t = STANCE_TONE_CLASSES[m.tone];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${t.text} ${t.border} ${t.bg}`}
    >
      {m.label}
    </span>
  );
}

// Whole shares — no decimals (display only; the brokerage may report fractional units).
function qtyDisplay(q: string): string {
  const n = Number(q);
  return Number.isFinite(n) ? n.toLocaleString("en-CA", { maximumFractionDigits: 0 }) : q;
}

const toCad = (cents: number, ccy: string, fx: number) => (ccy.toUpperCase() === "USD" ? Math.round(cents * fx) : cents);
// Convert a holding-currency amount into its ACCOUNT currency (CAD↔USD via the CAD leg).
const toAcct = (cents: number, fromCcy: string, acctCcy: string, fx: number) => {
  if (fromCcy.toUpperCase() === acctCcy.toUpperCase()) return cents;
  const cad = toCad(cents, fromCcy, fx);
  return acctCcy.toUpperCase() === "CAD" ? cad : Math.round(cad / (fx || 1));
};

/** One member's personal lane: external holdings contrasted with Alfred's read, ticking live.
 *  The member title + CAD total live OUTSIDE the card (a PanelHeader on the page); this is the
 *  table. Must render inside a <LiveQuotesProvider> that includes every row's quoteSymbol. */
export default function PersonalLane({
  rows,
  cash,
  fx,
}: {
  rows: PersonalRow[];
  cash: PersonalCash[];
  fx: number;
}) {
  const quotes = useLiveQuotes();

  // Live snapshot of one row: live price → market value → unrealized P&L (vs the static cost
  // basis), with per-share avg cost derived from the cost basis. Falls back to the SSR values
  // (already live-at-render) until the first poll lands.
  const liveOf = (r: PersonalRow) => {
    const q = quotes[r.quoteSymbol.toUpperCase()];
    const qtyNum = Number(r.qty);
    const haveLive = !!q && Number.isFinite(qtyNum) && qtyNum !== 0;
    const price = q?.priceCents ?? r.priceCents;
    const mv = haveLive ? Math.round(qtyNum * price) : r.marketValueCents;
    const openPnl = r.bookCostCents == null ? null : haveLive ? mv - r.bookCostCents : r.openPnlCents;
    const avgCost =
      r.bookCostCents == null || !Number.isFinite(qtyNum) || qtyNum === 0 ? null : Math.round(r.bookCostCents / qtyNum);
    return { price, mv, openPnl, avgCost };
  };

  // Per-currency footer totals (live): holdings roll up into their ACCOUNT-currency bucket,
  // cash is the static anchor, total = cash + holdings, change = Σ unrealized (vs static cost).
  const totals = cash.map(({ currency, cashCents }) => {
    const rowsC = rows.filter((r) => r.acctCurrency.toUpperCase() === currency.toUpperCase());
    let holdings = 0;
    let changeCents = 0;
    let costCents = 0;
    let haveCost = false;
    for (const r of rowsC) {
      const lv = liveOf(r);
      holdings += toAcct(lv.mv, r.currency, currency, fx);
      if (r.bookCostCents != null && lv.openPnl != null) {
        changeCents += toAcct(lv.openPnl, r.currency, currency, fx);
        costCents += toAcct(r.bookCostCents, r.currency, currency, fx);
        haveCost = true;
      }
    }
    return {
      currency,
      totalCents: cashCents + holdings,
      changeCents: haveCost ? changeCents : null,
      changeFrac: haveCost && costCents > 0 ? changeCents / costCents : null,
    };
  });

  // Combined positions value across every currency, valued in CAD (holdings only — no cash).
  const cadPositions = rows.reduce((s, r) => s + toCad(liveOf(r).mv, r.currency, fx), 0);

  const sortableRows = rows.map((r) => {
    const lv = liveOf(r);
    return {
      key: `${r.symbol}-${r.account}`,
      group: r.currency.toUpperCase() === "USD" ? "USD" : "CAD",
      sort: {
        symbol: r.symbol,
        qty: Number(r.qty),
        avgCost: lv.avgCost,
        last: lv.price,
        value: toCad(lv.mv, r.currency, fx), // CAD-normalised so a USD row sorts against a CAD one
        unrealized: lv.openPnl,
      },
      node: (
        <tr key={`${r.symbol}-${r.account}`} className="border-t border-teal-400/10">
          <td className="px-5 py-2.5">
            <Link href={r.dossierHref} className="font-semibold text-teal-300 hover:underline">
              {r.symbol}
            </Link>
          </td>
          <td className="px-5 py-2.5 text-right tabular-nums text-teal-100/80">{qtyDisplay(r.qty)}</td>
          <td className="px-5 py-2.5 text-right tabular-nums text-teal-100/80">
            {lv.avgCost == null ? <span className="text-teal-200/30">—</span> : money(lv.avgCost, r.currency)}
          </td>
          <td className="px-5 py-2.5 text-right tabular-nums text-teal-100/80">
            <RollingNumber value={money(lv.price, r.currency)} />
          </td>
          <td className="px-5 py-2.5 text-right tabular-nums text-teal-50">
            <RollingNumber value={money(lv.mv, r.currency)} />
          </td>
          <td className="px-5 py-2.5 text-right text-sm">
            {lv.openPnl == null ? (
              <span className="text-teal-200/30">—</span>
            ) : (
              <span className={pnlClass(lv.openPnl)}>
                {lv.openPnl >= 0 ? "+" : "−"}
                <RollingNumber value={money(Math.abs(lv.openPnl), r.currency)} />
                {r.bookCostCents && r.bookCostCents > 0 && (
                  <span className="ml-1 text-[11px] opacity-70">
                    ({lv.openPnl >= 0 ? "+" : ""}
                    {pct(lv.openPnl / r.bookCostCents, 1)})
                  </span>
                )}
              </span>
            )}
          </td>
          <td className="px-5 py-2.5">
            <CallChip stance={r.stance} />
          </td>
        </tr>
      ),
    };
  });

  return (
    <Card className="overflow-x-auto">
      <SortableTable
        className="w-full text-sm"
        headRowClassName="text-left text-xs uppercase tracking-wider text-teal-200/40"
        initialSort={{ key: "value", dir: "desc" }}
        groups={[
          { key: "CAD", label: "Canada · CAD" },
          { key: "USD", label: "United States · USD" },
        ]}
        columns={[
          { key: "symbol", label: "Symbol", align: "left" },
          { key: "qty", label: "Qty", align: "right", numeric: true },
          { key: "avgCost", label: <Term k="acb" align="right">Avg cost</Term>, align: "right", numeric: true },
          { key: "last", label: "Last", align: "right", numeric: true },
          { key: "value", label: <Term k="market-value" align="right">Market value</Term>, align: "right", numeric: true },
          { key: "unrealized", label: <Term k="unrealized-pnl" align="right">Unrealized P&L</Term>, align: "right", numeric: true },
          { label: "Alfred's call", align: "left" },
        ]}
        rows={sortableRows}
        footer={
          <>
            {/* Cash sitting in the account (derived) — its own muted row per currency. */}
            {cash
              .filter((c) => c.cashCents > 0)
              .map((c) => (
                <tr key={`cash-${c.currency}`} className="border-t border-teal-400/10">
                  <td className="px-5 py-2.5 text-teal-200/55" colSpan={4}>
                    Cash <span className="text-[10px] uppercase text-teal-200/35">{c.currency}</span>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-teal-100/70">{money(c.cashCents, c.currency)}</td>
                  <td className="px-5 py-2.5" colSpan={2} />
                </tr>
              ))}
            {/* Per-currency account total (holdings + cash) + total change, live. */}
            {totals.map((t, i) => (
              <tr key={t.currency} className={`bg-teal-400/[0.03] ${i === 0 ? "border-t border-teal-400/15" : ""}`}>
                <td className="px-5 py-2.5 font-semibold text-teal-200/70" colSpan={4}>
                  {i === 0 ? "Total" : ""}
                </td>
                <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-teal-50">
                  <span className="mr-1 text-[10px] uppercase text-teal-200/40">{t.currency}</span>
                  <RollingNumber value={money(t.totalCents, t.currency)} />
                </td>
                <td className="px-5 py-2.5 text-right font-semibold">
                  {t.changeCents == null ? (
                    <span className="text-teal-200/30">—</span>
                  ) : (
                    <span className={`tabular-nums ${pnlClass(t.changeCents)}`}>
                      {t.changeCents >= 0 ? "+" : "−"}
                      <RollingNumber value={money(Math.abs(t.changeCents), t.currency)} />
                      {t.changeFrac !== null && (
                        <span className="ml-1 text-[11px] opacity-70">
                          ({t.changeFrac >= 0 ? "+" : ""}
                          {pct(t.changeFrac, 1)})
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-5 py-2.5" />
              </tr>
            ))}
            {/* Combined positions value across every currency, valued in CAD (holdings only). */}
            <tr className="border-t border-teal-400/20 bg-teal-400/[0.06]">
              <td className="px-5 py-2.5 font-semibold text-teal-100/90" colSpan={4}>
                Positions <span className="text-[10px] uppercase tracking-wider text-teal-200/40">total · CAD</span>
              </td>
              <td className="px-5 py-2.5 text-right font-bold tabular-nums text-teal-50">
                <span className="mr-1 text-[10px] uppercase text-teal-200/40">CAD</span>
                <RollingNumber value={money(cadPositions)} />
              </td>
              <td className="px-5 py-2.5" colSpan={2} />
            </tr>
          </>
        }
      />
    </Card>
  );
}
