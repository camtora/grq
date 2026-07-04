// Shared question-grading helpers (docs/LEARN-FRAMEWORK.md D111). Client-safe by design:
// inline lesson checks grade in the browser (formative, zero stakes), and the exam route
// grades server-side with the SAME functions — one set of parsing rules, no drift.
// This module must never import exams.ts (that's where the answer keys live).
import type { LearnQuestion } from "./content";

/** A question as the client is allowed to see it — keys stripped. The exam API serves
 *  these; ExamRunner renders them. */
export type PublicQuestion = {
  id: string;
  prompt: string;
} & (
  | { kind: "choice"; options: { id: string; md: string }[]; multi?: boolean }
  | { kind: "numeric"; unit: "cents" | "shares" | "pct" | "bps" | "years"; placeholder?: string }
);

export function toPublicQuestion(q: LearnQuestion): PublicQuestion {
  if (q.kind === "choice") {
    return { id: q.id, prompt: q.prompt, kind: "choice", options: q.options, ...(q.multi ? { multi: true } : {}) };
  }
  return { id: q.id, prompt: q.prompt, kind: "numeric", unit: q.unit, ...(q.placeholder ? { placeholder: q.placeholder } : {}) };
}

/** Parse a member's numeric answer to the question's integer unit. Money ("cents") is
 *  entered as dollars and parsed with STRING math — the no-floats rule applies to
 *  homework too. Returns null on anything unparseable. */
export function parseNumericAnswer(unit: "cents" | "shares" | "pct" | "bps" | "years", raw: string): number | null {
  const s = raw.trim().replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (!s) return null;
  if (unit === "cents") {
    const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) return null;
    const sign = m[1] === "-" ? -1 : 1;
    const dollars = parseInt(m[2], 10);
    const cents = m[3] ? parseInt(m[3].padEnd(2, "0"), 10) : 0;
    return sign * (dollars * 100 + cents);
  }
  const m = /^-?\d+(?:\.\d+)?$/.exec(s);
  if (!m) return null;
  return Math.round(parseFloat(s));
}

export function numericCorrect(q: Extract<LearnQuestion, { kind: "numeric" }>, raw: string): boolean {
  const v = parseNumericAnswer(q.unit, raw);
  if (v === null) return false;
  return Math.abs(v - q.answer) <= (q.tolerance ?? 0);
}

/** Set-equality on selected option ids (order-independent). */
export function choiceCorrect(q: Extract<LearnQuestion, { kind: "choice" }>, given: string[]): boolean {
  if (given.length !== q.correct.length) return false;
  const want = new Set(q.correct);
  return given.every((id) => want.has(id));
}

/** Human-readable form of a numeric answer for results screens. */
export function formatNumeric(unit: "cents" | "shares" | "pct" | "bps" | "years", value: number): string {
  if (unit === "cents") {
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  }
  if (unit === "pct") return `${value}%`;
  if (unit === "bps") return `${value} bps`;
  if (unit === "years") return `${value} ${value === 1 ? "year" : "years"}`;
  return `${value} ${value === 1 ? "share" : "shares"}`;
}

/** The unit hint shown beside a numeric input. */
export function unitHint(unit: "cents" | "shares" | "pct" | "bps" | "years"): string {
  if (unit === "cents") return "$";
  if (unit === "pct") return "%";
  if (unit === "bps") return "bps";
  if (unit === "years") return "years";
  return "shares";
}
