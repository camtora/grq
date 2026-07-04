"use client";

import { useEffect, useRef, useState } from "react";

// Lesson-completion tracker (docs/LEARN-FRAMEWORK.md D111 §8). A lesson counts as done
// when its inline checks have been ANSWERED (right or wrong — engagement, not score);
// a checkless lesson gets an explicit "mark as read". Members only (Cam 2026-07-04:
// viewers are read-only — checks still work for them client-side, nothing persists).

export default function LessonProgress({
  courseSlug,
  lessonSlug,
  totalChecks,
  initiallyDone,
  isMember,
}: {
  courseSlug: string;
  lessonSlug: string;
  totalChecks: number;
  initiallyDone: boolean;
  isMember: boolean;
}) {
  const [done, setDone] = useState(initiallyDone);
  const [answered, setAnswered] = useState(0);
  const seen = useRef<Set<string>>(new Set());
  const posted = useRef(initiallyDone);

  const complete = async () => {
    if (posted.current) return;
    posted.current = true;
    try {
      const res = await fetch("/api/learn/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course: courseSlug, lesson: lessonSlug }),
      });
      if (res.ok) setDone(true);
      else posted.current = false;
    } catch {
      posted.current = false;
    }
  };

  useEffect(() => {
    if (!isMember || done || totalChecks === 0) return;
    const onCheck = (e: Event) => {
      const qid = (e as CustomEvent<{ qid?: string }>).detail?.qid;
      if (!qid || seen.current.has(qid)) return;
      seen.current.add(qid);
      setAnswered(seen.current.size);
      if (seen.current.size >= totalChecks) void complete();
    };
    window.addEventListener("grq:learn-check", onCheck);
    return () => window.removeEventListener("grq:learn-check", onCheck);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMember, done, totalChecks]);

  if (!isMember) return null;

  if (done) {
    return <p className="text-xs font-semibold text-emerald-300">✓ Lesson complete</p>;
  }
  if (totalChecks === 0) {
    return (
      <button
        type="button"
        onClick={() => void complete()}
        className="rounded-lg border border-teal-400/30 bg-teal-400/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25"
      >
        Mark as read
      </button>
    );
  }
  return (
    <p className="text-[11px] text-teal-200/45">
      Answer the {totalChecks === 1 ? "check" : `${totalChecks} checks`} to complete this lesson
      {totalChecks > 1 ? ` · ${answered}/${totalChecks}` : ""}
    </p>
  );
}
