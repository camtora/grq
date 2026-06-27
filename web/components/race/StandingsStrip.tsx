import Link from "next/link";
import { Card, Pnl } from "@/components/ui";
import type { ModelStanding } from "@/lib/race/standings";

/** Per-model day standings — 8 compact tiles (champion flagged). The champion (Opus) is pinned as
 *  the left side of the compare; clicking any CHALLENGER tile sets it as the right side (`?vs=MODEL`)
 *  and highlights it. The selected challenger gets a ring. */
export default function StandingsStrip({
  standings,
  date,
  selected,
}: {
  standings: ModelStanding[];
  date: string;
  selected: string;
}) {
  if (standings.length === 0) return null;
  return (
    <Card className="p-4">
      <div className="mb-3 text-[10px] uppercase tracking-wider text-teal-200/40">
        Day standings — click a challenger to compare it with ★ Opus
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {standings.map((s, i) => {
          const isChamp = s.role === "champion";
          const isSel = s.model === selected;
          const inner = (
            <>
              <div className="text-[10px] tabular-nums text-teal-200/40">
                #{i + 1}
                {isChamp ? " ★" : ""}
              </div>
              <div className="mt-0.5 truncate text-xs font-semibold text-teal-50" title={s.label}>
                {s.label}
              </div>
              <div className="mt-1.5">
                {s.scoredCalls ? <Pnl cents={s.pnlCadCents} className="text-sm" /> : <span className="text-xs text-teal-200/30">—</span>}
              </div>
              <div className="mt-0.5 text-[10px] tabular-nums text-teal-200/40">
                {s.hitRate != null ? `${Math.round(s.hitRate * 100)}% hit` : "—"}
              </div>
            </>
          );
          const base = "block rounded-lg border p-2.5 text-center transition-colors";
          if (isChamp) {
            // Pinned left side of the compare — flagged, not a link.
            return (
              <div key={s.model} className={`${base} border-teal-400/30 bg-teal-400/[0.05]`}>
                {inner}
              </div>
            );
          }
          return (
            <Link
              key={s.model}
              href={`/race/${date}?vs=${s.model}`}
              scroll={false}
              className={`${base} ${
                isSel
                  ? "border-teal-400/50 bg-teal-400/10 ring-1 ring-teal-400/40"
                  : "border-teal-400/10 bg-teal-400/[0.02] hover:border-teal-400/30 hover:bg-teal-400/[0.06]"
              }`}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
