"use client";

// Lesson-scoped "ask Alfred" chip (docs/LEARN-FRAMEWORK.md D111 §9) — the same grq:chat
// CustomEvent as AskLearn/AskOptions, seeded with this lesson's context so the chat
// opens mid-conversation instead of cold. Members only (viewers have no chat bubble).

export default function AskLesson({
  lessonTitle,
  courseTitle,
  isMember,
}: {
  lessonTitle: string;
  courseTitle: string;
  isMember: boolean;
}) {
  if (!isMember) return null;
  const ask = () => {
    window.dispatchEvent(
      new CustomEvent("grq:chat", {
        detail: { prompt: `I'm reading the Learn lesson “${lessonTitle}” (${courseTitle}). Walk me through the core idea with a fresh, current example.` },
      }),
    );
  };
  return (
    <button
      type="button"
      onClick={ask}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--card-border)] px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-teal-200/80 transition-colors hover:bg-teal-400/10 hover:text-teal-200"
    >
      Ask Alfred About This Lesson
    </button>
  );
}
