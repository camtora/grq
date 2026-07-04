"use client";

import { useState } from "react";
import Md from "@/components/Md";
import type { LearnQuestion } from "@/lib/learn/content";
import { choiceCorrect, numericCorrect, parseNumericAnswer, unitHint } from "@/lib/learn/answers";

// An inline lesson check (docs/LEARN-FRAMEWORK.md D111 §7.2) — FORMATIVE by design:
// graded right here in the browser, instant feedback + the teach-back, never scored.
// Keys shipping to the client is intentional (stakes: zero). The graded exams are the
// server's job. On the first answer (right or wrong) it fires `grq:learn-check` so
// LessonProgress can count engagement toward lesson completion.

function announce(qid: string) {
  window.dispatchEvent(new CustomEvent("grq:learn-check", { detail: { qid } }));
}

// No heading of its own — the lesson page's "Check yourself" rail carries the title
// (D111 layout: checks live in a right-hand column beside the lesson, Cam 2026-07-05).
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-teal-400/10 bg-teal-400/[0.02] p-4">
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Explain({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className={`rounded-lg border p-3 ${ok ? "border-emerald-400/25 bg-emerald-400/[0.05]" : "border-amber-400/25 bg-amber-400/[0.05]"}`}>
      <div className={`text-xs font-bold ${ok ? "text-emerald-300" : "text-amber-300"}`}>{ok ? "Right." : "Not quite."}</div>
      <div className="mt-1">
        <Md text={text} className="text-xs" />
      </div>
    </div>
  );
}

export default function CheckBlock({ q }: { q: LearnQuestion }) {
  const [answered, setAnswered] = useState(false);
  const [ok, setOk] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [numRaw, setNumRaw] = useState("");

  const finish = (correct: boolean) => {
    if (!answered) announce(q.id);
    setAnswered(true);
    setOk(correct);
  };

  const reset = () => {
    setAnswered(false);
    setOk(false);
    setPicked([]);
    setNumRaw("");
  };

  if (q.kind === "choice") {
    const multi = !!q.multi;
    const toggle = (id: string) => {
      if (answered) return;
      if (!multi) {
        setPicked([id]);
        finish(choiceCorrect(q, [id]));
        return;
      }
      setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    };
    return (
      <Shell>
        <Md text={q.prompt} className="text-sm" />
        <div className="space-y-1.5">
          {q.options.map((o) => {
            const isPicked = picked.includes(o.id);
            const isCorrect = q.correct.includes(o.id);
            let cls = "border-teal-400/15 bg-teal-400/[0.03] hover:bg-teal-400/10";
            if (answered) {
              if (isCorrect) cls = "border-emerald-400/40 bg-emerald-400/[0.06]";
              else if (isPicked) cls = "border-amber-400/40 bg-amber-400/[0.06]";
              else cls = "border-teal-400/10 opacity-60";
            } else if (isPicked) {
              cls = "border-teal-400/50 bg-teal-400/10";
            }
            return (
              <button
                key={o.id}
                type="button"
                disabled={answered}
                onClick={() => toggle(o.id)}
                className={`block w-full rounded-lg border px-3 py-2 text-left text-xs text-teal-100/85 transition-colors ${cls}`}
              >
                <Md text={o.md} className="text-xs" />
              </button>
            );
          })}
        </div>
        {multi && !answered ? (
          <button
            type="button"
            disabled={picked.length === 0}
            onClick={() => finish(choiceCorrect(q, picked))}
            className="rounded-lg border border-teal-400/30 bg-teal-400/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25 disabled:opacity-40"
          >
            Check
          </button>
        ) : null}
        {answered ? (
          <>
            <Explain ok={ok} text={q.explain} />
            <button type="button" onClick={reset} className="text-[11px] text-teal-300/60 hover:underline">
              try it again
            </button>
          </>
        ) : null}
      </Shell>
    );
  }

  // numeric
  const submit = () => {
    if (answered || parseNumericAnswer(q.unit, numRaw) === null) return;
    finish(numericCorrect(q, numRaw));
  };
  return (
    <Shell>
      <Md text={q.prompt} className="text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        {q.unit === "cents" ? <span className="text-xs text-teal-200/60">$</span> : null}
        <input
          type="text"
          inputMode="decimal"
          value={numRaw}
          disabled={answered}
          onChange={(e) => setNumRaw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={q.placeholder ?? ""}
          className="w-32 rounded-lg border border-teal-400/20 bg-transparent px-2.5 py-1.5 text-sm tabular-nums text-teal-50 placeholder:text-teal-200/25 focus:border-teal-400/50 focus:outline-none disabled:opacity-60"
        />
        {q.unit !== "cents" ? <span className="text-xs text-teal-200/60">{unitHint(q.unit)}</span> : null}
        {!answered ? (
          <button
            type="button"
            onClick={submit}
            disabled={parseNumericAnswer(q.unit, numRaw) === null}
            className="rounded-lg border border-teal-400/30 bg-teal-400/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25 disabled:opacity-40"
          >
            Check
          </button>
        ) : null}
      </div>
      {answered ? (
        <>
          <Explain ok={ok} text={q.explain} />
          <button type="button" onClick={reset} className="text-[11px] text-teal-300/60 hover:underline">
            try it again
          </button>
        </>
      ) : null}
    </Shell>
  );
}
