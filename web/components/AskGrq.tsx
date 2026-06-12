"use client";

export default function AskGrq({ symbol }: { symbol?: string }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("grq:chat", { detail: { symbol } }))}
      className="rounded-xl border border-teal-400/40 bg-teal-400/15 px-4 py-2 text-sm font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25"
    >
      Ask GRQ
    </button>
  );
}
