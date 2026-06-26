"use client";

import { useMemo, useState } from "react";
import { Card, Chip, Pnl } from "@/components/ui";
import CollapsibleMd from "@/components/CollapsibleMd";
import { fmtWhen } from "@/lib/money";
import { modelLabel, stripDecisionBlock } from "@/lib/race/models";
import type { SessionView, CellView } from "@/lib/race/standings";

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

function SummaryCard({ model, sessions, champ }: { model: string; sessions: SessionView[]; champ: boolean }) {
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

/** The day's call matrix as a 1-vs-1 compare: the champion (Opus) is pinned LEFT, a single day-level
 *  picker chooses which challenger fills the RIGHT. A day-summary (what each bought/sold/held) leads,
 *  then the session-by-session calls. Beats stacking all 6–8 models per section. */
export default function SessionMatrix({ sessions, models }: { sessions: SessionView[]; models: string[] }) {
  const champion = useMemo(
    () => models.find((m) => sessions.some((s) => s.cells[m]?.row.role === "champion")) ?? models[0] ?? "",
    [models, sessions],
  );
  const challengers = useMemo(() => models.filter((m) => m !== champion), [models, champion]);
  const [sel, setSel] = useState<string>(challengers[0] ?? "");

  return (
    <div className="space-y-4">
      {/* Comparison picker — centered */}
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-teal-400/10 bg-teal-400/[0.02] px-3 py-2 text-xs">
        <span className="text-teal-200/50">Compare</span>
        <span className="font-semibold text-teal-50">★ {modelLabel(champion)}</span>
        <span className="text-teal-200/40">vs</span>
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="rounded-lg border border-teal-400/20 bg-teal-400/5 px-2.5 py-1 font-semibold text-teal-100 outline-none hover:bg-teal-400/10"
        >
          {challengers.length === 0 ? (
            <option value="">no challengers</option>
          ) : (
            challengers.map((m) => (
              <option key={m} value={m} className="bg-[var(--card-bg)] text-teal-100">
                {modelLabel(m)}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Day summary — what each side did across all of today's sessions */}
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-wider text-teal-200/40">Today so far</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <SummaryCard model={champion} sessions={sessions} champ />
          <SummaryCard model={sel} sessions={sessions} champ={false} />
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
            <ModelCell cell={sel ? s.cells[sel] : undefined} model={sel} />
          </div>
        </Card>
      ))}
    </div>
  );
}
