"use client";

// The "Ask" tab entry (docs/OPTIONS-PORTAL.md). Opens the existing read-only Alfred chat (the floating
// bubble, members-only) via the same `grq:chat` CustomEvent the stock pages use. Deeper options-
// awareness in chat (seeing the experiment's contracts, suggesting plays) is Phase 4; this wires the
// door now. Viewers don't have the chat bubble, so they get the honest note instead.
const PROMPTS = [
  "Explain a long call like I've never traded one.",
  "What's the difference between a covered call and a cash-secured put?",
  "Why can I be right about a stock and still lose on the option?",
  "Walk me through the Greeks on a 45-day at-the-money call.",
];

export default function AskOptions({ isMember }: { isMember: boolean }) {
  const open = (q?: string) => {
    window.dispatchEvent(new CustomEvent("grq:chat", { detail: q ? { prompt: q } : {} }));
  };
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-teal-200/70">
        Alfred can explain any of this in plain English. {isMember ? "Open the chat and ask — or start with one of these:" : "Chat is available to fund members."}
      </p>
      {isMember ? (
        <>
          <div className="flex flex-wrap gap-2">
            {PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => open(p)}
                className="rounded-lg border border-teal-400/15 bg-teal-400/[0.03] px-3 py-1.5 text-left text-xs text-teal-200/80 transition-colors hover:bg-teal-400/10"
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => open()}
            className="rounded-lg border border-teal-400/30 bg-teal-400/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25"
          >
            Ask Alfred
          </button>
          <p className="text-[11px] text-teal-200/40">
            Coming next: chat that can show you the experiment&apos;s live option positions and suggest contracts to drop straight into the calculator.
          </p>
        </>
      ) : null}
    </div>
  );
}
