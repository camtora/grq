import Link from "next/link";
import Md from "@/components/Md";
import { prisma } from "@/lib/db";
import type { LearnBlock } from "@/lib/learn/content";
import OrderBookSim from "./OrderBookSim";
import CompoundingSim from "./CompoundingSim";
import ReceiptBlock from "./Receipts";
import CheckBlock from "./CheckBlock";
import LiteYouTube from "./LiteYouTube";
import LearnChart from "./LearnChart";
import { DIAGRAMS } from "./diagrams";

// Renders one lesson block (docs/LEARN-FRAMEWORK.md D111 §4) — the server side of the
// framework. prose/callout go through Md (tap-to-explain for free); widget/check are the
// client islands; example/receipt are the live parts and NEVER take the lesson down
// (fallbacks by construction). diagram/chart kinds land with their renderers (L3).

const WIDGETS = {
  "order-book": <OrderBookSim />,
  compounding: <CompoundingSim />,
} as const;

const NICE_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" });

const CALLOUT: Record<"note" | "trap" | "rule", { label: string; cls: string; labelCls: string }> = {
  note: { label: "Note", cls: "border-teal-400/20 bg-teal-400/[0.04]", labelCls: "text-teal-300/80" },
  trap: { label: "Trap", cls: "border-amber-400/25 bg-amber-400/[0.05]", labelCls: "text-amber-300/90" },
  rule: { label: "Hard rule", cls: "border-red-400/25 bg-red-400/[0.04]", labelCls: "text-red-300/90" },
};

/** The living-example block: a market illustration refreshed nightly from data GRQ
 *  already ingests (framework L4 — the engine). Until a row exists (or if the lookup
 *  fails), the authored fallback renders as an honest illustration. */
async function ExampleBlock({ k, fallbackMd }: { k: string; fallbackMd: string }) {
  let row: { md: string; asOf: Date } | null = null;
  try {
    row = await prisma.learnExample.findUnique({ where: { key: k }, select: { md: true, asOf: true } });
  } catch {
    row = null;
  }
  return (
    <div className="mt-4 rounded-xl border border-teal-400/10 bg-teal-400/[0.02] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Market example</div>
        <div className="text-[10px] text-teal-200/35">
          {row ? `live · as of ${NICE_DAY.format(row.asOf)}` : "illustration — the live version returns as the data refreshes"}
        </div>
      </div>
      <div className="mt-2.5">
        <Md text={row ? row.md : fallbackMd} />
      </div>
    </div>
  );
}

export default async function BlockRenderer({ block, lede = false }: { block: LearnBlock; lede?: boolean }) {
  switch (block.kind) {
    case "prose":
      return <Md text={block.md} ledeBoost={lede} />;
    case "callout": {
      const t = CALLOUT[block.tone];
      return (
        <div className={`mt-4 rounded-xl border p-4 ${t.cls}`}>
          <div className={`text-xs font-bold uppercase tracking-[0.2em] ${t.labelCls}`}>{t.label}</div>
          <div className="mt-1.5">
            <Md text={block.md} />
          </div>
        </div>
      );
    }
    case "figure":
      return (
        <figure className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.src} alt={block.alt} className="w-full rounded-xl border border-teal-400/10" />
          {block.caption || block.credit ? (
            <figcaption className="mt-1.5 text-[11px] text-teal-200/50">
              {block.caption}
              {block.credit ? <span className="text-teal-200/35"> — {block.credit}</span> : null}
            </figcaption>
          ) : null}
        </figure>
      );
    case "diagram":
      return DIAGRAMS[block.id] ?? null;
    case "chart":
      return <LearnChart spec={block.spec} />;
    case "widget":
      return WIDGETS[block.id] ?? null;
    case "receipt":
      return <ReceiptBlock k={block.id} />;
    case "example":
      return <ExampleBlock k={block.key} fallbackMd={block.fallbackMd} />;
    case "video":
      return <LiteYouTube yt={block.yt} title={block.title} author={block.author} minutes={block.minutes} why={block.why} />;
    case "check":
      return <CheckBlock q={block.q} />;
    case "tryIt":
      return (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-teal-400/10 pt-3">
          {block.links.map((t) => (
            <Link key={t.href} href={t.href} className="text-xs text-teal-300 hover:underline">
              {t.label} →
            </Link>
          ))}
        </div>
      );
    default:
      return null;
  }
}
