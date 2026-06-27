import { Card, Chip, Pnl } from "@/components/ui";
import CollapsibleMd from "@/components/CollapsibleMd";
import { fmtWhen, money } from "@/lib/money";
import { modelLabel, stripDecisionBlock } from "@/lib/race/models";
import type { SessionView, CellView, ModelStanding } from "@/lib/race/standings";

type Position = ModelStanding["positions"][number];

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

/** Roll up a model's calls across the whole day: what it bought / sold / held. */
function daySummary(sessions: SessionView[], model: string) {
  const buys: string[] = [];
  const sells: string[] = [];
  let holds = 0;
  let reads = 0;
  for (const s of sessions) {
    const r = s.cells[model]?.row;
    if (!r) continue;
    if (r.action === "BUY" && r.symbol) buys.push(`${r.symbol}${r.qty ? ` ×${r.qty}` : ""}`);
    else if (r.action === "SELL" && r.symbol) sells.push(r.symbol);
    else if (r.action === "HOLD") holds++;
    else reads++; // NONE / stand-down / pure read
  }
  return { buys, sells, holds, reads };
}

function SummaryCard({ model, sessions, book, champ }: { model: string; sessions: SessionView[]; book: Position[]; champ: boolean }) {
  if (!model) {
    return <div className="rounded-lg border border-teal-400/5 bg-teal-400/[0.01] p-3 text-xs text-teal-200/30">No challenger selected.</div>;
  }
  const { buys, sells, holds, reads } = daySummary(sessions, model);
  return (
    <div className={`rounded-lg border p-3 ${champ ? "border-teal-400/25 bg-teal-400/[0.04]" : "border-teal-400/10 bg-teal-400/[0.02]"}`}>
      <div className="text-xs font-semibold text-teal-50">
        {champ ? "★ " : ""}
        {modelLabel(model)} — today
      </div>
      {/* The CALLS — each buy/sell decision (a name can be re-called) */}
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-teal-200/40">Bought</dt>
          <dd className="text-emerald-300">{buys.length ? buys.join(", ") : "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-teal-200/40">Sold</dt>
          <dd className="text-rose-300">{sells.length ? sells.join(", ") : "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-teal-200/40">Held</dt>
          <dd className="text-teal-100/70">
            {holds} hold{holds === 1 ? "" : "s"}
            {reads ? ` · ${reads} read${reads === 1 ? "" : "s"}` : ""}
          </dd>
        </div>
      </dl>
      {/* The BOOK — what those buy calls add up to (shares @ weighted-avg price), like the bulls. */}
      {book.length > 0 && (
        <div className="mt-2 border-t border-teal-400/10 pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-teal-200/40">Book (what it owns)</div>
          <div className="space-y-0.5">
            {book.map((p) => (
              <div key={p.symbol} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-teal-50">{p.symbol}</span>
                  {p.shares > 0 && p.avgPriceCents != null ? (
                    <span className="tabular-nums text-teal-200/50">
                      {" "}
                      {p.shares} @ {money(p.avgPriceCents)}
                      {p.currency ? ` ${p.currency}` : ""}
                    </span>
                  ) : null}
                </span>
                <Pnl cents={p.pnlCadCents} className="shrink-0 text-[10px]" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One model's call for a session — shown OPEN (only two are on screen now, so no collapsing). */
function ModelCell({ cell, model }: { cell: CellView | undefined; model: string }) {
  if (!cell) {
    return (
      <div className="rounded-lg border border-teal-400/5 bg-teal-400/[0.01] p-3 opacity-50">
        <div className="flex items-center gap-2 text-xs">
          <span className="truncate font-semibold text-teal-200/40">{model ? modelLabel(model) : "—"}</span>
          <span className="ml-auto text-teal-200/30">— no call this session</span>
        </div>
      </div>
    );
  }
  const r = cell.row;
  const champ = r.role === "champion";
  const directional = r.action === "BUY" || r.action === "SELL";
  const text = champ ? r.text : stripDecisionBlock(r.text);
  return (
    <div className={`rounded-lg border p-3 ${champ ? "border-teal-400/25 bg-teal-400/[0.04]" : "border-teal-400/10 bg-teal-400/[0.02]"}`}>
      <div className="flex items-center gap-2 text-xs">
        <span className="truncate font-semibold text-teal-50">
          {champ ? "★ " : ""}
          {modelLabel(model)}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <ActionChip action={r.action} />
          {cell.pnlCadCents != null ? <Pnl cents={cell.pnlCadCents} className="text-xs" /> : null}
        </span>
      </div>

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
    </div>
  );
}

/** The day's call matrix as a 1-vs-1 compare: the champion (Opus) is pinned LEFT, and the RIGHT is
 *  whichever challenger the member clicked in the day-standings strip above (URL `?vs=MODEL`). A
 *  day-summary (what each bought/sold/held) leads, then the session-by-session calls. */
export default function SessionMatrix({
  sessions,
  champion,
  selected,
  standings,
}: {
  sessions: SessionView[];
  champion: string;
  selected: string;
  standings: ModelStanding[];
}) {
  const bookFor = (m: string) => standings.find((s) => s.model === m)?.positions ?? [];
  return (
    <div className="space-y-4">
      {/* Day summary — what each side did across all of today's sessions */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider text-teal-200/40">
          <span>Today so far ·</span>
          <span className="font-semibold text-teal-200/70">★ {modelLabel(champion)}</span>
          <span>vs</span>
          <span className="font-semibold text-teal-200/70">{selected ? modelLabel(selected) : "pick a challenger above"}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <SummaryCard model={champion} sessions={sessions} book={bookFor(champion)} champ />
          <SummaryCard model={selected} sessions={sessions} book={bookFor(selected)} champ={false} />
        </div>
      </div>

      {/* Session-by-session calls */}
      {sessions.map((s) => (
        <Card key={s.key} className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Chip tone="teal">{KIND_LABEL[s.sessionKind] ?? s.sessionKind}</Chip>
            <span className="text-sm text-teal-100/60">{s.reason}</span>
            <span className="ml-auto text-xs text-teal-200/40">{fmtWhen(new Date(s.sessionAt))}</span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <ModelCell cell={s.cells[champion]} model={champion} />
            <ModelCell cell={selected ? s.cells[selected] : undefined} model={selected} />
          </div>
        </Card>
      ))}
    </div>
  );
}
