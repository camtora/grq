import Link from "next/link";
import type { Touch } from "@/lib/news/queries";

// "Also touches" — the tracked universe names a headline co-mentions, as small
// chips that link to each name's page. The knowledge graph surfaced on the news
// (docs/KNOWLEDGE-GRAPH.md, Slice 2). Held names are tinted brighter. Kept as a
// sibling of the article link (never nested) so the anchors stay valid.
export default function NewsTouches({ touches }: { touches?: Touch[] }) {
  if (!touches?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 pl-5 text-[10px]">
      <span className="text-teal-200/30">in our universe</span>
      {touches.map((t) => (
        <Link
          key={t.symbol}
          href={`/stocks/${encodeURIComponent(t.symbol)}`}
          title={`${t.name}${t.held ? " · held" : ""}`}
          className={`rounded px-1.5 py-0.5 font-semibold transition-colors hover:bg-teal-400/25 ${
            t.held ? "bg-teal-400/15 text-teal-200" : "bg-teal-400/[0.06] text-teal-300/70"
          }`}
        >
          {t.ticker}
        </Link>
      ))}
    </div>
  );
}
