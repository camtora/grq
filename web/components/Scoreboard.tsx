import { Card } from "./ui";
import type { SourceScore } from "@/lib/scoreboard";
import { fmtDay } from "@/lib/money";

export default function Scoreboard({
  rows,
  title = "Source scoreboard",
  emptyText = "No grades yet — the agent grades every cited source in its retros, and trust accrues here.",
}: {
  rows: SourceScore[];
  title?: string;
  emptyText?: string;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-teal-200/50">{title}</span>
        <span className="text-[10px] uppercase tracking-wider text-teal-200/30">
          +1 right · −1 misleading · ranked after 3 grades
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-teal-200/40">{emptyText}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.slice(0, 12).map((s) => (
              <tr key={s.source} className="border-t border-teal-400/10 first:border-0">
                <td className="py-2 font-medium text-teal-50">{s.source}</td>
                <td className="py-2 text-right tabular-nums">
                  {s.hitRate !== null ? (
                    <span className={s.hitRate >= 0.5 ? "text-emerald-400" : "text-red-400"}>
                      {Math.round(s.hitRate * 100)}%
                    </span>
                  ) : (
                    <span className="text-teal-200/40">unranked</span>
                  )}
                </td>
                <td className="py-2 text-right text-xs tabular-nums text-teal-200/50">
                  {s.hits}✓ {s.misses}✗ {s.neutral}·
                </td>
                <td className="py-2 text-right text-xs text-teal-200/40">{fmtDay(s.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
