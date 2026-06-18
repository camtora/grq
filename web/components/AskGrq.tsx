"use client";

export default function AskGrq({ symbol }: { symbol?: string }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("grq:chat", { detail: { symbol } }))}
      className="rounded-lg border border-teal-400/40 bg-teal-400/15 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-teal-200 transition-colors hover:bg-teal-400/25 disabled:opacity-40"
    >
      Ask GRQ
    </button>
  );
}
