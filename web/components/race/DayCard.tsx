import Link from "next/link";
import { Card, Pnl } from "@/components/ui";
import type { DayRollup } from "@/lib/race/standings";

/** A day's race in the overview list. The whole card links into that day's detail. */
export default function DayCard({ d }: { d: DayRollup }) {
  return (
    <Link href={`/race/${d.date}`} className="block">
      <Card className="p-4 transition hover:border-teal-400/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-teal-50">{d.date}</div>
            <div className="text-xs text-teal-200/40">
              {d.sessions} session{d.sessions === 1 ? "" : "s"} · {d.calls} call{d.calls === 1 ? "" : "s"}
            </div>
          </div>
          <div className="text-right">
            {d.leader ? (
              <>
                <div className="text-[10px] uppercase tracking-wider text-teal-200/40">Day leader</div>
                <div className="flex items-center justify-end gap-2 text-sm">
                  <span className="font-semibold text-teal-50">{d.leader.label}</span>
                  <Pnl cents={d.leader.pnlCadCents} />
                </div>
                {d.champion ? (
                  <div className="text-[10px] text-teal-200/40">
                    champion <Pnl cents={d.champion.pnlCadCents} className="text-[10px]" />
                  </div>
                ) : null}
              </>
            ) : (
              <span className="text-xs text-teal-200/30">no scored calls</span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
