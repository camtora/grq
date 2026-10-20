"use client";

import { useState } from "react";
import { PLAN_INTRO, type PlanQuestion } from "@/lib/plan-questions";
import Term from "./Term";

// The plan's questions, answered in place (D139). Each member picks an answer and may add a note;
// Save appends a PlanAnswer row. Both members' standing answers show under each question, so the
// Thursday review reads them off this card. Seamless for Graham: one click, one optional note,
// one Save per question — nothing to open, no form to submit at the end.
export type ShownAnswer = {
  questionKey: string;
  memberKey: "cam" | "graham" | null;
  name: string;
  choice: string;
  choiceLabel: string;
  note: string | null;
  at: string; // ISO
};

type Draft = { choice: string; note: string; savedAt: string | null; dirty: boolean; busy: boolean; err: string };

// The question text is plain prose for Graham (2026-10-20): paragraphs split on a blank line and a
// `[[slug|label]]` is a glossary word that explains itself on tap (lib/glossary.ts). No markdown
// otherwise, so nothing in the text can surprise the layout.
function Plain({ text, className }: { text: string; className: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {text.split(/\n\s*\n/).map((para, i) => (
        <p key={i}>
          {para.split(/(\[\[[^\][|]+\|[^\][]+\]\])/).map((part, j) => {
            const m = /^\[\[([^\][|]+)\|([^\][]+)\]\]$/.exec(part);
            return m ? (
              <Term key={j} k={m[1].trim().toLowerCase()} className="underline decoration-dotted underline-offset-2">
                {m[2]}
              </Term>
            ) : (
              part
            );
          })}
        </p>
      ))}
    </div>
  );
}

const fmtEt = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function PlanQuestions({
  round,
  questions,
  answers,
  me,
}: {
  round: { key: string; label: string; due: string };
  questions: readonly PlanQuestion[];
  answers: ShownAnswer[];
  me: "cam" | "graham" | null;
}) {
  const mine = (key: string) => answers.find((a) => a.questionKey === key && a.memberKey === me) ?? null;
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      questions.map((q) => {
        const a = mine(q.key);
        return [q.key, { choice: a?.choice ?? "", note: a?.note ?? "", savedAt: a?.at ?? null, dirty: false, busy: false, err: "" }];
      }),
    ),
  );
  const [recorded, setRecorded] = useState<ShownAnswer[]>(answers);

  const patch = (key: string, p: Partial<Draft>) => setDrafts((d) => ({ ...d, [key]: { ...d[key], ...p } }));

  async function save(q: PlanQuestion) {
    const d = drafts[q.key];
    if (!d.choice || d.busy) return;
    patch(q.key, { busy: true, err: "" });
    try {
      const res = await fetch("/api/plan/answers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionKey: q.key, choice: d.choice, note: d.note }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        patch(q.key, { busy: false, err: j.error ?? `HTTP ${res.status}` });
        return;
      }
      const at = typeof j.at === "string" ? j.at : new Date().toISOString();
      patch(q.key, { busy: false, dirty: false, savedAt: at });
      setRecorded((rs) => [
        ...rs.filter((r) => !(r.questionKey === q.key && r.memberKey === me)),
        {
          questionKey: q.key,
          memberKey: me,
          name: me === "graham" ? "Graham" : "Cam",
          choice: d.choice,
          choiceLabel: q.options.find((o) => o.key === d.choice)?.label ?? d.choice,
          note: d.note.trim() || null,
          at,
        },
      ]);
    } catch (e) {
      patch(q.key, { busy: false, err: e instanceof Error ? e.message : String(e) });
    }
  }

  const answered = (who: "cam" | "graham") => recorded.filter((r) => r.memberKey === who).length;

  return (
    <div className="mt-6 border-t border-amber-400/20 pt-5">
      <div className="mb-1 text-sm font-bold uppercase tracking-wider text-amber-300">Your answers, before Thursday</div>
      <p className="mb-2 text-sm text-teal-100/85">{PLAN_INTRO}</p>
      <p className="mb-1 text-sm text-teal-100/85">
        {questions.length} questions for Graham and Cam, due {round.due}. Pick an answer, add a note if it needs one, and save. Every
        answer is recorded with its time, both of you see both, and they go into {round.label}. Change your mind any time before then —
        the newest answer stands.
      </p>
      <p className="mb-4 text-xs text-teal-200/50">
        Graham {answered("graham")} of {questions.length} · Cam {answered("cam")} of {questions.length}
        {me ? "" : " · you are reading, not a member, so the buttons are off"}
      </p>
      <ol className="space-y-4">
        {questions.map((q, i) => {
          const d = drafts[q.key];
          const others = recorded.filter((r) => r.questionKey === q.key && r.memberKey !== me);
          return (
            <li key={q.key} className="rounded-xl border border-teal-400/15 bg-teal-400/[0.03] p-4">
              <div className="text-sm font-semibold text-teal-50">
                <span className="tabular-nums text-amber-300">{i + 1}.</span> {q.title}
              </div>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-teal-200/50">What it means</div>
              <Plain text={q.means} className="mt-0.5 text-xs leading-relaxed text-teal-100/80" />
              <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-teal-200/50">Why we're asking</div>
              <Plain text={q.asks} className="mt-0.5 text-xs leading-relaxed text-teal-200/60" />
              <div className="mt-3 flex flex-wrap gap-2">
                {q.options.map((o) => {
                  const on = d.choice === o.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      disabled={!me || d.busy}
                      onClick={() => patch(q.key, { choice: o.key, dirty: true })}
                      className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                        on ? "border-teal-400 bg-teal-400/15 text-teal-50" : "border-teal-400/20 text-teal-200/70 hover:border-teal-400/50"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={d.note}
                disabled={!me || d.busy}
                onChange={(e) => patch(q.key, { note: e.target.value, dirty: true })}
                placeholder="A note, if the answer needs one"
                rows={2}
                className="mt-2 w-full rounded-lg border border-teal-400/15 bg-black/20 px-2.5 py-1.5 text-xs text-teal-50 placeholder:text-teal-200/30 focus:border-teal-400/50 focus:outline-none disabled:opacity-60"
              />
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <button
                  type="button"
                  disabled={!me || !d.choice || !d.dirty || d.busy}
                  onClick={() => save(q)}
                  className="rounded-lg bg-teal-400/20 px-2.5 py-1 text-xs font-semibold text-teal-50 hover:bg-teal-400/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {d.busy ? "Saving…" : d.savedAt && !d.dirty ? "Saved" : "Save answer"}
                </button>
                {d.savedAt && !d.dirty && <span className="text-teal-200/50">Recorded {fmtEt(d.savedAt)}</span>}
                {d.err && <span className="text-red-300">{d.err}</span>}
              </div>
              {others.map((o) => (
                <div key={o.memberKey ?? o.name} className="mt-2 text-xs text-teal-200/70">
                  <span className="font-semibold text-teal-100">{o.name}:</span> {o.choiceLabel}
                  {o.note ? <span className="text-teal-200/50"> — {o.note}</span> : null}
                  <span className="text-teal-200/35"> · {fmtEt(o.at)}</span>
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
