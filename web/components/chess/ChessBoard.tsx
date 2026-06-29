import Link from "next/link";
import { Fragment } from "react";
import { Card } from "@/components/ui";
import { parseBoard, bareChainKey, type ChessBoardData } from "@/lib/chess";

// The board — the value chain as a HORIZONTAL left→right rail. Each stage is a column in chain
// order (upstream → downstream), the companies inside link to their stock page, and the stages
// are joined by → arrows so you read the supply chain across the page. Below it, "How it flows"
// names the specific company-to-company links. Horizontally scrollable on narrow screens;
// dependency-free (a force-directed SVG graph is still a follow-up). Pure display — the chain
// is Alfred's reasoning, never imported data.
export default function ChessBoard({ board, hrefBySym }: { board: ChessBoardData | string | null; hrefBySym?: Map<string, string> }) {
  const data = typeof board === "string" || board == null ? parseBoard(board ?? null) : board;
  if (data.stages.length === 0) return null;

  // Every ticker links to its stock page — the play's resolved href when we have it, else the
  // bare-ticker page (which kicks off research on open, D46).
  const stockHref = (s?: string): string | undefined => {
    if (!s) return undefined;
    const k = bareChainKey(s);
    return hrefBySym?.get(k) ?? `/stocks/${encodeURIComponent(k)}`;
  };

  return (
    <div className="space-y-3">
      {/* The horizontal chain — stages left→right, joined by flow arrows. Scrolls sideways
          when the chain is longer than the viewport. */}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-min items-stretch gap-2">
          {data.stages.map((st, i) => (
            <Fragment key={i}>
              <Card className="flex w-56 shrink-0 flex-col p-4">
                <div className="mb-2">
                  <div className="text-sm font-semibold text-teal-50">{st.label}</div>
                  {st.role && <div className="mt-0.5 text-[10px] uppercase tracking-wider text-teal-200/40">{st.role}</div>}
                </div>
                {st.items.length > 0 ? (
                  <ul className="space-y-1.5">
                    {st.items.map((it, j) => {
                      const href = stockHref(it.symbol);
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
              </Card>
              {i < data.stages.length - 1 && (
                <div className="flex shrink-0 items-center self-center px-0.5 text-xl text-teal-300/50" aria-hidden>
                  →
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>

      {data.links.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-teal-200/40">How it flows</div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-teal-100/75">
            {data.links.map((l, i) => {
              const fromHref = stockHref(l.from);
              const toHref = stockHref(l.to);
              return (
                <li key={i} className="tabular-nums">
                  {fromHref ? (
                    <Link href={fromHref} className="font-mono text-teal-200 hover:underline">{l.from}</Link>
                  ) : (
                    <span className="font-mono text-teal-200">{l.from}</span>
                  )}
                  <span className="px-1 text-teal-300/70">→</span>
                  {toHref ? (
                    <Link href={toHref} className="font-mono text-teal-200 hover:underline">{l.to}</Link>
                  ) : (
                    <span className="font-mono text-teal-200">{l.to}</span>
                  )}
                  {l.label && <span className="text-teal-200/45"> · {l.label}</span>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
