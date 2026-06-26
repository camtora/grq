import { Card, Chip, Pnl } from "@/components/ui";
import CollapsibleMd from "@/components/CollapsibleMd";
import { fmtWhen } from "@/lib/money";
import { modelLabel, stripDecisionBlock } from "@/lib/race/models";
import type { SessionView } from "@/lib/race/standings";

const KIND_LABEL: Record<string, string> = {
  morning: "Morning plan",
  checkin: "Intraday check-in",
  midday: "Midday brief",
  eod: "EOD report",
  position: "Position check",
};

function ActionChip({ action }: { action: string | null }) {
  if (!action) return <span className="text-[10px] uppercase tracking-wider text-teal-200/30">read</span>;
  const tone: "green" | "red" | "dim" = action === "BUY" ? "green" : action === "SELL" ? "red" : "dim";
  return <Chip tone={tone}>{action}</Chip>;
}

/** The day's call matrix: one card per session, a cell per model (champion first, flagged). Each
 *  cell is a native <details> — click to expand that model's reasoning. Models that didn't run a
 *  session show "—". Scales to 6–8 models by wrapping the cell grid. */
export default function SessionMatrix({ sessions, models }: { sessions: SessionView[]; models: string[] }) {
  return (
    <div className="space-y-4">
      {sessions.map((s) => (
        <Card key={s.key} className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Chip tone="teal">{KIND_LABEL[s.sessionKind] ?? s.sessionKind}</Chip>
            <span className="text-sm text-teal-100/60">{s.reason}</span>
            <span className="ml-auto text-xs text-teal-200/40">{fmtWhen(s.sessionAt)}</span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {models.map((m) => {
              const cell = s.cells[m];
              if (!cell) {
                return (
                  <div key={m} className="rounded-lg border border-teal-400/5 bg-teal-400/[0.01] p-2 opacity-50">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="truncate font-semibold text-teal-200/40">{modelLabel(m)}</span>
                      <span className="ml-auto text-teal-200/30">—</span>
                    </div>
                  </div>
                );
              }
              const r = cell.row;
              const champ = r.role === "champion";
              const directional = r.action === "BUY" || r.action === "SELL";
              const text = champ ? r.text : stripDecisionBlock(r.text);
              return (
                <details
                  key={m}
                  className={`rounded-lg border p-2 ${champ ? "border-teal-400/25 bg-teal-400/[0.04]" : "border-teal-400/10 bg-teal-400/[0.02]"}`}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-xs">
                    <span className="truncate font-semibold text-teal-50">
                      {champ ? "★ " : ""}
                      {modelLabel(m)}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <ActionChip action={r.action} />
                      {cell.pnlCadCents != null ? <Pnl cents={cell.pnlCadCents} className="text-xs" /> : null}
                    </span>
                  </summary>

                  {directional && r.symbol ? (
                    <div className="mt-1 text-xs text-teal-100/70">
                      <span className="font-semibold text-teal-50">
                        {r.action} {r.qty ?? ""} {r.symbol}
                      </span>
                      {r.confidence != null ? ` · ${r.confidence}%` : ""}
                      {r.entryPriceCents == null ? " · unpriced" : ""}
                    </div>
                  ) : null}

                  <div className="mt-2 border-t border-teal-400/10 pt-2">
                    <CollapsibleMd text={text} threshold={100000} />
                  </div>
                </details>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
