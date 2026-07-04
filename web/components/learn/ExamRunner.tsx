"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Md from "@/components/Md";
import type { PublicQuestion } from "@/lib/learn/answers";
import { parseNumericAnswer, unitHint } from "@/lib/learn/answers";

// The exam sitting (docs/LEARN-FRAMEWORK.md D111 §7.3). Questions arrive from the API
// with answer keys STRIPPED and order shuffled per attempt; grading happens server-side.
// Results come back with per-question teach-backs and review links. Members only — the
// page and the API both guard.

type ExamPayload = {
  version: number;
  passPct: number;
  attempts: number;
  best: number | null;
  questions: PublicQuestion[];
};

type ResultPayload = {
  scorePct: number;
  passed: boolean;
  passPct: number;
  attempts: number;
  best: number;
  results: { id: string; ok: boolean; expected: string; explain: string; reviewLesson?: string; reviewTitle?: string }[];
};

export default function ExamRunner({ courseSlug }: { courseSlug: string }) {
  const [exam, setExam] = useState<ExamPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ResultPayload | null>(null);

  const load = async () => {
    setExam(null);
    setResult(null);
    setAnswers({});
    setError(null);
    try {
      const res = await fetch(`/api/learn/exam/${courseSlug}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      setExam(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the exam.");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseSlug]);

  const answeredCount = exam
    ? exam.questions.filter((q) => {
        const a = answers[q.id];
        if (q.kind === "numeric") return typeof a === "string" && parseNumericAnswer(q.unit, a) !== null;
        return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.length > 0;
      }).length
    : 0;

  const submit = async () => {
    if (!exam || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/learn/exam/${courseSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grading failed — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !exam) return <p className="text-sm text-amber-300">{error}</p>;
  if (!exam) return <p className="text-sm text-teal-200/50">Loading the exam…</p>;

  // ── results view ──
  if (result) {
    const byId = new Map(exam.questions.map((q) => [q.id, q]));
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-teal-400/15 bg-teal-400/[0.03] p-5">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className={`text-3xl font-bold tabular-nums ${result.passed ? "text-emerald-300" : "text-amber-300"}`}>
              {result.scorePct}%
            </span>
            <span className={`text-sm font-semibold ${result.passed ? "text-emerald-300" : "text-amber-300"}`}>
              {result.passed ? "Passed" : `Below the bar (${result.passPct}%)`}
            </span>
            <span className="text-xs text-teal-200/50">
              attempt #{result.attempts} · best {result.best}%
            </span>
          </div>
          <p className="mt-1.5 text-xs text-teal-200/55">
            {result.passed
              ? "Best score stands, attempt count shows — that's the whole honesty policy."
              : "Unlimited retakes. Review the misses below; the questions will reshuffle."}
          </p>
        </div>

        <div className="space-y-3">
          {result.results.map((r, i) => {
            const q = byId.get(r.id);
            return (
              <div key={r.id} className={`rounded-xl border p-4 ${r.ok ? "border-teal-400/10" : "border-amber-400/25 bg-amber-400/[0.03]"}`}>
                <div className="flex items-start gap-2.5">
                  <span className={`mt-0.5 text-sm font-bold ${r.ok ? "text-emerald-300" : "text-amber-300"}`}>{r.ok ? "✓" : "✗"}</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    {q ? <Md text={`**${i + 1}.** ${q.prompt}`} className="text-xs" /> : null}
                    {!r.ok ? (
                      <p className="text-xs text-teal-100/80">
                        <span className="text-teal-200/50">Answer: </span>
                        <span className="font-semibold">{r.expected}</span>
                      </p>
                    ) : null}
                    <Md text={r.explain} className="text-xs" />
                    {!r.ok && r.reviewLesson ? (
                      <Link href={`/learn/${courseSlug}/${r.reviewLesson}`} className="inline-block text-xs text-teal-300 hover:underline">
                        review: {r.reviewTitle ?? r.reviewLesson} →
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-teal-400/30 bg-teal-400/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25"
          >
            Retake
          </button>
          <Link href={`/learn/${courseSlug}`} className="text-xs text-teal-300 hover:underline">
            back to the course →
          </Link>
        </div>
      </div>
    );
  }

  // ── sitting view ──
  return (
    <div className="space-y-5">
      {exam.attempts > 0 ? (
        <p className="text-xs text-teal-200/50">
          You&apos;ve sat this exam {exam.attempts} {exam.attempts === 1 ? "time" : "times"} · best {exam.best}%. Best score stands.
        </p>
      ) : null}

      {exam.questions.map((q, i) => (
        <div key={q.id} className="rounded-xl border border-teal-400/10 bg-teal-400/[0.02] p-4">
          <Md text={`**${i + 1}.** ${q.prompt}`} className="text-sm" />
          {q.kind === "choice" ? (
            <div className="mt-3 space-y-1.5">
              {q.options.map((o) => {
                const current = answers[q.id];
                const picked = Array.isArray(current) ? current.includes(o.id) : current === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() =>
                      setAnswers((a) => {
                        if (!q.multi) return { ...a, [q.id]: o.id };
                        const prev = Array.isArray(a[q.id]) ? (a[q.id] as string[]) : [];
                        return { ...a, [q.id]: picked ? prev.filter((x) => x !== o.id) : [...prev, o.id] };
                      })
                    }
                    className={`block w-full rounded-lg border px-3 py-2 text-left text-xs text-teal-100/85 transition-colors ${
                      picked ? "border-teal-400/50 bg-teal-400/10" : "border-teal-400/15 bg-teal-400/[0.03] hover:bg-teal-400/10"
                    }`}
                  >
                    <Md text={o.md} className="text-xs" />
                  </button>
                );
              })}
              {q.multi ? <p className="text-[10px] text-teal-200/40">pick every answer that applies</p> : null}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              {q.unit === "cents" ? <span className="text-xs text-teal-200/60">$</span> : null}
              <input
                type="text"
                inputMode="decimal"
                value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                placeholder={q.placeholder ?? ""}
                className="w-32 rounded-lg border border-teal-400/20 bg-transparent px-2.5 py-1.5 text-sm tabular-nums text-teal-50 placeholder:text-teal-200/25 focus:border-teal-400/50 focus:outline-none"
              />
              {q.unit !== "cents" ? <span className="text-xs text-teal-200/60">{unitHint(q.unit)}</span> : null}
            </div>
          )}
        </div>
      ))}

      {error ? <p className="text-xs text-amber-300">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={answeredCount < exam.questions.length || submitting}
          onClick={() => void submit()}
          className="rounded-lg border border-teal-400/30 bg-teal-400/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25 disabled:opacity-40"
        >
          {submitting ? "Grading…" : "Submit"}
        </button>
        <span className="text-[11px] text-teal-200/45">
          {answeredCount}/{exam.questions.length} answered · pass ≥ {exam.passPct}%
        </span>
      </div>
    </div>
  );
}
