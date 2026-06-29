import Link from "next/link";
import { Card } from "@/components/ui";
import { parseBoard, bareChainKey, type ChessBoardData } from "@/lib/chess";

// The board — the value chain rendered as labeled LANES (stages), each holding the
// real companies in it, plus a "flows" list of the directed links between them. A
// dependency-free, honest layout (a force-directed SVG graph is a follow-up). Items
// that resolve to a play's stock page link through; the rest are plain text. Pure
// display — the chain is Alfred's reasoning, never imported data.
export default function ChessBoard({ board, hrefBySym }: { board: ChessBoardData | string | null; hrefBySym?: Map<string, string> }) {
  const data = typeof board === "string" || board == null ? parseBoard(board ?? null) : board;
  if (data.stages.length === 0) return null;

  const linkFor = (s?: string) => (s ? hrefBySym?.get(bareChainKey(s)) : undefined);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.stages.map((st, i) => (
          <Card key={i} className="p-4">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-teal-50">{st.label}</span>
              {st.role && <span className="text-[10px] uppercase tracking-wider text-teal-200/40">{st.role}</span>}
            </div>
            {st.items.length > 0 ? (
              <ul className="space-y-1.5">
                {st.items.map((it, j) => {
                  const href = linkFor(it.symbol);
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
        ))}
      </div>

      {data.links.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-teal-200/40">How it flows</div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-teal-100/75">
            {data.links.map((l, i) => (
              <li key={i} className="tabular-nums">
                <span className="font-mono text-teal-200">{l.from}</span>
                <span className="px-1 text-teal-300/70">→</span>
                <span className="font-mono text-teal-200">{l.to}</span>
                {l.label && <span className="text-teal-200/45"> · {l.label}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
