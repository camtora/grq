import Link from "next/link";
import PanelHeader from "@/components/PanelHeader";
import ChessBoard from "@/components/chess/ChessBoard";
import { bareChainKey, type ChessBoardRef } from "@/lib/chess";

// The supply-chain maps this stock sits on (from the Chess Moves boards; docs/CHESS-MOVES.md),
// surfaced on the stock page (Cam 2026-06-29). On the stock page we show JUST the value-chain
// panels with this name highlighted — no board title, direction chip, thesis, or "how it flows"
// list; those live on the full board (linked top-right). A board is Alfred's web-researched
// ripple reasoning — a LEAD, never a trade or a verdict. Hidden entirely when there are none.
export default function StockChessBoards({ symbol, refs }: { symbol: string; refs: ChessBoardRef[] }) {
  if (refs.length === 0) return null;
  const hl = bareChainKey(symbol);
  const single = refs.length === 1;
  return (
    <div className="flex flex-col gap-4">
      {/* "full board →" sits top-right, in line with the header (single board only; with
          several, each chain carries its own link). */}
      <PanelHeader
        right={
          single ? (
            <Link href={`/chess/${refs[0].themeId}`} className="text-teal-300 hover:underline">
              full board →
            </Link>
          ) : undefined
        }
      >
        The Supply Chain
      </PanelHeader>

      {refs.map((r) => (
        <div key={r.themeId} className="flex flex-col gap-2">
          {!single && (
            <div className="flex justify-end">
              <Link href={`/chess/${r.themeId}`} className="text-xs text-teal-300 hover:underline">
                full board →
              </Link>
            </div>
          )}
          <ChessBoard board={r.board} highlightKey={hl} showLinks={false} />
        </div>
      ))}

      <p className="text-[11px] text-teal-200/40">
        Where {symbol} sits in the value chain — Alfred&apos;s second-order reasoning, a lead, never a verdict or a trade on its own.
      </p>
    </div>
  );
}
