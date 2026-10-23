"use client";

import { useState } from "react";
import type { DiscussionRow, DiscussionStatus, DiscussionSummary } from "@/lib/plan-discussion";
import { STATUS_LABEL } from "@/lib/plan-discussion";

// Tonight's discussion, curated (D139, Cam 2026-10-22). One row per question: Cam's answer, Graham's
// answer, whether they agree, the prep (what is at stake, where the answers stand, a suggested
// landing), and a place to record what was decided once they have talked. Disagreements come
// first. A decision is the fund's: either member records it, the newest stands.

export type BookLine = { cashPct: number; positions: number; aboveFloor: number; floorUsd: number; lastBuy: string | null };

type Draft = { choice: string; note: string; busy: boolean; err: string };

const fmtEt = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const TONE: Record<DiscussionStatus, string> = {
  agreed: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  differs: "border-red-400/40 bg-red-400/10 text-red-300",
  "both-unsure": "border-amber-400/40 bg-amber-400/10 text-amber-300",
  "one-unsure": "border-amber-400/40 bg-amber-400/10 text-amber-300",
  "awaiting-cam": "border-teal-400/30 bg-teal-400/10 text-teal-300",
  "awaiting-graham": "border-teal-400/30 bg-teal-400/10 text-teal-300",
  "awaiting-both": "border-teal-400/30 bg-teal-400/10 text-teal-300",
};

function Answer({ name, a }: { name: string; a: DiscussionRow["cam"] }) {
  return (
    <div className="rounded-lg border border-teal-400/10 bg-black/15 px-3 py-2 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-teal-100">{name}</span>
        {a && <span className="text-teal-200/35">{fmtEt(a.at)}</span>}
      </div>
      {a ? (
        <>
          <div className="mt-0.5 text-teal-50">{a.choiceLabel}</div>
          {a.note && <div className="mt-1 text-teal-200/70">“{a.note}”</div>}
        </>
      ) : (
        <div className="mt-0.5 italic text-teal-200/40">no answer yet</div>
      )}
    </div>
  );
}

export default function PlanDiscussion({
  rows,
  summary,
  me,
  book,
  prepAsOf,
  roundLabel,
}: {
  rows: DiscussionRow[];
  summary: DiscussionSummary;
  me: "cam" | "graham" | null;
  book: BookLine | null;
  prepAsOf: string;
  roundLabel: string;
}) {
  const [decided, setDecided] = useState<Record<string, DiscussionRow["decision"]>>(() => Object.fromEntries(rows.map((r) => [r.key, r.decision])));
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(rows.map((r) => [r.key, { choice: r.decision?.choice ?? "", note: r.decision?.note ?? "", busy: false, err: "" }])),
  );
  const [openRec, setOpenRec] = useState<Record<string, boolean>>({});
  const patch = (key: string, p: Partial<Draft>) => setDrafts((d) => ({ ...d, [key]: { ...d[key], ...p } }));

  async function record(r: DiscussionRow) {
    const d = drafts[r.key];
    if (!d.choice || d.busy) return;
    patch(r.key, { busy: true, err: "" });
    try {
      const res = await fetch("/api/plan/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionKey: r.key, choice: d.choice, note: d.note }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        patch(r.key, { busy: false, err: j.error ?? `HTTP ${res.status}` });
        return;
      }
      const at = typeof j.at === "string" ? j.at : new Date().toISOString();
      setDecided((x) => ({
        ...x,
        [r.key]: { choice: d.choice, choiceLabel: r.options.find((o) => o.key === d.choice)?.label ?? d.choice, note: d.note.trim() || null, decidedBy: me === "graham" ? "Graham" : "Cam", at },
      }));
      patch(r.key, { busy: false });
      setOpenRec((o) => ({ ...o, [r.key]: false }));
    } catch (e) {
      patch(r.key, { busy: false, err: e instanceof Error ? e.message : String(e) });
    }
  }

  async function post(r: DiscussionRow, choice: string, note: string): Promise<string | null> {
    patch(r.key, { busy: true, err: "" });
    try {
      const res = await fetch("/api/plan/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionKey: r.key, choice, note }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        patch(r.key, { busy: false, err: j.error ?? `HTTP ${res.status}` });
        return null;
      }
      patch(r.key, { busy: false });
      return typeof j.at === "string" ? j.at : new Date().toISOString();
    } catch (e) {
      patch(r.key, { busy: false, err: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }

  /** Record the prep's suggested landing as the decision: its option, its words as the note. */
  async function takeSuggestion(r: DiscussionRow) {
    if (!r.prep || drafts[r.key].busy) return;
    const at = await post(r, r.prep.suggestChoice, r.prep.suggest);
    if (!at) return;
    setDecided((x) => ({
      ...x,
      [r.key]: { choice: r.prep!.suggestChoice, choiceLabel: r.options.find((o) => o.key === r.prep!.suggestChoice)?.label ?? r.prep!.suggestChoice, note: r.prep!.suggest, decidedBy: me === "graham" ? "Graham" : "Cam", at },
    }));
    patch(r.key, { choice: r.prep.suggestChoice, note: r.prep.suggest });
    setOpenRec((o) => ({ ...o, [r.key]: false }));
  }

  /** Undo: records a withdrawal (the history stays); the question is open again. */
  async function undo(r: DiscussionRow) {
    if (drafts[r.key].busy) return;
    const at = await post(r, "withdrawn", "");
    if (!at) return;
    setDecided((x) => ({ ...x, [r.key]: null }));
    patch(r.key, { choice: "", note: "" });
    setOpenRec((o) => ({ ...o, [r.key]: false }));
  }

  const decidedCount = Object.values(decided).filter(Boolean).length;

  return (
    <div>
      <div className="mb-1 text-sm font-bold uppercase tracking-wider text-amber-300">Tonight&apos;s discussion — {roundLabel}</div>
      <p className="mb-3 text-sm text-teal-100/85">
        Both of you have answered. This puts the answers side by side, says where you agree and where you don&apos;t, and gives a short
        prep for each: what hangs on it, where the two answers stand, and a suggested landing. Disagreements come first. When you have
        talked, record the decision under the question; that is what goes into the restart.
      </p>
      {rows.some((r) => r.priority) && (
        <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-sm text-teal-50">
          <span className="font-bold text-amber-300">Cam&apos;s short list for the talk:</span>{" "}
          {rows
            .filter((r) => r.priority)
            .sort((a, b) => a.priority!.rank - b.priority!.rank)
            .map((r) => `question ${r.n}`)
            .join(", ")
            .replace(/, ([^,]*)$/, " and $1")}
          . They&apos;re first below; everything else can follow the suggested landings.
        </p>
      )}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-lg border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-red-300">{summary.differ} you differ</span>
        <span className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-amber-300">{summary.open} open or unsure</span>
        <span className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-emerald-300">{summary.agreed} you agree</span>
        <span className="rounded-lg border border-teal-400/30 bg-teal-400/10 px-2.5 py-1 text-teal-300">
          {decidedCount} of {summary.total} decided
        </span>
      </div>
      {book && (
        <p className="mb-4 text-xs text-teal-200/60">
          Where the book stands going in: {book.positions} stocks, cash {book.cashPct.toFixed(1)}% of the fund, {book.aboveFloor} of the {book.positions} above
          Graham&apos;s US${book.floorUsd.toLocaleString("en-CA")} floor{book.lastBuy ? `, last buy ${book.lastBuy}` : ""}. The whole book is sold flat for the restart, so these numbers describe the old book, not the new one.
        </p>
      )}
      <ol className="space-y-4">
        {rows.map((r) => {
          const dec = decided[r.key];
          const d = drafts[r.key];
          const showRec = openRec[r.key] ?? false;
          return (
            <li key={r.key} className={`rounded-xl border p-4 ${dec ? "border-teal-400/10 bg-teal-400/[0.02]" : "border-teal-400/15 bg-teal-400/[0.03]"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-sm font-semibold text-teal-50">
                  {r.priority && (
                    <span className="mr-2 rounded-lg border border-amber-400/50 bg-amber-400/15 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      Priority {r.priority.rank + 1}
                    </span>
                  )}
                  <span className="tabular-nums text-amber-300">{r.n}.</span> {r.title}
                  {r.priority && <div className="mt-1 text-xs font-normal text-amber-300">{r.priority.ask}</div>}
                </div>
                <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Answer name="Cam" a={r.cam} />
                <Answer name="Graham" a={r.graham} />
              </div>
              {r.prep && (
                <details className="group mt-3" open={!dec && r.status !== "agreed"}>
                  <summary className="cursor-pointer select-none text-xs font-semibold text-teal-300/80 hover:text-teal-300">
                    <span className="group-open:hidden">Prep</span>
                    <span className="hidden group-open:inline">Prep</span>
                    <span className="ml-2 font-normal text-teal-200/40">by Claude, {prepAsOf}, from the answers as recorded</span>
                  </summary>
                  <div className="mt-2 space-y-2 text-xs leading-relaxed">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-teal-200/50">What hangs on it</div>
                      <p className="mt-0.5 text-teal-100/85">{r.prep.stake}</p>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-teal-200/50">Where you stand</div>
                      <p className="mt-0.5 text-teal-100/85">{r.prep.where}</p>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300/80">Suggested landing</div>
                      <p className="mt-0.5 text-teal-50">{r.prep.suggest}</p>
                    </div>
                  </div>
                </details>
              )}
              <div className="mt-3 border-t border-teal-400/10 pt-2 text-xs">
                {dec ? (
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-bold uppercase tracking-wider text-emerald-300">Decided:</span>
                    <span className="text-teal-50">{dec.choiceLabel}</span>
                    {dec.note && <span className="text-teal-200/70">— {dec.note}</span>}
                    <span className="text-teal-200/35">· recorded by {dec.decidedBy} {fmtEt(dec.at)}</span>
                    {me && (
                      <span className="ml-auto flex gap-3">
                        <button type="button" onClick={() => setOpenRec((o) => ({ ...o, [r.key]: !showRec }))} className="text-teal-300/70 hover:text-teal-300">
                          {showRec ? "cancel" : "change"}
                        </button>
                        <button type="button" disabled={d.busy} onClick={() => undo(r)} className="text-teal-300/70 hover:text-red-300 disabled:opacity-50">
                          undo
                        </button>
                      </span>
                    )}
                  </div>
                ) : me ? (
                  !showRec && (
                    <div className="flex flex-wrap items-center gap-2">
                      {r.prep && (
                        <button
                          type="button"
                          disabled={d.busy}
                          onClick={() => takeSuggestion(r)}
                          title={r.prep.suggest}
                          className="rounded-lg border border-amber-400/40 bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-400/25 disabled:opacity-50"
                        >
                          {d.busy ? "Saving…" : "Take the suggested landing"}
                        </button>
                      )}
                      <button type="button" onClick={() => setOpenRec((o) => ({ ...o, [r.key]: true }))} className="rounded-lg bg-teal-400/20 px-2.5 py-1 text-xs font-semibold text-teal-50 hover:bg-teal-400/30">
                        Record something else
                      </button>
                      {d.err && <span className="text-red-300">{d.err}</span>}
                    </div>
                  )
                ) : (
                  <span className="text-teal-200/40">not decided yet</span>
                )}
                {me && showRec && (
                  <div className="mt-2">
                    <div className="flex flex-wrap gap-2">
                      {r.options.map((o) => {
                        const on = d.choice === o.key;
                        return (
                          <button
                            key={o.key}
                            type="button"
                            disabled={d.busy}
                            onClick={() => patch(r.key, { choice: o.key })}
                            className={`rounded-lg border px-2.5 py-1 text-xs transition ${on ? "border-emerald-400 bg-emerald-400/15 text-teal-50" : "border-teal-400/20 text-teal-200/70 hover:border-teal-400/50"} disabled:opacity-60`}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                    <textarea
                      value={d.note}
                      disabled={d.busy}
                      onChange={(e) => patch(r.key, { note: e.target.value })}
                      placeholder="The decision in a sentence: the number, the exception, who asked for what"
                      rows={2}
                      className="mt-2 w-full rounded-lg border border-teal-400/15 bg-black/20 px-2.5 py-1.5 text-xs text-teal-50 placeholder:text-teal-200/30 focus:border-teal-400/50 focus:outline-none disabled:opacity-60"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={!d.choice || d.busy}
                        onClick={() => record(r)}
                        className="rounded-lg border border-emerald-400/40 bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {d.busy ? "Saving…" : "Save the decision"}
                      </button>
                      <span className="text-teal-200/40">Either of you can record it; the newest stands.</span>
                      {d.err && <span className="text-red-300">{d.err}</span>}
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
