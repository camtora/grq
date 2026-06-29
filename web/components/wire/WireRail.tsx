import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import StockLogo from "@/components/StockLogo";
import Avatar from "@/components/Avatar";
import Sparkline from "@/components/race/Sparkline";
import PanelHeader from "@/components/PanelHeader";
import { heatColor } from "@/lib/heat";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import { personByName } from "@/lib/people";

// The Wire on web — the iOS discovery feed (docs/.. / grq-the-wire-feed), surfaced as a
// narrow right-hand rail on Today. Same data (lib/feed.ts `wireResponse`, viewer-aware), just
// rendered as compact stacked cards sized for a 1/4-width column. Read-only; every card links
// into the existing stock/dossier/news destinations. No API/contract/schema change.

export type WireCard = {
  id: string;
  kind: "find" | "dossier" | "watch" | "article" | "lesson";
  at: string;
  symbol?: string | null;
  name?: string | null;
  logoUrl?: string | null;
  call?: string | null; // lowercase legacy enum — stanceMeta() maps it to a label/tone
  farBps?: number | null; // 12-month upside vs current
  heat?: number | null;
  spark?: number[] | null;
  bullets?: string[] | null;
  watcher?: string | null;
  title?: string | null;
  publisher?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  relatedTickers?: string[] | null;
  lessonTerm?: string | null;
  lessonBody?: string | null;
  lessonExample?: string | null;
};

const KIND_TAG: Record<string, string> = { find: "Find", dossier: "Dossier", watch: "Watching", article: "News", lesson: "Learn" };

const upside = (bps?: number | null): string | null => (bps == null ? null : `${bps >= 0 ? "+" : ""}${Math.round(bps / 100)}%`);

function CardShell({ kind, children }: { kind: string; children: ReactNode }) {
  return (
    <Card className="p-3">
      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-teal-300/50">{KIND_TAG[kind] ?? kind}</div>
      {children}
    </Card>
  );
}

function StockHead({ it }: { it: WireCard }) {
  return (
    <Link href={`/stocks/${encodeURIComponent(it.symbol!)}`} className="flex min-w-0 items-center gap-2 hover:underline">
      <StockLogo symbol={it.symbol!} logoUrl={it.logoUrl ?? null} className="h-6 w-6 shrink-0 text-[10px]" />
      <span className="min-w-0 leading-tight">
        <span className="font-mono text-xs font-semibold text-teal-200">{it.symbol}</span>
        {it.name && <span className="ml-1 text-[11px] text-teal-200/55">· {it.name}</span>}
      </span>
    </Link>
  );
}

function StockWireCard({ it }: { it: WireCard }) {
  const call = stanceMeta(it.call);
  const up = upside(it.farBps);
  return (
    <CardShell kind={it.kind}>
      <StockHead it={it} />
      {(it.heat != null || call || up) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
          {it.heat != null && (
            <span className="font-semibold tabular-nums" style={{ color: heatColor(it.heat) }}>
              heat {it.heat}
            </span>
          )}
          {call && <span className={`font-semibold ${STANCE_TONE_CLASSES[call.tone].text}`}>{call.label}</span>}
          {up && (
            <span className={`font-semibold tabular-nums ${it.farBps! >= 0 ? "text-emerald-400" : "text-red-400"}`}>{up} · 12-mo</span>
          )}
        </div>
      )}
      {it.spark && it.spark.length > 1 && (
        <div className="mt-2 h-8">
          <Sparkline data={it.spark} className="h-full w-full" />
        </div>
      )}
      {it.bullets && it.bullets.length > 0 && (
        <ul className="mt-2 space-y-1">
          {it.bullets.slice(0, 2).map((b, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-teal-100/70">
              <span className="shrink-0 text-teal-300/50">·</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function WatchCard({ it }: { it: WireCard }) {
  const person = personByName(it.watcher);
  return (
    <CardShell kind={it.kind}>
      <div className="flex items-center gap-2">
        <Avatar src={person?.photo ?? null} name={it.watcher ?? "Agent"} size="h-6 w-6" />
        <span className="text-[11px] text-teal-200/70">
          <span className="font-semibold text-teal-100">{it.watcher}</span> is watching
        </span>
      </div>
      <div className="mt-2">
        <StockHead it={it} />
      </div>
      {it.spark && it.spark.length > 1 && (
        <div className="mt-2 h-7">
          <Sparkline data={it.spark} className="h-full w-full" />
        </div>
      )}
    </CardShell>
  );
}

function ArticleCard({ it }: { it: WireCard }) {
  const href = it.url ?? (it.relatedTickers?.[0] ? `/stocks/${encodeURIComponent(it.relatedTickers[0])}` : null);
  const body = (
    <>
      {it.imageUrl && (
        <div className="mb-2 -mx-3 -mt-0.5 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={it.imageUrl} alt="" className="h-24 w-full object-cover" />
        </div>
      )}
      <div className="line-clamp-3 text-xs font-semibold leading-snug text-teal-50">{it.title}</div>
      {it.publisher && <div className="mt-1 text-[10px] uppercase tracking-wider text-teal-200/40">{it.publisher}</div>}
    </>
  );
  return (
    <CardShell kind={it.kind}>
      {href ? (
        it.url ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90">
            {body}
          </a>
        ) : (
          <Link href={href} className="block hover:opacity-90">
            {body}
          </Link>
        )
      ) : (
        body
      )}
    </CardShell>
  );
}

function LessonCard({ it }: { it: WireCard }) {
  return (
    <Card className="border-teal-400/25 bg-teal-400/[0.05] p-3">
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.15em] text-teal-300/60">Learn</div>
      <div className="text-xs font-bold text-teal-50">{it.lessonTerm}</div>
      {it.lessonBody && <p className="mt-1 line-clamp-4 text-[11px] leading-snug text-teal-100/75">{it.lessonBody}</p>}
      {it.lessonExample && <p className="mt-1.5 line-clamp-2 text-[10px] italic text-teal-200/50">{it.lessonExample}</p>}
    </Card>
  );
}

export default function WireRail({ items }: { items: WireCard[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="lg:sticky lg:top-6">
      <PanelHeader>The Wire</PanelHeader>
      <p className="mb-2 mt-1 text-[11px] text-teal-200/45">Finds, calls, watches &amp; news — woven.</p>
      <div className="space-y-3 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
        {items.map((it) => {
          switch (it.kind) {
            case "find":
            case "dossier":
              return <StockWireCard key={it.id} it={it} />;
            case "watch":
              return <WatchCard key={it.id} it={it} />;
            case "article":
              return <ArticleCard key={it.id} it={it} />;
            case "lesson":
              return <LessonCard key={it.id} it={it} />;
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
