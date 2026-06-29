import Link from "next/link";
import { money, signedMoney, pnlClass, pct } from "@/lib/money";
import { Card, Chip } from "@/components/ui";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";

// A row in a member's personal lane — an external holding stamped with GRQ's EXISTING
// call + whether the fund holds/tracks it. UI-only contrast: the agent never sees these
// holdings; we just render the read GRQ already has. Each lane is ONE member (Graham + Cam
// get SEPARATE lanes, not a mixed table — Cam 2026-06-29).
//
// Book cost + change replace the account name (Cam 2026-06-29): book cost = market value −
// unrealized P&L (when the brokerage reports openPnl), and the change is that TOTAL unrealized
// P&L. SnapTrade gives us no intraday day-change, so "total" is the available fluctuation; both
// degrade to "—" when the brokerage doesn't report cost basis. `account` is kept only as the
// dedupe key (a symbol can sit in more than one account).
export type PersonalRow = {
  symbol: string;
  dossierHref: string;
  description: string | null;
  account: string;
  qty: string;
  marketValueCents: number;
  bookCostCents: number | null; // market value − openPnl, when reported
  openPnlCents: number | null; // total unrealized P&L (the "change")
  currency: string;
  stance: string | null; // GRQ's 7-point call, if it covers the name
  fundHolds: boolean; // the fund holds the same name
  tracked: "ACTIVE" | "CANDIDATE" | null; // in the fund's universe / watchlist
};

export type PersonalOwner = { name: string; photo: string | null };

// Per-currency footer total: holdings + cash + account total, plus the total change
// (color-coded), one row per currency. Cash is DERIVED (account total − holdings) because
// TD-via-SnapTrade reports the explicit cash field as 0 (Cam 2026-06-29).
export type PersonalTotal = {
  currency: string;
  holdingsCents: number; // sum of position market values
  cashCents: number; // derived: account total − holdings (≥ 0)
  totalCents: number; // holdings + cash (= the brokerage's account total)
  changeCents: number | null;
  changeFrac: number | null;
};

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

function StatusChip({ row }: { row: PersonalRow }) {
  if (row.fundHolds) return <Chip tone="green">fund holds</Chip>;
  if (row.tracked === "ACTIVE") return <Chip tone="teal">in universe</Chip>;
  if (row.tracked === "CANDIDATE") return <Chip tone="dim">GRQ watching</Chip>;
  return null;
}

// Whole shares — no decimals (display only; the brokerage may report fractional units).
function qtyDisplay(q: string): string {
  const n = Number(q);
  return Number.isFinite(n) ? n.toLocaleString("en-CA", { maximumFractionDigits: 0 }) : q;
}

function ChangeCell({ pnlCents, bookCents, currency }: { pnlCents: number | null; bookCents: number | null; currency: string }) {
  if (pnlCents == null) return <span className="text-teal-200/30">—</span>;
  const frac = bookCents && bookCents > 0 ? pnlCents / bookCents : null;
  return (
    <span className={`tabular-nums ${pnlClass(pnlCents)}`}>
      {signedMoney(pnlCents, currency)}
      {frac !== null && (
        <span className="ml-1 text-[11px] opacity-70">
          ({frac >= 0 ? "+" : ""}
          {pct(frac, 1)})
        </span>
      )}
    </span>
  );
}

/** One member's personal lane on the Portfolio page: their external holdings, each
 *  contrasted with GRQ's own read. The member title + CAD total live OUTSIDE the card (in a
 *  PanelHeader on the page); this is just the table. Members are NOT mixed — the page renders
 *  a separate lane per person (Cam 2026-06-29). */
export default function PersonalLane({ rows, totals }: { rows: PersonalRow[]; totals: PersonalTotal[] }) {
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
            <th className="w-full py-2 pl-5 pr-3 font-medium">Symbol</th>
            <th className="whitespace-nowrap py-2 pr-3 text-right font-medium">Qty</th>
            <th className="whitespace-nowrap py-2 pr-3 text-right font-medium">Book cost</th>
            <th className="whitespace-nowrap py-2 pr-3 text-right font-medium">Value</th>
            <th className="whitespace-nowrap py-2 pr-3 text-right font-medium">Change</th>
            <th className="whitespace-nowrap py-2 pl-3 pr-5 font-medium">Alfred&apos;s call</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.symbol}-${r.account}`} className="border-t border-teal-400/10">
              {/* The widest column — fills remaining space (w-full) so the company name has
                  room, truncating only when it's genuinely too long (Cam 2026-06-29). */}
              <td className="w-full max-w-0 py-2.5 pl-5 pr-3">
                <Link href={r.dossierHref} className="font-semibold text-teal-300 hover:underline">
                  {r.symbol}
                </Link>
                {r.description ? <div className="truncate text-[11px] text-teal-200/40">{r.description}</div> : null}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-teal-100/80">{qtyDisplay(r.qty)}</td>
              <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-teal-100/70">
                {r.bookCostCents == null ? <span className="text-teal-200/30">—</span> : money(r.bookCostCents, r.currency)}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-teal-50">{money(r.marketValueCents, r.currency)}</td>
              <td className="whitespace-nowrap py-2.5 pr-3 text-right">
                <ChangeCell pnlCents={r.openPnlCents} bookCents={r.bookCostCents} currency={r.currency} />
              </td>
              {/* Alfred's call + the fund-status chip share ONE cell on ONE line (Cam 2026-06-29). */}
              <td className="whitespace-nowrap py-2.5 pl-3 pr-5">
                <div className="flex items-center gap-1.5">
                  <CallChip stance={r.stance} />
                  <StatusChip row={r} />
                </div>
              </td>
            </tr>
          ))}
          {/* Cash sitting in the account (derived) — shown as its own muted row per currency. */}
          {totals
            .filter((t) => t.cashCents > 0)
            .map((t) => (
              <tr key={`cash-${t.currency}`} className="border-t border-teal-400/10">
                <td className="py-2.5 pl-5 pr-3 text-teal-200/55">Cash <span className="text-[10px] uppercase text-teal-200/35">{t.currency}</span></td>
                <td className="py-2.5 pr-3" />
                <td className="py-2.5 pr-3" />
                <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-teal-100/70">{money(t.cashCents, t.currency)}</td>
                <td className="py-2.5 pr-3" />
                <td className="py-2.5 pl-3 pr-5" />
              </tr>
            ))}
        </tbody>
        <tfoot>
          {totals.map((t, i) => (
            <tr key={t.currency} className={`bg-teal-400/[0.03] ${i === 0 ? "border-t border-teal-400/15" : ""}`}>
              <td className="py-2.5 pl-5 pr-3 font-semibold text-teal-200/70" colSpan={3}>
                {i === 0 ? "Total" : ""}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-3 text-right font-semibold tabular-nums text-teal-50">
                <span className="mr-1 text-[10px] uppercase text-teal-200/40">{t.currency}</span>
                {money(t.totalCents, t.currency)}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-3 text-right font-semibold">
                {t.changeCents == null ? (
                  <span className="text-teal-200/30">—</span>
                ) : (
                  <span className={`tabular-nums ${pnlClass(t.changeCents)}`}>
                    {signedMoney(t.changeCents, t.currency)}
                    {t.changeFrac !== null && (
                      <span className="ml-1 text-[11px] opacity-70">
                        ({t.changeFrac >= 0 ? "+" : ""}
                        {pct(t.changeFrac, 1)})
                      </span>
                    )}
                  </span>
                )}
              </td>
              <td className="py-2.5 pl-3 pr-5" />
            </tr>
          ))}
        </tfoot>
      </table>
    </Card>
  );
}
