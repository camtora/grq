import Link from "next/link";
import { money } from "@/lib/money";
import { Card, Chip } from "@/components/ui";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";

// A row in the member's personal lane — their external holding stamped with GRQ's
// EXISTING call + whether the fund holds/tracks it. UI-only contrast: the agent
// never sees these holdings; we just render the read GRQ already has.
export type PersonalRow = {
  symbol: string;
  dossierHref: string;
  description: string | null;
  account: string;
  qty: string;
  marketValueCents: number;
  currency: string;
  stance: string | null; // GRQ's 7-point call, if it covers the name
  fundHolds: boolean; // the fund holds the same name
  tracked: "ACTIVE" | "CANDIDATE" | null; // in the fund's universe / watchlist
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

/** The "Yours" lane on the Portfolio page: the logged-in member's personal
 *  holdings, beside the fund, each contrasted with GRQ's own read. */
export default function PersonalLane({ rows, total }: { rows: PersonalRow[]; total: string }) {
  return (
    <Card className="overflow-x-auto">
      <div className="flex items-baseline justify-between px-5 pt-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-teal-200/50">
          Yours · personal accounts
        </span>
        <Link href="/accounts" className="text-xs text-teal-300 hover:underline">
          accounts →
        </Link>
      </div>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
            <th className="px-5 py-2 font-medium">Symbol</th>
            <th className="px-3 py-2 font-medium">Account</th>
            <th className="px-3 py-2 text-right font-medium">Qty</th>
            <th className="px-3 py-2 text-right font-medium">Value</th>
            <th className="px-5 py-2 font-medium">GRQ&apos;s call</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.symbol}-${r.account}`} className="border-t border-teal-400/10">
              <td className="px-5 py-2.5">
                <Link href={r.dossierHref} className="font-semibold text-teal-300 hover:underline">
                  {r.symbol}
                </Link>
                {r.description ? (
                  <div className="max-w-[16rem] truncate text-[11px] text-teal-200/40">{r.description}</div>
                ) : null}
              </td>
              <td className="px-3 py-2.5 text-teal-200/60">{r.account}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-teal-100/80">{r.qty}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-teal-50">
                {money(r.marketValueCents, r.currency)}
              </td>
              <td className="px-5 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <CallChip stance={r.stance} />
                  {r.fundHolds ? (
                    <Chip tone="green">fund holds</Chip>
                  ) : r.tracked === "ACTIVE" ? (
                    <Chip tone="teal">in universe</Chip>
                  ) : r.tracked === "CANDIDATE" ? (
                    <Chip tone="dim">GRQ watching</Chip>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-teal-400/15 bg-teal-400/[0.03]">
            <td className="px-5 py-2.5 font-semibold text-teal-200/70" colSpan={3}>
              Personal total
            </td>
            <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-teal-50" colSpan={2}>
              {total}
            </td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}
