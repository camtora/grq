import Link from "next/link";
import { Card } from "@/components/ui";
import StockLogo from "@/components/StockLogo";
import PanelHeader from "@/components/PanelHeader";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import type { RelatedName } from "@/lib/graph/related";

// Market Base Layer Tier-1 read, shown when a related name has no GRQ call yet (mostly
// untracked leads). Only the actionable tags — PASS is noise here. (docs/MARKET-BASE-LAYER.md)
const SCREEN_TAG: Record<string, { label: string; cls: string }> = {
  INTERESTING: { label: "interesting", cls: "bg-emerald-400/10 text-emerald-300" },
  WATCH: { label: "watch", cls: "bg-amber-400/10 text-amber-300" },
};

// "Related names" — the knowledge-graph panel (docs/KNOWLEDGE-GRAPH.md, Slice 1).
// Sits beside "Valuation vs peers" at half width. Each row is a name this stock is
// connected to (FMP peer / shared 13F holder / news co-mention / same sector), with
// honest provenance (`why`) and a 0–100 relatedness weight. Tracked names show GRQ's
// call + link to their dossier; untracked names are leads that link to a page which
// kicks off research on open (D46).
export default function RelatedNames({ items, cadListing = false }: { items: RelatedName[]; cadListing?: boolean }) {
  return (
    <div className="flex h-full flex-col space-y-2">
      <PanelHeader fresh="this load" freshTitle="Computed fresh from the knowledge graph on each page load">
        Related names <span className="normal-case tracking-normal text-teal-200/40">· the graph</span>
      </PanelHeader>
      <Card className="flex-1 p-5">
        {items.length > 0 ? (
          <ul className="text-sm">
            {items.map((r) => {
              const m = stanceMeta(r.stance);
              const tone = m ? STANCE_TONE_CLASSES[m.tone] : null;
              const href = `/stocks/${encodeURIComponent(r.symbol ?? r.ticker)}`;
              return (
                <li key={r.ticker} className="border-t border-teal-400/10 first:border-0">
                  <Link href={href} className="flex items-center gap-3 py-2 transition-colors hover:bg-teal-400/[0.04]">
                    <StockLogo symbol={r.ticker} logoUrl={r.logoUrl} className="h-7 w-7 text-[10px]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-teal-100">{r.ticker}</span>
                        {r.name && r.name !== r.ticker && (
                          <span className="truncate text-xs text-teal-200/40">{r.name}</span>
                        )}
                        {!r.symbol && <span className="shrink-0 text-[10px] uppercase tracking-wide text-teal-200/30">lead</span>}
                      </div>
                      <div className="truncate text-[11px] text-teal-200/40">{r.why}</div>
                    </div>
                    {m && tone ? (
                      <span
                        title={`Alfred's call: ${m.label} — ${m.blurb}`}
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${tone.bg} ${tone.text}`}
                      >
                        {m.abbr}
                      </span>
                    ) : r.screenTag && SCREEN_TAG[r.screenTag] ? (
                      <span
                        title={r.screenTake ?? undefined}
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${SCREEN_TAG[r.screenTag].cls}`}
                      >
                        {SCREEN_TAG[r.screenTag].label}
                      </span>
                    ) : null}
                    <span title="Relatedness 0–100 (peers · 13F overlap · news co-mention)" className="w-7 shrink-0 text-right text-[11px] tabular-nums text-teal-200/30">
                      {r.weight}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-teal-200/40">
            No related names yet — the graph builds from shared analysts (peers), the same 13F holders, and
            news co-mentions{cadListing ? "; coverage is thinner for pure-TSX listings" : ""}.
          </p>
        )}
        <p className="mt-2 text-[11px] text-teal-200/40">
          Names connected to this one — an input we surface, never a trade signal.
        </p>
      </Card>
    </div>
  );
}
