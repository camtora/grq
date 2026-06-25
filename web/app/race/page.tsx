import { prisma } from "@/lib/db";
import { fmtWhen } from "@/lib/money";
import { Card, PageHeader, Chip, EmptyState } from "@/components/ui";
import CollapsibleMd from "@/components/CollapsibleMd";

// The Race (D68) — the model bake-off. Every decision/report session, the live agent (the
// CHAMPION, Opus) and one or more CHALLENGER models (Phase 1: Sonnet) are handed the EXACT same
// frozen prompt. The champion acts; the challengers only say what they WOULD do (shadow-only,
// no tools, never touches the §6 gate). This page shows the two reads side by side.
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  morning: "Morning plan",
  checkin: "Intraday check-in",
  midday: "Midday brief",
  eod: "EOD report",
  position: "Position check",
};
const DECISION_KINDS = new Set(["morning", "checkin", "position"]);

// Pretty model names; fall back to the raw id for anything unmapped.
function modelLabel(id: string): string {
  if (id.includes("opus")) return "Opus 4.8";
  if (id.includes("sonnet")) return "Sonnet 4.6";
  if (id.includes("haiku")) return "Haiku 4.5";
  return id;
}

// A challenger ends its prose with a fenced ```json decision block — but we already parse that
// into the action chip + summary line above, so strip the trailing block from the text we show.
// Handles a closed fence and an unclosed trailing one; no-op when there's no such block.
function stripDecisionBlock(text: string): string {
  return text
    .replace(/\s*```(?:json)?\s*\{[\s\S]*?\}\s*```\s*$/i, "")
    .replace(/\s*```(?:json)?\s*\{[\s\S]*?\}\s*$/i, "")
    .trimEnd();
}

type Row = {
  id: number;
  sessionAt: Date;
  sessionKind: string;
  label: string;
  reason: string;
  model: string;
  role: string;
  text: string;
  action: string | null;
  symbol: string | null;
  qty: number | null;
  confidence: number | null;
  thesis: string | null;
};

function ActionChip({ action, confidence }: { action: string | null; confidence: number | null }) {
  if (!action) return <span className="text-xs text-teal-200/30">no proposal parsed</span>;
  const tone = action === "BUY" ? "green" : action === "SELL" ? "red" : "dim";
  return (
    <Chip tone={tone as "green" | "red" | "dim"}>
      {action}
      {confidence != null ? ` · ${confidence}%` : ""}
    </Chip>
  );
}

// The headline conviction bar only — BUYs need ≥75% (HARD.minBuyConfidence). The full §6 gate
// (universe, cash floor, fee edge, rate limits…) is a deterministic dry-run we add next.
function GateBadge({ action, confidence }: { action: string | null; confidence: number | null }) {
  if (action !== "BUY") return null;
  if (confidence == null) return <Chip tone="dim">no confidence</Chip>;
  return confidence >= 75 ? <Chip tone="green">clears 75% gate</Chip> : <Chip tone="red">below 75% gate</Chip>;
}

function Lane({ row }: { row: Row }) {
  const isChampion = row.role === "champion";
  const decision = DECISION_KINDS.has(row.sessionKind);
  return (
    <div className="rounded-lg border border-teal-400/10 bg-teal-400/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={isChampion ? "teal" : "dim"}>{isChampion ? "Champion · live" : "Challenger · shadow"}</Chip>
        <span className="text-sm font-semibold text-teal-50">{modelLabel(row.model)}</span>
        {!isChampion && decision && (
          <span className="ml-auto flex items-center gap-2">
            <ActionChip action={row.action} confidence={row.confidence} />
            <GateBadge action={row.action} confidence={row.confidence} />
          </span>
        )}
      </div>
      {!isChampion && decision && row.symbol && (
        <p className="mt-2 text-sm text-teal-100/70">
          <span className="font-semibold text-teal-50">
            {row.action} {row.qty ?? ""} {row.symbol}
          </span>
          {row.thesis ? ` — ${row.thesis}` : ""}
        </p>
      )}
      <div className="mt-2">
        <CollapsibleMd text={isChampion ? row.text : stripDecisionBlock(row.text)} threshold={420} />
      </div>
    </div>
  );
}

export default async function RacePage() {
  const rows = (await prisma.shadowRun.findMany({ orderBy: { sessionAt: "desc" }, take: 240 })) as Row[];

  // Group by the session join key. Each group = one session: a champion + its challengers.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.sessionAt.toISOString();
    let arr = groups.get(k);
    if (!arr) {
      arr = [];
      groups.set(k, arr);
    }
    arr.push(r);
  }
  const sessions = [...groups.values()].sort((a, b) => b[0].sessionAt.getTime() - a[0].sessionAt.getTime());

  // Summary: how trigger-happy the challengers are vs the champion (whose real trades live in
  // Order/Trade — scoring against outcomes is the next phase; this is the side-by-side for now).
  const challengerRows = rows.filter((r) => r.role === "challenger");
  const dist = { BUY: 0, SELL: 0, HOLD: 0, NONE: 0 } as Record<string, number>;
  for (const r of challengerRows) if (r.action && r.action in dist) dist[r.action]++;
  const models = [...new Set(challengerRows.map((r) => modelLabel(r.model)))];

  return (
    <main>
      <PageHeader
        title="The Race"
        sub="Same data, different minds. Every session the live agent (Opus) and the challenger(s) get the EXACT same frozen prompt — the champion trades, the challengers only say what they'd do. Receipts, side by side."
      />

      {sessions.length === 0 ? (
        <EmptyState
          title="No races yet"
          body="The next morning plan, intraday check-in, midday brief, and EOD report will each run the challenger on the same data and land here. First entries appear on the next market session."
        />
      ) : (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span>
                <span className="text-xs uppercase tracking-wider text-teal-200/40">Sessions raced</span>{" "}
                <span className="font-semibold tabular-nums text-teal-50">{sessions.length}</span>
              </span>
              <span>
                <span className="text-xs uppercase tracking-wider text-teal-200/40">Challenger(s)</span>{" "}
                <span className="font-semibold text-teal-50">{models.join(", ") || "—"}</span>
              </span>
              <span>
                <span className="text-xs uppercase tracking-wider text-teal-200/40">Challenger calls</span>{" "}
                <span className="font-semibold tabular-nums text-teal-50">
                  {dist.BUY} buy · {dist.SELL} sell · {dist.HOLD} hold · {dist.NONE} stand-down
                </span>
              </span>
            </div>
            <p className="mt-3 text-xs text-teal-200/40">
              Honest framing: a shadow pick never faced a real fill or slippage, so it&apos;s a hypothesis, not a track record.
              Scoring the calls against what actually happened (and a full guardrail dry-run) comes next — for now this is the
              side-by-side read.
            </p>
          </Card>

          {sessions.map((g) => {
            const head = g[0];
            const champion = g.find((r) => r.role === "champion");
            const challengers = g.filter((r) => r.role === "challenger");
            return (
              <Card key={head.sessionAt.toISOString()} className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Chip tone="teal">{KIND_LABEL[head.sessionKind] ?? head.sessionKind}</Chip>
                  <span className="text-sm text-teal-100/60">{head.reason}</span>
                  <span className="ml-auto text-xs text-teal-200/40">{fmtWhen(head.sessionAt)}</span>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {champion && <Lane row={champion} />}
                  {challengers.map((c) => (
                    <Lane key={c.id} row={c} />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
