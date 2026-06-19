"use client";

export default function AskGrq({ symbol }: { symbol?: string }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("grq:chat", { detail: { symbol } }))}
      className="rounded-md border border-teal-400/40 bg-teal-400/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-200 transition-colors hover:bg-teal-400/25 disabled:opacity-40"
    >
      Ask GRQ
    </button>
  );
}
