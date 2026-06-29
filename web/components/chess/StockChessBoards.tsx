import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import { fmtWhen } from "@/lib/money";
import ChessBoard from "@/components/chess/ChessBoard";
import { bareChainKey, type ChessBoardRef } from "@/lib/chess";

// Cross-reference: the Chess Moves boards this stock is a *play* on (docs/CHESS-MOVES.md),
// surfaced on the stock page under Options (Cam 2026-06-29). A name can sit on several boards
// — we list them all. A board is Alfred's web-researched ripple reasoning — a LEAD, never a
// trade or a verdict; the call/gate live elsewhere. Hidden entirely when there are none.
const DIR: Record<string, { label: string; cls: string; tone: "green" | "red" | "dim" }> = {
  BENEFICIARY: { label: "beneficiary", cls: "text-emerald-300", tone: "green" },
  VICTIM: { label: "victim", cls: "text-red-300", tone: "red" },
  NEUTRAL: { label: "neutral", cls: "text-teal-200/60", tone: "dim" },
};
const ord = (n: number) => `${n}${["", "st", "nd", "rd"][n] ?? "th"}-order`;

export default function StockChessBoards({ symbol, refs }: { symbol: string; refs: ChessBoardRef[] }) {
  if (refs.length === 0) return null;
  const hl = bareChainKey(symbol);
  return (
    <div className="flex flex-col gap-4">
      <PanelHeader>
        Chess Moves{" "}
        <span className="font-normal normal-case text-teal-200/40">
          · {symbol} on {refs.length} supply-chain board{refs.length > 1 ? "s" : ""}
        </span>
      </PanelHeader>
      {refs.map((r) => {
        const d = DIR[r.direction] ?? DIR.NEUTRAL;
        return (
          <div key={r.themeId} className="space-y-3 rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4">
            {/* This name's place on the board — the header + why it moves here. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <Link href={`/chess/${r.themeId}`} className="text-base font-semibold text-teal-100 hover:text-teal-300 hover:underline">
                {r.title}
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                {r.mentionedOnly ? <Chip tone="dim">{symbol} on the board</Chip> : <Chip tone={d.tone}>{symbol} · {d.label}</Chip>}
                {r.kind === "WEEKLY" && <Chip tone="dim">board of the week</Chip>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-teal-200/45">
              {r.mentionedOnly ? (
                <span>a name on this supply-chain map (not a ranked play)</span>
              ) : (
                <>
                  <span className={d.cls}>{r.role}</span>
                  <span>· {ord(r.effectOrder)}</span>
                  {r.conviction != null && <span>· conviction {r.conviction}</span>}
                </>
              )}
              {r.completedAt && <span>· mapped {fmtWhen(r.completedAt)}</span>}
              <Link href={`/chess/${r.themeId}`} className="text-teal-300 hover:underline">· full board →</Link>
            </div>
            {r.thesis && <p className="text-[13px] leading-snug text-teal-100/75">{r.thesis}</p>}

            {/* The board map — the value chain, with this stock highlighted in it. */}
            <ChessBoard board={r.board} highlightKey={hl} />
          </div>
        );
      })}
      <p className="text-[11px] text-teal-200/40">
        How this name connects to a force in motion — Alfred&apos;s second-order reasoning, a lead, never a verdict or a trade on its own.
      </p>
    </div>
  );
}
