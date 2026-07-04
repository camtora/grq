// The Learn framework's diagram registry (docs/LEARN-FRAMEWORK.md D111 §5.1, phase L3).
// Hand-built, theme-aware SVG — no images to rot, crisp at any width, and they re-skin
// with the theme because every colour is a teal/red/emerald/amber class, currentColor,
// or a chart CSS var (docs/DESIGN.md §1.1 — never raw hex). Identity is never
// colour-alone: every mark carries a text label. The two data-shaped diagrams
// (drawdown-ladder, fee-gravity) reuse the CompoundingSim colour pair — var(--spark-up)
// + themed amber — which is already CVD-validated on both surfaces.

import type { ReactNode } from "react";
import type { LearnDiagramKey } from "@/lib/learn/content";

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
        {/* the money path */}
        <g className="text-emerald-300/80">
          <path d="M 75 84 C 75 150, 650 150, 650 84" fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="5 4" markerEnd="url(#op-m)" />
          <defs>
            <marker id="op-m" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>
          <text x={360} y={158} textAnchor="middle" fill="currentColor" className="text-[10px] font-semibold">
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
        {/* primary: you -> company */}
        <NodeBox x={26} y={62} w={120} h={50} lines={["YOU"]} />
        <NodeBox x={202} y={62} w={120} h={50} lines={["THE COMPANY"]} tone="accent" />
        <g className="text-emerald-300/80">
          <line x1={146} y1={80} x2={200} y2={80} stroke="currentColor" strokeWidth={1.5} markerEnd="url(#mm-m)" />
          <defs>
            <marker id="mm-m" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>
          <text x={173} y={70} textAnchor="middle" fill="currentColor" className="text-[9.5px] font-semibold">
            your money
          </text>
        </g>
        <Flow x1={200} x2={148} y={96} marker="mm-a" label="new shares" labelAbove={false} />
        <text x={174} y={148} textAnchor="middle" fill="currentColor" className="text-[9.5px] text-teal-200/50">
          the only trade that funds the business
        </text>
        {/* secondary: investor <-> investor */}
        <NodeBox x={398} y={62} w={120} h={50} lines={["INVESTOR A"]} />
        <NodeBox x={574} y={62} w={120} h={50} lines={["INVESTOR B"]} />
        <Flow x1={518} x2={572} y={78} marker="mm-a" label="shares" />
        <Flow x1={572} x2={520} y={96} marker="mm-a" label="money" labelAbove={false} />
        <g className="text-teal-200/40">
          <rect x={488} y={136} width={116} height={28} rx={8} className="fill-none stroke-teal-400/15" strokeDasharray="4 3" />
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
  const bidTop = spreadY + 30;
  return (
    <Shell
      title="The order book, standing still"
      caption="Six real resting orders around a 20¢ gap nobody has crossed yet. A market buy takes 20.10; a market sell hits 19.90 — the spread is the toll between them. (The toy exchange in the next lesson lets you push these around.)"
    >
      <svg viewBox="0 0 720 220" className="w-full" role="img" aria-label="A price ladder: sell orders (asks) stacked above at 20.10 to 20.14, buy orders (bids) below at 19.86 to 19.90, with the 20-cent spread gap highlighted between the best ask and best bid.">
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
        {/* the sell's two futures */}
        <g className="text-emerald-300/90">
          <rect x={545} y={y + 42} width={165} height={26} rx={7} className="fill-emerald-400/10 stroke-emerald-400/40" />
          <text x={627} y={y + 55} textAnchor="middle" dominantBaseline="middle" fill="currentColor" className="text-[10px] font-semibold">
            realized: +$15.00 — real
          </text>
          <line x1={478} y1={y + 8} x2={560} y2={y + 44} stroke="currentColor" strokeWidth={1.2} className="text-emerald-400/40" />
        </g>
        <g className="text-teal-200/55">
          <rect x={330} y={y + 42} width={195} height={26} rx={7} className="fill-none stroke-teal-400/20" strokeDasharray="4 3" />
          <text x={427} y={y + 55} textAnchor="middle" dominantBaseline="middle" fill="currentColor" className="text-[10px]">
            5 shares left: unrealized — paper
          </text>
          <line x1={462} y1={y + 8} x2={440} y2={y + 42} stroke="currentColor" strokeWidth={1.2} className="text-teal-400/25" />
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
};
