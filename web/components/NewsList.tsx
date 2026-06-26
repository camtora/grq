// Shared news rendering (D81, M2b). Server component — pure presentational. Renders the
// triaged NewsArticle store with its enrichment (the one-line "why it matters" summary,
// a sentiment dot, a category chip) and degrades cleanly for FMP-fallback rows (no triage
// fields). Used by the stock page + Today's "market pulse". docs/NEWS-AND-EVENTS.md.
import type { NewsCard } from "../lib/news/queries";

const SENT: Record<string, { dot: string; label: string }> = {
  POS: { dot: "bg-emerald-400", label: "positive" },
  NEG: { dot: "bg-rose-400", label: "negative" },
  NEU: { dot: "bg-teal-200/40", label: "neutral" },
};

export function SentimentDot({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null;
  const s = SENT[sentiment] ?? SENT.NEU;
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} title={s.label} aria-label={s.label} />;
}

/** A single news link row with enrichment (title + sentiment, summary, publisher · date · category). */
export function NewsRow({ n }: { n: NewsCard }) {
  return (
    <a href={n.url || "#"} target="_blank" rel="noreferrer" className="block px-4 py-2.5 hover:bg-teal-400/[0.04]">
      <div className="flex items-start gap-1.5">
        <span className="mt-1.5">
          <SentimentDot sentiment={n.sentiment} />
        </span>
        <div className="min-w-0">
          <div className="text-sm leading-snug text-teal-100/80">{n.title}</div>
          {n.summary ? <div className="mt-0.5 text-[12px] leading-snug text-teal-200/55">{n.summary}</div> : null}
          <div className="mt-0.5 text-[11px] text-teal-200/40">
            {n.publisher}
            {n.at ? ` · ${n.at}` : ""}
            {n.category && n.category !== "OTHER" ? (
              <span className="ml-1.5 rounded bg-teal-400/10 px-1 py-px text-[10px] uppercase tracking-wide text-teal-200/50">{n.category}</span>
            ) : null}
          </div>
        </div>
      </div>
    </a>
  );
}
