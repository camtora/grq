"use client";

// The Learn hub's "Ask" entry (docs/LEARN-PORTAL.md). Same mechanism as the options portal's
// AskOptions: opens the read-only Alfred chat (the floating bubble, members-only) via the
// `grq:chat` CustomEvent, seeded with market-mechanics starter questions. Viewers don't have
// the chat bubble, so they get the honest note instead.
const PROMPTS = [
  "What actually happens, step by step, when the fund buys a share?",
  "Why is there always a bid AND an ask instead of one price?",
  "If a stock jumps 5% overnight, who moved it while the market was closed?",
  "Why does GRQ measure itself against just buying XIC?",
];

export default function AskLearn({ isMember }: { isMember: boolean }) {
  const open = (q?: string) => {
    window.dispatchEvent(new CustomEvent("grq:chat", { detail: q ? { prompt: q } : {} }));
  };
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-teal-200/70">
        Alfred can explain anything in these courses — or anything on any page.{" "}
        {isMember ? "Open the chat and ask, or start with one of these:" : "Chat is available to fund members."}
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
            className="inline-flex items-center rounded-xl border border-teal-400/30 bg-teal-400/15 px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25"
          >
            Ask Alfred
          </button>
        </>
      ) : null}
    </div>
  );
}
