import Link from "next/link";
import { Card } from "@/components/ui";
import { parseBoard, bareChainKey, type ChessBoardData, type BoardLink } from "@/lib/chess";

// The board — the value chain rendered as one PANEL PER CATEGORY (stage), in chain order
// (upstream → downstream). Each panel holds the real companies in that stage AND the
// directed flows OUT of it ("how it flows", grouped per category instead of one flat blob,
// Cam 2026-06-29). Items that resolve to a play link through. Dependency-free; a
// force-directed SVG graph is a follow-up. Pure display — the chain is Alfred's reasoning,
// never imported data.
export default function ChessBoard({ board, hrefBySym }: { board: ChessBoardData | string | null; hrefBySym?: Map<string, string> }) {
  const data = typeof board === "string" || board == null ? parseBoard(board ?? null) : board;
  if (data.stages.length === 0) return null;

  // Every ticker reference links to its stock page — the play's resolved href when we
  // have it, else the bare-ticker stock page (which kicks off research on open, D46).
  const stockHref = (sym: string) => hrefBySym?.get(bareChainKey(sym)) ?? `/stocks/${encodeURIComponent(bareChainKey(sym))}`;

  // Assign each flow to the stage that CONTAINS its source ticker, so "how it flows" lives
  // inside the relevant category. Track what's claimed → render any orphans in a catch-all.
  const claimed = new Set<BoardLink>();
  const flowsForStage = (symbols: Set<string>): BoardLink[] => {
    const out = data.links.filter((l) => symbols.has(bareChainKey(l.from)));
    out.forEach((l) => claimed.add(l));
    return out;
  };
  const stageData = data.stages.map((st) => {
    const symbols = new Set(st.items.map((i) => i.symbol).filter(Boolean).map((s) => bareChainKey(s!)));
    return { st, flows: flowsForStage(symbols) };
  });
  const orphanFlows = data.links.filter((l) => !claimed.has(l));

  const FlowList = ({ flows }: { flows: BoardLink[] }) => (
    <ul className="space-y-1 text-[13px] text-teal-100/75">
      {flows.map((l, j) => (
        <li key={j} className="tabular-nums">
          <Link href={stockHref(l.from)} className="font-mono text-teal-200 hover:underline">
            {l.from}
          </Link>
          <span className="px-1 text-teal-300/70">→</span>
          <Link href={stockHref(l.to)} className="font-mono text-teal-200 hover:underline">
            {l.to}
          </Link>
          {l.label && <span className="text-teal-200/45"> · {l.label}</span>}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {stageData.map(({ st, flows }, i) => (
        <Card key={i} className="flex flex-col p-4">
          <div className="mb-1 font-semibold text-teal-50">{st.label}</div>
          {st.role && <p className="mb-3 text-xs text-teal-200/45">{st.role}</p>}

          {st.items.length > 0 ? (
            <ul className="space-y-1.5">
              {st.items.map((it, j) => {
                const href = it.symbol ? stockHref(it.symbol) : undefined;
                const head = (
                  <>
                    {it.symbol && <span className="font-mono text-xs font-semibold text-teal-200">{it.symbol}</span>}{" "}
                    <span className="text-teal-100/85">{it.name}</span>
                  </>
                );
                return (
                  <li key={j} className="text-sm leading-snug">
                    {href ? (
                      <Link href={href} className="hover:underline">
                        {head}
                      </Link>
                    ) : (
                      head
                    )}
                    {it.note && <span className="block text-[11px] text-teal-200/45">{it.note}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-teal-200/40">—</p>
          )}

          {flows.length > 0 && (
            <div className="mt-3 border-t border-teal-400/10 pt-2.5">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-teal-200/40">Flows to</div>
              <FlowList flows={flows} />
            </div>
          )}
        </Card>
      ))}

      {orphanFlows.length > 0 && (
        <Card className="p-4 md:col-span-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-teal-200/40">Other flows</div>
          <FlowList flows={orphanFlows} />
        </Card>
      )}
    </div>
  );
}
