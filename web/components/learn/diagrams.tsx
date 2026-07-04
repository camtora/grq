// The Learn framework's diagram registry (docs/LEARN-FRAMEWORK.md D111 §5.1, phase L3).
// Hand-built, theme-aware SVG — no images to rot, crisp at any width, and they re-skin
// with the theme because every colour is a teal/red/emerald/amber class, currentColor,
// or a chart CSS var (docs/DESIGN.md §1.1 — never raw hex). Identity is never
// colour-alone: every mark carries a text label. The two data-shaped diagrams
// (drawdown-ladder, fee-gravity) reuse the CompoundingSim colour pair — var(--spark-up)
// + themed amber — which is already CVD-validated on both surfaces.

import type { ReactNode } from "react";
import type { LearnDiagramKey } from "@/lib/learn/content";

/** Title + caption per diagram — the native app's shell renders these around the SVG the
 *  /api/learn/svg endpoint serves. Kept adjacent to the components so a copy edit there is
 *  visibly a copy edit here (same file, same review). */
export const DIAGRAM_META: Record<LearnDiagramKey, { title: string; caption: string }> = {
  "order-path": {
    title: "Where your order actually goes",
    caption: "The exchange matches you with a seller; your money settles to that seller. The company isn't in the room — that only happened once, at the IPO.",
  },
  "market-map": {
    title: "Primary vs secondary market",
    caption: "Left: the one time your purchase funds the company. Right: every trade after that — investors trading with each other, all day, forever.",
  },
  "book-ladder": {
    title: "The order book, standing still",
    caption: "Six real resting orders around a 20¢ gap nobody has crossed yet. A market buy takes 20.10; a market sell hits 19.90 — the spread is the toll between them.",
  },
  "acb-timeline": {
    title: "The ACB timeline",
    caption: "Same numbers as the lesson: ($50 + $70 + $10) ÷ 10 = $13.00 a share. The sell realizes 5 × ($16 − $13) = +$15 — the other five shares are still just paper.",
  },
  "drawdown-ladder": {
    title: "What a fall costs, to scale",
    caption: "Both sides use the same scale. A 50% hole needs a bar twice as long to climb out of — the arithmetic professionals organize their whole careers around.",
  },
  "margin-spiral": {
    title: "The margin spiral",
    caption: "Every step is mechanical — no villain required. The loan turned a survivable −25% into a realized −50%, sold at the exact bottom.",
  },
  "fee-gravity": {
    title: "Fee gravity — drawn to scale",
    caption: "Identical investor, identical market: $200 a month at 8% for 30 years. The only difference is the fee.",
  },
  "grq-pipeline": {
    title: "The pipeline — receipts before trades",
    caption: "One direction, no shortcuts. Promotion only buys a ticket to stand in front of the gate — and the kill switch is checked inside it, on every single order.",
  },
  "two-listings": {
    title: "Tickers are addresses, not names",
    caption: "Left: one business, reachable at two addresses in two currencies. Right: the trap that once fooled Alfred — the same letters living at different exchanges are different companies.",
  },
  "ex-date-step": {
    title: "The ex-dividend date, drawn",
    caption: "The $2 arrives in your account and leaves the company's — the market marks the shares down by the same $2. Your money, arriving by mail.",
  },
  "pizza-split": {
    title: "Splits and buybacks, as pizza",
    caption: "A split cuts more slices from the same pizza — your highlighted share is worth exactly what it was. A buyback retires slices, so every remaining slice is a bigger bite.",
  },
  "target-chase": {
    title: "Price targets chase the price",
    caption: "Each quarter's average target settles roughly where the price already was. That's herding, not fresh analysis.",
  },
  "one-bet-ten-times": {
    title: "Ten holdings ≠ ten bets",
    caption: "Correlation is the whole question. The left portfolio fails for ONE reason, held ten times; the right one needs ten different things to go wrong at once.",
  },
  "short-asymmetry": {
    title: "Why the loss math is different",
    caption: "Owning has a floor — the stock stops at zero. A short's bill grows with the price, forever, and you pay borrow rent while you wait.",
  },
  "quote-paths": {
    title: "Two apps, two honest numbers",
    caption: "One answers “what did the last trade print, fifteen minutes ago?”; the other answers “what's the current bid/ask midpoint, on a different venue?”",
  },
  "thesis-price-2x2": {
    title: "Sell on the thesis, not the price",
    caption: "The market doesn't know your entry price and doesn't care. The only column that matters is whether the REASON you bought still stands.",
  },
  "proposes-disposes": {
    title: "The separation of powers",
    caption: "Alfred can argue; the gate can't listen. Humans sit above both — they set the rules the gate enforces and hold the switch that stops everything.",
  },
  "rsi-gauge": {
    title: "RSI, honestly labelled",
    caption: "The needle says the ride so far was hard and fast — nothing more. “Stretched” is a tension reading, not a bounce guarantee.",
  },
};

/* ---------- tiny shared pieces ---------- */

function Shell({ title, children, caption }: { title: string; children: ReactNode; caption?: string }) {
  return (
    <div className="mt-4 rounded-xl border border-teal-400/10 bg-teal-400/[0.02] p-4">
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">{title}</div>
      <div className="mt-2">{children}</div>
      {caption ? <p className="mt-2 text-[11px] leading-relaxed text-teal-200/50">{caption}</p> : null}
    </div>
  );
}

function ArrowDefs({ id, className = "text-teal-300/70" }: { id: string; className?: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L8,4 L0,8 z" fill="currentColor" className={className} />
      </marker>
    </defs>
  );
}

function NodeBox({
  x,
  y,
  w,
  h,
  lines,
  sub,
  tone = "solid",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  sub?: string;
  tone?: "solid" | "dim" | "accent" | "danger";
}) {
  const border =
    tone === "accent"
      ? "stroke-teal-400/70"
      : tone === "danger"
        ? "stroke-red-400/60"
        : tone === "dim"
          ? "stroke-teal-400/15"
          : "stroke-teal-400/30";
  const fill = tone === "danger" ? "fill-red-400/5" : tone === "accent" ? "fill-teal-400/10" : "fill-teal-400/5";
  const ink = tone === "dim" ? "text-teal-200/40" : "text-teal-50";
  const lineH = 13;
  const textTop = y + h / 2 - ((lines.length - 1) * lineH) / 2 - (sub ? 5 : 0);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={9} className={`${fill} ${border}`} strokeWidth={tone === "accent" || tone === "danger" ? 1.6 : 1} />
      <g className={ink}>
        {lines.map((t, i) => (
          <text key={i} x={x + w / 2} y={textTop + i * lineH} textAnchor="middle" dominantBaseline="middle" fill="currentColor" className="text-[11px] font-semibold">
            {t}
          </text>
        ))}
      </g>
      {sub ? (
        <text x={x + w / 2} y={y + h - 11} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/50">
          {sub}
        </text>
      ) : null}
    </g>
  );
}

function Flow({ x1, x2, y, marker, label, labelAbove = true }: { x1: number; x2: number; y: number; marker: string; label?: string; labelAbove?: boolean }) {
  return (
    <g className="text-teal-300/70">
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="currentColor" strokeWidth={1.5} markerEnd={`url(#${marker})`} />
      {label ? (
        <text x={(x1 + x2) / 2} y={labelAbove ? y - 6 : y + 14} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/55">
          {label}
        </text>
      ) : null}
    </g>
  );
}

/* ---------- 1 · order-path — where an order (and your money) actually goes ---------- */

function OrderPath() {
  const y = 30;
  const h = 52;
  return (
    <Shell
      title="Where your order actually goes"
      caption="The exchange matches you with a seller; your money settles to that seller. The company isn't in the room — that only happened once, at the IPO."
    >
      <svg viewBox="0 0 720 190" className="w-full" role="img" aria-label="An order flows from you through your broker to the exchange's matching engine, which pairs you with another investor. Your money goes to that seller — the company is not part of the trade.">
        <ArrowDefs id="op-a" />
        <NodeBox x={10} y={y} w={130} h={h} lines={["YOU"]} sub="tap Buy" />
        <NodeBox x={195} y={y} w={140} h={h} lines={["YOUR BROKER"]} sub="routes it" />
        <NodeBox x={390} y={y} w={150} h={h} lines={["THE EXCHANGE"]} sub="matching engine" tone="accent" />
        <NodeBox x={595} y={y} w={115} h={h} lines={["THE SELLER"]} sub="another investor" />
        <Flow x1={140} x2={193} y={y + h / 2} marker="op-a" label="your order" />
        <Flow x1={335} x2={388} y={y + h / 2} marker="op-a" />
        <Flow x1={540} x2={593} y={y + h / 2} marker="op-a" label="matched" />
        {/* the money path — an elbow routed clearly BELOW the company box */}
        <g className="text-emerald-300/80">
          <path
            d="M 75 84 L 75 150 Q 75 158 83 158 L 637 158 Q 645 158 645 150 L 645 88"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            markerEnd="url(#op-m)"
          />
          <defs>
            <marker id="op-m" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>
          <text x={360} y={176} textAnchor="middle" fill="currentColor" className="text-[10px] font-semibold">
            your money → the seller
          </text>
        </g>
        {/* the company, pointedly outside */}
        <g className="text-teal-200/40">
          <rect x={295} y={112} width={130} height={30} rx={8} className="fill-none stroke-teal-400/15" strokeDasharray="4 3" />
          <text x={360} y={127} textAnchor="middle" dominantBaseline="middle" fill="currentColor" className="text-[10px]">
            THE COMPANY
          </text>
          <text x={360} y={100} textAnchor="middle" fill="currentColor" className="text-[9.5px]">
            ✗ not part of the trade
          </text>
        </g>
      </svg>
    </Shell>
  );
}

/* ---------- 2 · market-map — primary vs secondary ---------- */

function MarketMap() {
  return (
    <Shell
      title="Primary vs secondary market"
      caption="Left: the one time your purchase funds the company. Right: every trade after that — investors trading with each other, all day, forever."
    >
      <svg viewBox="0 0 720 190" className="w-full" role="img" aria-label="Two panels. Primary market: at the IPO your money goes to the company. Secondary market: after the IPO, shares and money change hands between investors and the company is not involved.">
        <ArrowDefs id="mm-a" />
        {/* panel frames */}
        <rect x={4} y={4} width={340} height={182} rx={10} className="fill-none stroke-teal-400/10" />
        <rect x={376} y={4} width={340} height={182} rx={10} className="fill-none stroke-teal-400/10" />
        <text x={174} y={24} textAnchor="middle" fill="currentColor" className="text-[10px] font-bold uppercase tracking-widest text-teal-300/60">
          Primary — the IPO, once
        </text>
        <text x={546} y={24} textAnchor="middle" fill="currentColor" className="text-[10px] font-bold uppercase tracking-widest text-teal-300/60">
          Secondary — every day after
        </text>
        {/* primary: you -> company (gap wide enough for the labels — measured, not vibed) */}
        <NodeBox x={20} y={62} w={110} h={50} lines={["YOU"]} />
        <NodeBox x={214} y={62} w={124} h={50} lines={["THE COMPANY"]} tone="accent" />
        <g className="text-emerald-300/80">
          <line x1={130} y1={80} x2={212} y2={80} stroke="currentColor" strokeWidth={1.5} markerEnd="url(#mm-m)" />
          <defs>
            <marker id="mm-m" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>
          <text x={171} y={70} textAnchor="middle" fill="currentColor" className="text-[9.5px] font-semibold">
            your money
          </text>
        </g>
        <Flow x1={212} x2={132} y={96} marker="mm-a" label="new shares" labelAbove={false} />
        <text x={174} y={148} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/50">
          the only trade that funds the business
        </text>
        {/* secondary: investor <-> investor */}
        <NodeBox x={390} y={62} w={124} h={50} lines={["INVESTOR A"]} />
        <NodeBox x={580} y={62} w={124} h={50} lines={["INVESTOR B"]} />
        <Flow x1={514} x2={578} y={78} marker="mm-a" label="shares" />
        <Flow x1={578} x2={516} y={96} marker="mm-a" label="money" labelAbove={false} />
        <g className="text-teal-200/40">
          <rect x={458} y={136} width={176} height={28} rx={8} className="fill-none stroke-teal-400/15" strokeDasharray="4 3" />
          <text x={546} y={150} textAnchor="middle" dominantBaseline="middle" fill="currentColor" className="text-[9.5px]">
            THE COMPANY — uninvolved
          </text>
        </g>
      </svg>
    </Shell>
  );
}

/* ---------- 3 · book-ladder — the spread, standing still ---------- */

function BookLadder() {
  // rows: [price, size, side]; best ask 20.10, best bid 19.90.
  const asks: [string, number][] = [
    ["20.14", 220],
    ["20.12", 410],
    ["20.10", 180],
  ];
  const bids: [string, number][] = [
    ["19.90", 260],
    ["19.88", 480],
    ["19.86", 300],
  ];
  const rowH = 24;
  const barX = 150;
  const maxW = 380;
  const maxSize = 480;
  const bw = (s: number) => Math.max(28, (s / maxSize) * maxW);
  const askTop = 34;
  const spreadY = askTop + asks.length * rowH + 4;
  const bidTop = spreadY + 46; // clear of the band — its header must never touch the dashes
  return (
    <Shell
      title="The order book, standing still"
      caption="Six real resting orders around a 20¢ gap nobody has crossed yet. A market buy takes 20.10; a market sell hits 19.90 — the spread is the toll between them. (The toy exchange in the next lesson lets you push these around.)"
    >
      <svg viewBox="0 0 720 240" className="w-full" role="img" aria-label="A price ladder: sell orders (asks) stacked above at 20.10 to 20.14, buy orders (bids) below at 19.86 to 19.90, with the 20-cent spread gap highlighted between the best ask and best bid.">
        <text x={barX} y={20} fill="currentColor" className="text-[10px] font-bold uppercase tracking-widest text-amber-300/80">
          Asks — sellers waiting
        </text>
        {asks.map(([p, s], i) => {
          const y = askTop + i * rowH;
          return (
            <g key={p}>
              <text x={barX - 12} y={y + 12} textAnchor="end" fill="currentColor" className="text-[11px] tabular-nums text-teal-100/80">
                ${p}
              </text>
              <g className="text-amber-400/70">
                <rect x={barX} y={y + 2} width={bw(s)} height={16} rx={4} fill="currentColor" />
              </g>
              <text x={barX + bw(s) + 8} y={y + 12} fill="currentColor" className="text-[9.5px] tabular-nums text-teal-200/50">
                {s} sh
              </text>
            </g>
          );
        })}
        {/* the spread band */}
        <g>
          <rect x={barX - 90} y={spreadY} width={maxW + 110} height={22} rx={5} className="fill-teal-400/10 stroke-teal-400/25" strokeDasharray="4 3" />
          <text x={barX + (maxW + 20) / 2} y={spreadY + 11} textAnchor="middle" dominantBaseline="middle" fill="currentColor" className="text-[10px] font-semibold text-teal-100/85">
            the spread — 20¢ of open water · buy at $20.10, sell at $19.90
          </text>
        </g>
        <text x={barX} y={bidTop - 4} fill="currentColor" className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/80">
          Bids — buyers waiting
        </text>
        {bids.map(([p, s], i) => {
          const y = bidTop + 2 + i * rowH;
          return (
            <g key={p}>
              <text x={barX - 12} y={y + 12} textAnchor="end" fill="currentColor" className="text-[11px] tabular-nums text-teal-100/80">
                ${p}
              </text>
              <g className="text-emerald-400/60">
                <rect x={barX} y={y + 2} width={bw(s)} height={16} rx={4} fill="currentColor" />
              </g>
              <text x={barX + bw(s) + 8} y={y + 12} fill="currentColor" className="text-[9.5px] tabular-nums text-teal-200/50">
                {s} sh
              </text>
            </g>
          );
        })}
      </svg>
    </Shell>
  );
}

/* ---------- 4 · acb-timeline — what you paid, and when a gain gets real ---------- */

function AcbTimeline() {
  const y = 64;
  const events: { x: number; top: string[]; acb: string }[] = [
    { x: 90, top: ["Buy 5 @ $10"], acb: "ACB $10.00" },
    { x: 260, top: ["Buy 5 @ $14", "(+$10 commissions total)"], acb: "ACB $13.00" },
    { x: 470, top: ["Sell 5 @ $16"], acb: "ACB stays $13.00" },
  ];
  return (
    <Shell
      title="The ACB timeline"
      caption="Same numbers as the lesson: ($50 + $70 + $10) ÷ 10 = $13.00 a share. The sell realizes 5 × ($16 − $13) = +$15 — the other five shares are still just paper."
    >
      <svg viewBox="0 0 720 185" className="w-full" role="img" aria-label="A timeline of two buys building an average cost of 13 dollars, then a partial sell realizing 15 dollars of gain while the remaining shares stay unrealized.">
        <ArrowDefs id="acb-a" />
        <line x1={40} y1={y} x2={660} y2={y} stroke="currentColor" strokeWidth={1.5} className="text-teal-400/30" markerEnd="url(#acb-a)" />
        {events.map((e) => (
          <g key={e.x}>
            <circle cx={e.x} cy={y} r={5} className="fill-teal-300/90" />
            <g className="text-teal-50">
              {e.top.map((t, i) => (
                <text key={i} x={e.x} y={26 + i * 13} textAnchor="middle" fill="currentColor" className={i === 0 ? "text-[11px] font-semibold" : "text-[9.5px] text-teal-200/55"}>
                  {t}
                </text>
              ))}
            </g>
            <g className="text-teal-200/70">
              <rect x={e.x - 52} y={y + 14} width={104} height={22} rx={6} className="fill-teal-400/10 stroke-teal-400/25" />
              <text x={e.x} y={y + 25} textAnchor="middle" dominantBaseline="middle" fill="currentColor" className="text-[10px] font-semibold tabular-nums">
                {e.acb}
              </text>
            </g>
          </g>
        ))}
        {/* the sell's two futures — stacked under the sell, a tick connecting them */}
        <line x1={470} y1={y + 36} x2={470} y2={y + 44} stroke="currentColor" strokeWidth={1.2} className="text-teal-400/30" />
        <g className="text-emerald-300/90">
          <rect x={340} y={y + 44} width={300} height={24} rx={7} className="fill-emerald-400/10 stroke-emerald-400/40" />
          <text x={490} y={y + 56} textAnchor="middle" dominantBaseline="middle" fill="currentColor" className="text-[10px] font-semibold">
            realized: +$15.00 — real money (5 × $3)
          </text>
        </g>
        <g className="text-teal-200/55">
          <rect x={340} y={y + 74} width={300} height={24} rx={7} className="fill-none stroke-teal-400/20" strokeDasharray="4 3" />
          <text x={490} y={y + 86} textAnchor="middle" dominantBaseline="middle" fill="currentColor" className="text-[10px]">
            the other 5 shares: unrealized — still paper
          </text>
        </g>
      </svg>
    </Shell>
  );
}

/* ---------- 5 · drawdown-ladder — the asymmetry, drawn to scale ---------- */

function DrawdownLadder() {
  const pairs: { fall: number; climb: number }[] = [
    { fall: 10, climb: 11 },
    { fall: 25, climb: 33 },
    { fall: 50, climb: 100 },
  ];
  const cx = 300; // the zero line
  const px = 3.1; // pixels per percent — SAME both sides, that's the whole point
  const rowH = 46;
  const top = 44;
  return (
    <Shell
      title="What a fall costs, to scale"
      caption="Both sides use the same scale. A 50% hole needs a bar twice as long to climb out of — the arithmetic professionals organize their whole careers around."
    >
      <svg viewBox="0 0 720 195" className="w-full" role="img" aria-label="Three bar pairs to a shared scale: a 10 percent fall needs 11 percent back, 25 needs 33, and 50 needs 100 — the recovery bars grow much faster than the falls.">
        {/* legend — identity by label, colour secondary */}
        <g className="text-[10px]">
          <g className="text-amber-400/80">
            <rect x={cx - 160} y={12} width={14} height={9} rx={3} fill="currentColor" />
          </g>
          <text x={cx - 140} y={20} fill="currentColor" className="text-teal-200/60">
            the fall
          </text>
          <rect x={cx - 60} y={12} width={14} height={9} rx={3} fill="var(--spark-up)" />
          <text x={cx - 40} y={20} fill="currentColor" className="text-teal-200/60">
            the climb back to even
          </text>
        </g>
        <line x1={cx} y1={34} x2={cx} y2={top + pairs.length * rowH - 8} stroke="currentColor" strokeWidth={1} className="text-teal-400/25" />
        {pairs.map((p, i) => {
          const y = top + i * rowH;
          const fw = p.fall * px;
          const cw = p.climb * px;
          return (
            <g key={p.fall}>
              <g className="text-amber-400/80">
                <rect x={cx - fw} y={y} width={fw} height={15} rx={4} fill="currentColor" />
              </g>
              <text x={cx - fw - 8} y={y + 8} textAnchor="end" dominantBaseline="middle" fill="currentColor" className="text-[11px] font-semibold tabular-nums text-amber-300/90">
                −{p.fall}%
              </text>
              <rect x={cx + 1} y={y + 17} width={cw} height={15} rx={4} fill="var(--spark-up)" />
              <text x={cx + cw + 8} y={y + 25} dominantBaseline="middle" fill="currentColor" className="text-[11px] font-semibold tabular-nums text-teal-100/90">
                needs +{p.climb}%
              </text>
            </g>
          );
        })}
      </svg>
    </Shell>
  );
}

/* ---------- 6 · margin-spiral — how leverage dies ---------- */

function MarginSpiral() {
  return (
    <Shell
      title="The margin spiral"
      caption="Every step is mechanical — no villain required. The loan turned a survivable −25% into a realized −50%, sold at the exact bottom."
    >
      <svg viewBox="0 0 720 205" className="w-full" role="img" aria-label="A four-step chain: 10 thousand of your money plus 10 thousand borrowed buys 20 thousand of stock; the stock falls 25 percent; your equity is down 50 percent; the broker issues a margin call and sells at the bottom without asking.">
        <ArrowDefs id="ms-a" />
        <NodeBox x={8} y={16} w={200} h={54} lines={["$10k yours + $10k borrowed", "= $20k of stock"]} />
        <NodeBox x={262} y={16} w={150} h={54} lines={["the stock falls 25%", "book: $15k"]} />
        <NodeBox x={466} y={16} w={166} h={54} lines={["your equity: $5k", "— half your money gone"]} />
        <Flow x1={208} x2={260} y={43} marker="ms-a" />
        <Flow x1={412} x2={464} y={43} marker="ms-a" />
        {/* the drop into the call */}
        <g className="text-red-400/70">
          <path d="M 549 70 C 549 96, 460 96, 430 108" fill="none" stroke="currentColor" strokeWidth={1.5} markerEnd="url(#ms-r)" />
          <defs>
            <marker id="ms-r" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>
        </g>
        <NodeBox x={170} y={112} w={310} h={56} lines={["MARGIN CALL", "the broker sells — at the bottom, without asking"]} tone="danger" />
        <text x={345} y={188} textAnchor="middle" fill="currentColor" className="text-[10px] text-teal-200/50">
          loss realized · the one advantage a patient investor had — the ability to wait — removed
        </text>
      </svg>
    </Shell>
  );
}

/* ---------- 7 · fee-gravity — two MERs, thirty years, same everything else ---------- */

const FG = { W: 720, H: 235, M: { top: 16, right: 150, bottom: 26, left: 56 } };
const FG_IW = FG.W - FG.M.left - FG.M.right;
const FG_IH = FG.H - FG.M.top - FG.M.bottom;
const FG_YEARS = 30;

// $200/month at 8%/yr, monthly compounding, integer cents throughout (the house rule).
function fgSeries(feePct: number): number[] {
  const out: number[] = [0];
  let val = 0;
  for (let y = 1; y <= FG_YEARS; y++) {
    for (let m = 0; m < 12; m++) {
      val += 20000;
      val += Math.round((val * (8 - feePct)) / 1200);
    }
    out.push(val);
  }
  return out;
}
const FG_LOW = fgSeries(0.06);
const FG_HIGH = fgSeries(2);
const fgK = (c: number) => (c >= 100_000 ? `$${Math.round(c / 100_000)}k` : `$${Math.round(c / 100)}`);

function FeeGravity() {
  const yMax = FG_LOW[FG_YEARS];
  const X = (y: number) => FG.M.left + (y / FG_YEARS) * FG_IW;
  const Y = (c: number) => FG.M.top + FG_IH - (c / yMax) * FG_IH;
  const path = (s: number[]) => s.map((v, y) => `${X(y)},${Y(v)}`).join(" ");
  const gap = FG_LOW[FG_YEARS] - FG_HIGH[FG_YEARS];
  const yTicks = [0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));
  return (
    <Shell
      title="Fee gravity — drawn to scale"
      caption={`Identical investor, identical market: $200 a month at 8% for 30 years. The only difference is the fee — and the 2% MER quietly keeps ${fgK(gap)} of it.`}
    >
      <svg viewBox={`0 0 ${FG.W} ${FG.H}`} className="w-full" role="img" aria-label={`Two lines compound for thirty years: at a 0.06 percent fee the pot reaches ${fgK(FG_LOW[FG_YEARS])}; at a 2 percent fee only ${fgK(FG_HIGH[FG_YEARS])}. Same contributions, same market.`}>
        {yTicks.map((v) => (
          <g key={v} className="text-teal-400/15">
            <line x1={FG.M.left} y1={Y(v)} x2={FG.W - FG.M.right} y2={Y(v)} stroke="currentColor" strokeWidth={1} />
            <text x={FG.M.left - 8} y={Y(v)} textAnchor="end" dominantBaseline="middle" fill="currentColor" className="text-[9.5px] tabular-nums text-teal-200/45">
              {fgK(v)}
            </text>
          </g>
        ))}
        {[0, 10, 20, 30].map((y) => (
          <text key={y} x={X(y)} y={FG.H - 8} textAnchor="middle" fill="currentColor" className="text-[9.5px] tabular-nums text-teal-200/45">
            {y === 0 ? "year 0" : y}
          </text>
        ))}
        <polyline points={path(FG_LOW)} fill="none" stroke="var(--spark-up)" strokeWidth={2} />
        <g className="text-amber-400/90">
          <polyline points={path(FG_HIGH)} fill="none" stroke="currentColor" strokeWidth={2} />
        </g>
        {/* direct labels at the line ends — identity is never colour-alone */}
        <text x={X(FG_YEARS) + 8} y={Y(FG_LOW[FG_YEARS])} dominantBaseline="middle" fill="currentColor" className="text-[10px] font-semibold text-teal-100/90 tabular-nums">
          0.06% MER → {fgK(FG_LOW[FG_YEARS])}
        </text>
        <text x={X(FG_YEARS) + 8} y={Y(FG_HIGH[FG_YEARS])} dominantBaseline="middle" fill="currentColor" className="text-[10px] font-semibold text-amber-300/90 tabular-nums">
          2% MER → {fgK(FG_HIGH[FG_YEARS])}
        </text>
      </svg>
    </Shell>
  );
}

/* ---------- 8 · grq-pipeline — receipts before trades ---------- */

function GrqPipeline() {
  const y = 30;
  const h = 62;
  const boxes: { x: number; w: number; lines: string[]; sub?: string; tone?: "solid" | "accent" | "dim" }[] = [
    { x: 6, w: 96, lines: ["A LEAD"], sub: "hunt · watch" },
    { x: 128, w: 110, lines: ["THE DOSSIER"], sub: "thesis · conviction" },
    { x: 264, w: 110, lines: ["PROMOTION"], sub: "liquidity screen" },
    { x: 400, w: 130, lines: ["THE §6 GATE"], sub: "every order, every time", tone: "accent" },
    { x: 556, w: 74, lines: ["ORDER"], sub: "filled" },
    { x: 646, w: 68, lines: ["JOURNAL"], sub: "graded later" },
  ];
  return (
    <Shell
      title="The pipeline — receipts before trades"
      caption="One direction, no shortcuts. Promotion only buys a ticket to stand in front of the gate — and the kill switch is checked inside it, on every single order."
    >
      <svg viewBox="0 0 720 130" className="w-full" role="img" aria-label="A six-step pipeline: a lead becomes a dossier, may be promoted through the liquidity screen, and every resulting order still passes the paragraph-six gate before filling and being journaled for later grading.">
        <ArrowDefs id="gp-a" />
        {boxes.map((b) => (
          <NodeBox key={b.x} x={b.x} y={y} w={b.w} h={h} lines={b.lines} sub={b.sub} tone={b.tone ?? "solid"} />
        ))}
        {boxes.slice(0, -1).map((b, i) => (
          <Flow key={b.x} x1={b.x + b.w + 2} x2={boxes[i + 1].x - 2} y={y + h / 2} marker="gp-a" />
        ))}
        <text x={465} y={y + h + 22} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/50">
          kill switch checked in here
        </text>
      </svg>
    </Shell>
  );
}

/* ================= pass two (D111 L3 follow-up) — one visual per remaining lesson ================= */

/** Polar helper for the pizza sectors + the RSI gauge (degrees; 0° = east, CCW positive). */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const [x1, y1] = polar(cx, cy, r, fromDeg);
  const [x2, y2] = polar(cx, cy, r, toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  const sweep = toDeg < fromDeg ? 1 : 0; // clockwise when the angle decreases
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} ${sweep} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/* ---------- 11 · two-listings — one company two addresses; same letters two companies ---------- */

function TwoListings() {
  return (
    <Shell
      title="Tickers are addresses, not names"
      caption="Left: one business, reachable at two addresses in two currencies. Right: the trap that once fooled Alfred — the same letters living at different exchanges are different companies."
    >
      <svg viewBox="0 0 720 210" className="w-full" role="img" aria-label="Two panels. Left: Shopify listed on both the TSX in Canadian dollars and the NYSE in US dollars — one company. Right: the letter V points to Visa on the NYSE but to an unrelated forty-cent look-alike on a Canadian venture exchange.">
        <ArrowDefs id="tl-a" />
        <rect x={4} y={4} width={340} height={202} rx={10} className="fill-none stroke-teal-400/10" />
        <rect x={376} y={4} width={340} height={202} rx={10} className="fill-none stroke-teal-400/10" />
        <text x={174} y={26} textAnchor="middle" fill="currentColor" className="text-[10px] font-bold uppercase tracking-widest text-teal-300/60">
          One company, two addresses
        </text>
        <text x={546} y={26} textAnchor="middle" fill="currentColor" className="text-[10px] font-bold uppercase tracking-widest text-teal-300/60">
          Same letters, different companies
        </text>
        <NodeBox x={24} y={46} w={140} h={40} lines={["SHOP · TSX"]} sub="in CAD" />
        <NodeBox x={184} y={46} w={140} h={40} lines={["SHOP · NYSE"]} sub="in USD" />
        <NodeBox x={94} y={140} w={160} h={44} lines={["SHOPIFY INC."]} sub="the same business" tone="accent" />
        <g className="text-teal-400/40">
          <line x1={94} y1={86} x2={150} y2={138} stroke="currentColor" strokeWidth={1.2} />
          <line x1={254} y1={86} x2={198} y2={138} stroke="currentColor" strokeWidth={1.2} />
        </g>
        {/* right: the look-alike */}
        <NodeBox x={514} y={42} w={64} h={34} lines={["“V”"]} />
        <g className="text-teal-300/60">
          <line x1={530} y1={76} x2={478} y2={116} stroke="currentColor" strokeWidth={1.2} markerEnd="url(#tl-a)" />
          <line x1={562} y1={76} x2={614} y2={116} stroke="currentColor" strokeWidth={1.2} markerEnd="url(#tl-a)" />
        </g>
        <NodeBox x={392} y={120} w={150} h={48} lines={["NYSE: Visa"]} sub="the payments giant" />
        <NodeBox x={556} y={120} w={150} h={48} lines={["TSX-V: look-alike"]} sub="a 40¢ shell — not Visa" tone="dim" />
        <text x={631} y={186} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-amber-300/80">
          ⚠ check the exchange, always
        </text>
      </svg>
    </Shell>
  );
}

/* ---------- 12 · ex-date-step — the dividend leaves, the price follows ---------- */

function ExDateStep() {
  return (
    <Shell
      title="The ex-dividend date, drawn"
      caption="The $2 arrives in your account and leaves the company's — the market marks the shares down by the same $2. Your money, arriving by mail."
    >
      <svg viewBox="0 0 720 190" className="w-full" role="img" aria-label="A price line sits flat at fifty dollars, steps down two dollars to forty-eight on the ex-dividend date, and continues flat — the drop equals the dividend paid out.">
        <g className="text-teal-400/15">
          <line x1={70} y1={60} x2={660} y2={60} stroke="currentColor" strokeWidth={1} strokeDasharray="3 4" />
          <line x1={70} y1={112} x2={660} y2={112} stroke="currentColor" strokeWidth={1} strokeDasharray="3 4" />
        </g>
        <text x={62} y={60} textAnchor="end" dominantBaseline="middle" fill="currentColor" className="text-[10px] tabular-nums text-teal-200/50">
          $50.00
        </text>
        <text x={62} y={112} textAnchor="end" dominantBaseline="middle" fill="currentColor" className="text-[10px] tabular-nums text-teal-200/50">
          $48.00
        </text>
        <polyline points="70,60 340,60 340,112 660,112" fill="none" stroke="var(--spark-up)" strokeWidth={2} />
        <g className="text-teal-200/50">
          <line x1={340} y1={34} x2={340} y2={150} stroke="currentColor" strokeWidth={1} strokeDasharray="4 3" className="text-teal-400/25" />
          <text x={340} y={24} textAnchor="middle" fill="currentColor" className="text-[10px] font-semibold text-teal-100/80">
            ex-dividend date
          </text>
        </g>
        <g className="text-emerald-300/85">
          <line x1={368} y1={60} x2={368} y2={110} stroke="currentColor" strokeWidth={1.5} markerEnd="url(#ex-m)" />
          <defs>
            <marker id="ex-m" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>
          <text x={382} y={88} fill="currentColor" className="text-[10px] font-semibold">
            the $2 dividend — paid to holders, marked off the price
          </text>
        </g>
        <text x={365} y={168} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/50">
          buying the day before “to grab the payout” buys exactly this step — nothing, minus commissions
        </text>
      </svg>
    </Shell>
  );
}

/* ---------- 13 · pizza-split — splits and buybacks as slices ---------- */

function Pizza({ cx, cy, r, slices, yourFrom, yourTo }: { cx: number; cy: number; r: number; slices: number; yourFrom: number; yourTo: number }) {
  const spokes = Array.from({ length: slices }, (_, i) => polar(cx, cy, r, (360 / slices) * i));
  const [sx, sy] = polar(cx, cy, r, yourFrom);
  const [ex, ey] = polar(cx, cy, r, yourTo);
  return (
    <g>
      <path d={`M ${cx} ${cy} L ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 0 0 ${ex.toFixed(1)} ${ey.toFixed(1)} Z`} className="fill-teal-400/25" />
      <circle cx={cx} cy={cy} r={r} className="fill-none stroke-teal-400/40" strokeWidth={1.4} />
      {spokes.map(([x, y], i) => (
        <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="currentColor" strokeWidth={1} className="text-teal-400/25" />
      ))}
    </g>
  );
}

function PizzaSplit() {
  return (
    <Shell
      title="Splits and buybacks, as pizza"
      caption="A split cuts more slices from the same pizza — your highlighted share is worth exactly what it was. A buyback retires slices, so every remaining slice (yours included) is a bigger bite of the same business."
    >
      <svg viewBox="0 0 720 220" className="w-full" role="img" aria-label="Three pizzas: eight slices with one highlighted; after a two-for-one split, sixteen thinner slices with the same highlighted area; after a buyback, six slices where the highlighted one is visibly larger.">
        <Pizza cx={130} cy={95} r={54} slices={8} yourFrom={0} yourTo={45} />
        <Pizza cx={360} cy={95} r={54} slices={16} yourFrom={0} yourTo={45} />
        <Pizza cx={590} cy={95} r={54} slices={6} yourFrom={0} yourTo={60} />
        <g fill="currentColor" className="text-teal-100/80">
          <text x={130} y={172} textAnchor="middle" className="text-[10.5px] font-semibold">before — 8 slices</text>
          <text x={360} y={172} textAnchor="middle" className="text-[10.5px] font-semibold">2-for-1 split — 16 slices</text>
          <text x={590} y={172} textAnchor="middle" className="text-[10.5px] font-semibold">buyback — 6 slices left</text>
        </g>
        <g fill="currentColor" className="text-teal-200/50">
          <text x={130} y={188} textAnchor="middle" className="text-[9.5px]">your slice: 1/8</text>
          <text x={360} y={188} textAnchor="middle" className="text-[9.5px]">your two slices: still 1/8 of the pizza</text>
          <text x={590} y={188} textAnchor="middle" className="text-[9.5px]">your slice: now 1/6 — dilution in reverse</text>
        </g>
        <text x={360} y={210} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/45">
          the pizza itself — what the business is worth — didn&apos;t change in any panel
        </text>
      </svg>
    </Shell>
  );
}

/* ---------- 14 · target-chase — analyst targets herd behind the price ---------- */

function TargetChase() {
  const price: [number, number][] = [
    [70, 150],
    [170, 140],
    [270, 121],
    [370, 96],
    [470, 78],
    [570, 60],
  ];
  const targets: [number, number][] = [
    [170, 152],
    [270, 144],
    [370, 126],
    [470, 102],
    [570, 84],
  ];
  return (
    <Shell
      title="Price targets chase the price"
      caption="Watch the amber dots: each quarter's average target settles roughly where the price already was. That's herding, not fresh analysis — which is why comparing the street to an independent call beats reading either alone."
    >
      <svg viewBox="0 0 720 200" className="w-full" role="img" aria-label="A rising price line with average analyst price targets plotted as dots that trail below and behind it the whole way up.">
        {/* legend */}
        <g className="text-[10px]">
          <line x1={70} y1={22} x2={92} y2={22} stroke="var(--spark-up)" strokeWidth={2} />
          <text x={98} y={25} fill="currentColor" className="text-teal-200/60">the price</text>
          <g className="text-amber-400/90">
            <circle cx={186} cy={22} r={4} fill="currentColor" />
          </g>
          <text x={196} y={25} fill="currentColor" className="text-teal-200/60">average analyst target, each quarter</text>
        </g>
        <polyline points={price.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="var(--spark-up)" strokeWidth={2} />
        <g className="text-amber-400/90">
          {targets.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={4.5} fill="currentColor" />
          ))}
        </g>
        <text x={588} y={60} fill="currentColor" className="text-[10px] font-semibold text-teal-100/85" dominantBaseline="middle">
          +30% later…
        </text>
        <text x={588} y={86} fill="currentColor" className="text-[10px] font-semibold text-amber-300/90" dominantBaseline="middle">
          …targets arrive
        </text>
        <g className="text-teal-200/45">
          <line x1={470} y1={102} x2={470} y2={78} stroke="currentColor" strokeWidth={1} strokeDasharray="2 3" />
          <text x={462} y={122} textAnchor="middle" fill="currentColor" className="text-[9.5px]">
            always a step behind
          </text>
        </g>
      </svg>
    </Shell>
  );
}

/* ---------- 15 · one-bet-ten-times — what diversification actually requires ---------- */

function OneBetTenTimes() {
  const cell = (x: number, y: number, label: string, dim = false) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={60} height={24} rx={6} className={dim ? "fill-amber-400/10 stroke-amber-400/30" : "fill-teal-400/5 stroke-teal-400/30"} strokeWidth={1} />
      <text x={x + 30} y={y + 12} textAnchor="middle" dominantBaseline="middle" fill="currentColor" className={`text-[9px] font-semibold ${dim ? "text-amber-200/80" : "text-teal-100/80"}`}>
        {label}
      </text>
    </g>
  );
  const banks = Array.from({ length: 10 }, (_, i) => cell(22 + (i % 5) * 62, 62 + Math.floor(i / 5) * 32, "BANK", true));
  const mixed = ["BANK", "RAIL", "GOLD", "SAAS", "GROCER", "PIPELN", "CHIPS", "TELCO", "INSURE", "MEDIA"].map((l, i) =>
    cell(390 + (i % 5) * 62, 62 + Math.floor(i / 5) * 32, l),
  );
  return (
    <Shell
      title="Ten holdings ≠ ten bets"
      caption="Correlation is the whole question. The left portfolio fails for ONE reason, held ten times; the right one needs ten different things to go wrong at once — the wobbles partially cancel."
    >
      <svg viewBox="0 0 720 208" className="w-full" role="img" aria-label="Two portfolios of ten holdings each: ten identical bank boxes under one storm, versus ten boxes across different sectors that fail for different reasons.">
        <rect x={4} y={4} width={340} height={172} rx={10} className="fill-none stroke-teal-400/10" />
        <rect x={376} y={4} width={340} height={172} rx={10} className="fill-none stroke-teal-400/10" />
        <text x={174} y={26} textAnchor="middle" fill="currentColor" className="text-[10px] font-bold uppercase tracking-widest text-amber-300/80">
          Ten holdings, one bet
        </text>
        <text x={546} y={26} textAnchor="middle" fill="currentColor" className="text-[10px] font-bold uppercase tracking-widest text-teal-300/60">
          Ten holdings, ten storms
        </text>
        <text x={174} y={44} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-amber-300/70">
          one storm sinks all ten
        </text>
        <text x={546} y={44} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/50">
          different sectors · countries · currencies
        </text>
        {banks}
        {mixed}
        <text x={174} y={156} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/50">
          correlation ≈ 1 — “diversified” in name only
        </text>
        <text x={546} y={156} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/50">
          low correlation — the closest thing to a free lunch
        </text>
        <text x={360} y={196} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/40">
          fine print: in a real panic, correlations rush toward 1 — that&apos;s what the cash floor and kill switch are for
        </text>
      </svg>
    </Shell>
  );
}

/* ---------- 16 · short-asymmetry — the floor vs no ceiling ---------- */

function ShortAsymmetry() {
  return (
    <Shell
      title="Why the loss math is different"
      caption="Owning has a floor — the stock stops at zero. A short's bill grows with the price, forever, and you pay borrow rent while you wait. Being right too early looks exactly like being wrong."
    >
      <svg viewBox="0 0 720 230" className="w-full" role="img" aria-label="Both positions enter at forty dollars. The long position's worst case is a bar down to zero, minus one hundred percent. The short position's loss arrow rises past the top of the chart — no ceiling.">
        <ArrowDefs id="sa-a" className="text-red-400/70" />
        <text x={190} y={30} textAnchor="middle" fill="currentColor" className="text-[10px] font-bold uppercase tracking-widest text-teal-300/60">
          Own it
        </text>
        <text x={530} y={30} textAnchor="middle" fill="currentColor" className="text-[10px] font-bold uppercase tracking-widest text-teal-300/60">
          Short it
        </text>
        <g className="text-teal-400/30">
          <line x1={60} y1={120} x2={660} y2={120} stroke="currentColor" strokeWidth={1} strokeDasharray="5 4" />
        </g>
        <text x={360} y={112} textAnchor="middle" fill="currentColor" className="text-[10px] text-teal-200/60">
          both enter at $40
        </text>
        {/* long: bounded fall */}
        <g className="text-amber-400/75">
          <rect x={170} y={122} width={40} height={72} rx={4} fill="currentColor" />
        </g>
        <line x1={130} y1={196} x2={250} y2={196} stroke="currentColor" strokeWidth={2} className="text-teal-100/70" />
        <text x={190} y={212} textAnchor="middle" fill="currentColor" className="text-[10px] font-semibold text-teal-100/80">
          worst case −100% — $0 is the floor
        </text>
        {/* short: unbounded rise — the arrow stops clear of the column header */}
        <g className="text-red-400/80">
          <line x1={530} y1={118} x2={530} y2={62} stroke="currentColor" strokeWidth={2.5} markerEnd="url(#sa-a)" />
          <line x1={530} y1={58} x2={530} y2={44} stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 4" />
        </g>
        <text x={548} y={62} fill="currentColor" className="text-[10px] font-semibold text-red-300/90">
          the loss has no ceiling
        </text>
        <text x={548} y={78} fill="currentColor" className="text-[9.5px] text-teal-200/55">
          a rising price is a rising bill —
        </text>
        <text x={548} y={92} fill="currentColor" className="text-[9.5px] text-teal-200/55">
          and a squeeze can force it higher
        </text>
        <text x={548} y={106} fill="currentColor" className="text-[9.5px] text-teal-200/55">
          plus borrow rent while you wait
        </text>
      </svg>
    </Shell>
  );
}

/* ---------- 17 · quote-paths — two honest numbers ---------- */

function QuotePaths() {
  return (
    <Shell
      title="Two apps, two honest numbers"
      caption="Neither app is lying. One answers “what did the last trade print, fifteen minutes ago?”; the other answers “what's the midpoint of the current bid and ask, on a different venue?” Different questions, different clocks."
    >
      <svg viewBox="0 0 720 200" className="w-full" role="img" aria-label="One market feeds two apps: App A shows twenty dollars ten as a delayed last trade; App B shows twenty dollars fourteen as a bid-ask midpoint from another venue.">
        <ArrowDefs id="qp-a" />
        <NodeBox x={24} y={68} w={170} h={60} lines={["THE MARKET"]} sub="a dozen venues, one stock" tone="accent" />
        <NodeBox x={440} y={26} w={250} h={54} lines={["APP A: $20.10"]} sub="the last trade — 15 minutes old" />
        <NodeBox x={440} y={118} w={250} h={54} lines={["APP B: $20.14"]} sub="bid/ask midpoint — another venue" />
        <Flow x1={196} x2={436} y={78} marker="qp-a" label="same moment" />
        <Flow x1={196} x2={436} y={122} marker="qp-a" labelAbove={false} label="same stock" />
        <text x={360} y={186} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/50">
          fifteen minutes + a different venue + last-vs-mid = disagreement without a liar in sight
        </text>
      </svg>
    </Shell>
  );
}

/* ---------- 18 · thesis-price-2x2 — the only sell matrix that matters ---------- */

function ThesisPrice2x2() {
  const cellText = (x: number, y: number, title: string, sub: string, broken: boolean) => (
    <g>
      <rect x={x} y={y} width={250} height={78} rx={9} className={broken ? "fill-red-400/[0.05] stroke-red-400/30" : "fill-teal-400/5 stroke-teal-400/30"} strokeWidth={1.2} />
      <text x={x + 125} y={y + 32} textAnchor="middle" fill="currentColor" className={`text-[12px] font-bold ${broken ? "text-red-300/90" : "text-teal-50"}`}>
        {title}
      </text>
      <text x={x + 125} y={y + 52} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/60">
        {sub}
      </text>
    </g>
  );
  return (
    <Shell
      title="Sell on the thesis, not the price"
      caption="The market doesn't know your entry price and doesn't care. The only column that matters is whether the REASON you bought still stands."
    >
      <svg viewBox="0 0 720 250" className="w-full" role="img" aria-label="A two-by-two grid: thesis intact and price up means let it run; thesis intact and price down is not a sell signal; thesis broken means sell whether the price is up or down.">
        <text x={285} y={36} textAnchor="middle" fill="currentColor" className="text-[10px] font-bold uppercase tracking-widest text-teal-300/60">
          Thesis intact
        </text>
        <text x={555} y={36} textAnchor="middle" fill="currentColor" className="text-[10px] font-bold uppercase tracking-widest text-red-300/70">
          Thesis broken
        </text>
        <g fill="currentColor" className="text-teal-200/60">
          <text x={148} y={90} textAnchor="end" className="text-[10px] font-semibold">price UP</text>
          <text x={148} y={186} textAnchor="end" className="text-[10px] font-semibold">price DOWN</text>
        </g>
        {cellText(160, 48, "let it run", "and grade the call later", false)}
        {cellText(430, 48, "sell", "you're lucky, not right", true)}
        {cellText(160, 144, "not a sell signal", "the same thesis just got cheaper", false)}
        {cellText(430, 144, "sell", "your entry price is a sunk cost", true)}
      </svg>
    </Shell>
  );
}

/* ---------- 19 · proposes-disposes — the separation of powers ---------- */

function ProposesDisposes() {
  return (
    <Shell
      title="The separation of powers"
      caption="Alfred can argue; the gate can't listen. Humans sit above both — they set the rules the gate enforces and hold the switch that stops everything."
    >
      <svg viewBox="0 0 720 230" className="w-full" role="img" aria-label="A triangle: Cam and Graham at the top hold the rules and the kill switch; Alfred at the bottom left proposes orders; the paragraph-six gate at the bottom right disposes of them in code.">
        <ArrowDefs id="pd-a" />
        <NodeBox x={255} y={14} w={210} h={52} lines={["CAM & GRAHAM"]} sub="hold the rules + the kill switch" tone="accent" />
        <NodeBox x={56} y={146} w={220} h={56} lines={["ALFRED"]} sub="reads · researches · proposes" />
        <NodeBox x={444} y={146} w={220} h={56} lines={["THE §6 GATE"]} sub="code — cannot be talked into it" tone="accent" />
        <Flow x1={278} x2={440} y={174} marker="pd-a" label="every order, every time" />
        <g className="text-teal-300/50">
          <line x1={312} y1={68} x2={190} y2={142} stroke="currentColor" strokeWidth={1.3} strokeDasharray="5 4" markerEnd="url(#pd-a)" />
          <line x1={408} y1={68} x2={530} y2={142} stroke="currentColor" strokeWidth={1.3} strokeDasharray="5 4" markerEnd="url(#pd-a)" />
        </g>
        <text x={178} y={100} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/55">
          block · demote · kill
        </text>
        <text x={578} y={100} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/55">
          only humans change the rules
        </text>
      </svg>
    </Shell>
  );
}

/* ---------- 20 · rsi-gauge — a description, not a forecast ---------- */

function RsiGauge() {
  const cx = 360;
  const cy = 168;
  const r = 118;
  const angle = (rsi: number) => 180 - rsi * 1.8;
  const needleAt = 24;
  const [nx, ny] = polar(cx, cy, r - 22, angle(needleAt));
  const tick = (v: number) => {
    const [tx, ty] = polar(cx, cy, r + 16, angle(v));
    return (
      <text key={v} x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fill="currentColor" className="text-[9.5px] tabular-nums text-teal-200/50">
        {v}
      </text>
    );
  };
  return (
    <Shell
      title="RSI, honestly labelled"
      caption="The needle says the ride so far was hard and fast — nothing more. Cheap-and-falling is still falling; “stretched” is a tension reading, not a bounce guarantee."
    >
      <svg viewBox="0 0 720 205" className="w-full" role="img" aria-label="A semicircular gauge from zero to one hundred with stretched zones below thirty and above seventy; the needle points at twenty-four, labelled as a description of the ride so far, not a forecast.">
        <g className="text-amber-400/70">
          <path d={arcPath(cx, cy, r, 180, angle(30))} fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="round" />
        </g>
        <g className="text-teal-400/25">
          <path d={arcPath(cx, cy, r, angle(30), angle(70))} fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="round" />
        </g>
        <g className="text-amber-400/70">
          <path d={arcPath(cx, cy, r, angle(70), 0)} fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="round" />
        </g>
        {[0, 30, 70, 100].map(tick)}
        <text x={168} y={84} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-amber-300/80">
          stretched low
        </text>
        <text x={552} y={84} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-amber-300/80">
          stretched high
        </text>
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="currentColor" strokeWidth={2.5} className="text-teal-50" />
        <circle cx={cx} cy={cy} r={5} className="fill-teal-300" />
        {/* surface halo so the needle reads as passing BEHIND the reading */}
        <text x={cx} y={cy - 46} textAnchor="middle" fill="currentColor" paintOrder="stroke" stroke="var(--card-bg)" strokeWidth={6} strokeLinejoin="round" className="text-[13px] font-bold text-teal-50">
          RSI 24
        </text>
        <text x={cx} y={cy - 28} textAnchor="middle" fill="currentColor" paintOrder="stroke" stroke="var(--card-bg)" strokeWidth={5} strokeLinejoin="round" className="text-[9.5px] text-teal-200/60">
          “this fell hard and fast” — the ride so far, not the road ahead
        </text>
      </svg>
    </Shell>
  );
}

/* ---------- the registry ---------- */

export const DIAGRAMS: Record<LearnDiagramKey, ReactNode> = {
  "order-path": <OrderPath />,
  "market-map": <MarketMap />,
  "book-ladder": <BookLadder />,
  "acb-timeline": <AcbTimeline />,
  "drawdown-ladder": <DrawdownLadder />,
  "margin-spiral": <MarginSpiral />,
  "fee-gravity": <FeeGravity />,
  "grq-pipeline": <GrqPipeline />,
  "two-listings": <TwoListings />,
  "ex-date-step": <ExDateStep />,
  "pizza-split": <PizzaSplit />,
  "target-chase": <TargetChase />,
  "one-bet-ten-times": <OneBetTenTimes />,
  "short-asymmetry": <ShortAsymmetry />,
  "quote-paths": <QuotePaths />,
  "thesis-price-2x2": <ThesisPrice2x2 />,
  "proposes-disposes": <ProposesDisposes />,
  "rsi-gauge": <RsiGauge />,
};
