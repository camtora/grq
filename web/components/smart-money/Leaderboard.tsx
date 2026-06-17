import Link from "next/link";
import { Card } from "@/components/ui";
import type { WatchOverlap } from "@/lib/smart-money/types";

// A ranked "most-bought" card, shared by the Congress / funds-piling-in / insider
// boards. Rows lead with the ticker + a headline metric and a subtle magnitude
// bar; names we track link to the stock page and wear an overlap badge.
export type LeaderRow = {
  symbol: string;
  name?: string | null;
  value: number; // for bar scaling + sort (already sorted by caller)
  primary: string; // headline metric, e.g. "7 members" / "$25.0M"
  secondary?: string | null;
  overlap?: WatchOverlap | null;
};

export default function Leaderboard({
  title,
  blurb,
  rows,
  empty,
}: {
  title: string;
  blurb: string;
  rows: LeaderRow[];
  empty?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <Card className="p-4">
      <div className="mb-1 text-sm font-semibold text-teal-50">{title}</div>
      <p className="mb-3 text-[11px] text-teal-200/40">{blurb}</p>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-teal-200/35">{empty ?? "Nothing in this window yet."}</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={`${r.symbol}-${i}`} className="flex items-center gap-2.5">
              <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-teal-200/30">{i + 1}</span>
              <div className="flex w-16 shrink-0 items-center gap-1">
                {r.overlap ? (
                  <Link href={`/stocks/${r.symbol}`} className="font-semibold text-teal-300 hover:underline">
                    {r.symbol}
                  </Link>
                ) : (
                  <span className="font-semibold text-teal-100/90">{r.symbol}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {r.name && (
                    <span className="truncate text-[11px] text-teal-200/45" title={r.name}>
                      {r.name}
                    </span>
                  )}
                  {r.overlap === "universe" && <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300/70">ours</span>}
                  {r.overlap === "watching" && <span className="text-[9px] font-bold uppercase tracking-wider text-teal-300/70">watch</span>}
                </div>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-teal-400/5">
                  <div className="h-full rounded-full bg-teal-400/40" style={{ width: `${Math.max(5, Math.round((r.value / max) * 100))}%` }} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs font-semibold tabular-nums text-teal-100/85">{r.primary}</div>
                {r.secondary && <div className="text-[10px] tabular-nums text-teal-200/35">{r.secondary}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
