import Link from "next/link";
import { money, pct, signedMoney } from "@/lib/money";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import type { Recommendation } from "@/agent/signals";
import { Card } from "@/components/ui";
import StockLogo from "@/components/StockLogo";
import CollapsibleMd from "@/components/CollapsibleMd";
import Term from "@/components/Term";
import WatchButton, { type WatchState } from "@/components/WatchButton";

// The "researched idea" card — GRQ's call + targets + the dossier body. Shared by
// the Discover tab (the hunt + the agent's ideas) AND the Watchlist (a row expands
// into this — Cam 2026-06-16). `compact` is the small grid tile; the default is the
// full two-column card.
export type Idea = {
  sym: string;
  name: string;
  logoUrl: string | null;
  currency: string | null;
  cur: number | null;
  near: number | null;
  far: number | null;
  nearDays: number | null;
  confidence: number | null;
  rec: Recommendation | null;
  stance: string | null;
  body: string;
  sourcesJson: string | null;
  obscurity: number | null; // agent's 1–5 under-the-radar score (D38; null = no read)
  watch: WatchState;
};

const OBSCURITY_LABEL: Record<number, string> = {
  5: "🔍 deep cut",
  4: "under-the-radar",
  3: "lesser-known",
  2: "some coverage",
  1: "well-followed",
};

// Surface obscurity (D38) — the agent's 1–5 read on how off-the-radar a hunt find is
// (5 = almost nobody covers it). Amber so it reads apart from the teal conviction chip.
// Only meaningful on discovery leads.
function ObscurityBadge({ score }: { score?: number | null }) {
  if (!score || !OBSCURITY_LABEL[score]) return null;
  return (
    <span
      className="rounded-full border border-amber-400/20 bg-amber-400/5 px-2 py-0.5 text-[10px] font-semibold text-amber-200/70"
      title="How under-the-radar this is — GRQ's read (5 = almost nobody covers it)"
    >
      {OBSCURITY_LABEL[score]}
    </span>
  );
}

export function SourceChips({ sourcesJson }: { sourcesJson: string | null }) {
  if (!sourcesJson) return null;
  let sources: string[] = [];
  try {
    sources = JSON.parse(sourcesJson);
  } catch {
    return null;
  }
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s, i) => (
        <span key={i} className="rounded-full border border-teal-400/15 bg-teal-400/5 px-2 py-0.5 text-[10px] text-teal-200/60">
          {s}
        </span>
      ))}
    </div>
  );
}

export default function IdeaCard({
  idea,
  isMember,
  compact = false,
  discovery = false,
}: {
  idea: Idea;
  isMember: boolean;
  compact?: boolean;
  // Discovery/lead context (the hunt): suppress the Buy/Hold/Sell verdict — a
  // "Hold" on a name you don't own is contradictory, and these are leads, not
  // positions — and lead with the 12-mo upside + GRQ's conviction. (Cam 2026-06-16)
  discovery?: boolean;
}) {
  const sm = stanceMeta(idea.stance);
  if (compact) {
    return (
      <Card className="flex h-full flex-col p-4">
        <div className="flex items-center gap-2.5">
          <StockLogo symbol={idea.sym} logoUrl={idea.logoUrl} className="h-8 w-8 text-[10px]" />
          <Link href={`/stocks/${idea.sym}`} className="font-bold text-teal-200 hover:underline">
            {idea.sym}
          </Link>
          <span className="min-w-0 flex-1 truncate text-xs text-teal-200/50">{idea.name}</span>
          {discovery ? (
            <div className="flex shrink-0 items-center gap-2">
              {idea.far !== null && (
                <span className={`text-sm font-black ${idea.far > 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {idea.far > 0 ? "+" : ""}
                  {pct(idea.far, 0)}
                </span>
              )}
              {idea.confidence != null && (
                <span className="rounded-full bg-teal-400/10 px-2 py-0.5 text-[10px] font-semibold text-teal-200/70" title="GRQ's conviction this is worth a look">
                  {idea.confidence}% conf
                </span>
              )}
            </div>
          ) : sm ? (
            <span className={`shrink-0 text-sm font-black ${STANCE_TONE_CLASSES[sm.tone].text}`} title={`GRQ's call: ${sm.blurb}`}>
              {sm.label}
            </span>
          ) : idea.far !== null ? (
            <span className={`shrink-0 text-sm font-black ${idea.far > 0 ? "text-emerald-400" : "text-red-400"}`}>
              {idea.far > 0 ? "+" : ""}
              {pct(idea.far, 0)}
            </span>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-teal-200/50">
          {discovery && <ObscurityBadge score={idea.obscurity} />}
          {idea.cur !== null && <span>now {money(idea.cur, idea.currency)}</span>}
          {!discovery && idea.far !== null && (
            <span className={idea.far > 0 ? "text-emerald-400/80" : "text-red-400/80"}>
              12-mo {idea.far > 0 ? "+" : ""}
              {pct(idea.far, 0)}
            </span>
          )}
          {!discovery && idea.confidence != null && <span>conf {idea.confidence}%</span>}
          {discovery && idea.far === null && idea.confidence == null && <span className="text-teal-200/40">early look — no target yet</span>}
        </div>
        <div className="mt-2 grow">
          <CollapsibleMd text={idea.body} threshold={180}>
            <SourceChips sourcesJson={idea.sourcesJson} />
          </CollapsibleMd>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link href={`/stocks/${idea.sym}`} className="text-xs text-teal-300 hover:underline">
            full dossier →
          </Link>
          {isMember && idea.watch === "universe" ? (
            <span className="text-[11px] font-semibold text-emerald-300/70">✓ universe</span>
          ) : isMember ? (
            <WatchButton symbol={idea.sym} watching={idea.watch === "watching"} />
          ) : null}
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3">
            <StockLogo symbol={idea.sym} logoUrl={idea.logoUrl} className="h-10 w-10 text-xs" />
            <div className="min-w-0">
              <Link href={`/stocks/${idea.sym}`} className="text-lg font-bold text-teal-200 hover:underline">
                {idea.sym}
              </Link>
              <div className="truncate text-sm text-teal-200/50">{idea.name}</div>
            </div>
            {idea.far !== null && (
              <div className="ml-auto shrink-0 text-right">
                <div className={`text-2xl font-black tabular-nums ${idea.far > 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {idea.far > 0 ? "+" : ""}
                  {pct(idea.far, 0)}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-teal-200/40">
                  <Term k="expected-return" align="right">12-mo upside</Term>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-teal-200/60">
            {idea.cur !== null && <span>now {money(idea.cur, idea.currency)}</span>}
            {idea.near !== null && (
              <span>
                near{idea.nearDays ? ` ~${Math.max(1, Math.round(idea.nearDays / 5))}w` : ""}{" "}
                <b className={idea.near > 0 ? "text-emerald-400" : "text-red-400"}>
                  {idea.near > 0 ? "+" : ""}
                  {pct(idea.near, 0)}
                </b>
              </span>
            )}
            {idea.far !== null && <span>≈ {signedMoney(Math.round(idea.far * 100_000))} on $1k</span>}
            {idea.confidence != null && (
              <span>
                <Term k="confidence">conf</Term> {idea.confidence}%
              </span>
            )}
          </div>

          <div className="mt-3">
            <CollapsibleMd text={idea.body} threshold={280}>
              <SourceChips sourcesJson={idea.sourcesJson} />
            </CollapsibleMd>
          </div>
        </div>

        <div className="lg:border-l lg:border-teal-400/10 lg:pl-5">
          <div className="text-[10px] uppercase tracking-wider text-teal-200/50">
            {discovery ? "Early look" : <Term k="agent-call">GRQ&apos;s call</Term>}
          </div>
          {discovery ? (
            <div className="mt-1">
              {idea.confidence != null ? (
                <>
                  <span className="text-2xl font-black text-teal-200">{idea.confidence}%</span>
                  <p className="mt-1 text-xs text-teal-200/50">GRQ&apos;s conviction this is worth a look — an early-stage find, not a position call.</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-teal-200/40">An early-stage find — not yet a position call.</p>
              )}
              {idea.obscurity != null && (
                <div className="mt-2">
                  <ObscurityBadge score={idea.obscurity} />
                </div>
              )}
            </div>
          ) : sm ? (
            <div className="mt-1">
              <span className={`text-2xl font-black ${STANCE_TONE_CLASSES[sm.tone].text}`}>{sm.label}</span>
              <p className="mt-1 text-xs text-teal-200/50">{sm.blurb}</p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-teal-200/40">Not yet rated by GRQ.</p>
          )}
          {idea.rec && <p className="mt-3 text-[11px] text-teal-200/40">technicals lean {idea.rec.label} — an input, not the call</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href={`/stocks/${idea.sym}`} className="text-xs text-teal-300 hover:underline">
              full dossier →
            </Link>
            {isMember && idea.watch === "universe" ? (
              <span className="text-[11px] font-semibold text-emerald-300/70">✓ in your universe</span>
            ) : isMember ? (
              <WatchButton symbol={idea.sym} watching={idea.watch === "watching"} />
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
