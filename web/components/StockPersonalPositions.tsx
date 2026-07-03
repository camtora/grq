import Link from "next/link";
import { Card } from "@/components/ui";
import Avatar from "@/components/Avatar";
import { personByEmail } from "@/lib/people";
import { memberEmails } from "@/lib/users";
import { money, pnlClass } from "@/lib/money";
import { personalPositionsFor } from "@/lib/external/store";

// "In our own accounts" — the members' PERSONAL positions in this name (TD via SnapTrade,
// read-only), on the stock page (Cam 2026-07-03). Both members see both; the PAGE gates it
// to members (viewers never get it). Display-only by design (D97): this renders server-side
// from ExternalHolding — it never touches agent context or tools, so Alfred stays blind.

/** Drop the masked-number tail TD puts in account names ("US_TFSA - 293YM8K" → "US_TFSA"). */
function cleanAccountName(name: string): string {
  return name.replace(/\s*-\s*\S+$/, "");
}

export default async function StockPersonalPositions({ quoteSymbol }: { quoteSymbol: string }) {
  const rows = await personalPositionsFor(memberEmails(), quoteSymbol).catch(() => []);
  if (rows.length === 0) return null;

  return (
    <Card className="mb-6 p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-teal-200/50">
          In our own accounts
        </span>
        <Link href="/accounts" className="text-xs text-teal-300 hover:underline">
          all accounts →
        </Link>
      </div>
      <ul className="divide-y divide-teal-400/10">
        {rows.map((r, i) => {
          const person = personByEmail(r.email);
          return (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <Avatar src={person?.photo ?? null} name={person?.name ?? r.email} size="h-6 w-6" />
              <span className="font-semibold text-teal-100/90">{person?.name ?? r.email}</span>
              <span className="text-xs text-teal-200/50">
                {r.institution} · {cleanAccountName(r.accountName)}
              </span>
              <span className="ml-auto tabular-nums text-teal-200/70">{r.qty} sh</span>
              {r.avgCostCents != null && (
                <span className="tabular-nums text-xs text-teal-200/50">
                  bought @ {money(r.avgCostCents, r.currency)}
                </span>
              )}
              <span className="tabular-nums font-semibold text-teal-50">
                {money(r.marketValueCents, r.currency)}
              </span>
              {r.openPnlCents != null && (
                <span className={`w-24 text-right tabular-nums text-xs ${pnlClass(r.openPnlCents)}`}>
                  {r.openPnlCents >= 0 ? "+" : "−"}
                  {money(Math.abs(r.openPnlCents), r.currency)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[10px] text-teal-200/40">
        Personal positions, read-only via SnapTrade — outside the fund, and invisible to Alfred by design.
      </p>
    </Card>
  );
}
