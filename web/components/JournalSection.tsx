import Link from "next/link";
import { prisma } from "@/lib/db";
import type { JournalKind } from "@prisma/client";
import { fmtWhen } from "@/lib/money";
import { Card, Chip, EmptyState } from "@/components/ui";
import CollapsibleMd from "@/components/CollapsibleMd";
import Scoreboard from "@/components/Scoreboard";
import ActivityFeed from "@/components/ActivityFeed";
import { getScoreboard } from "@/lib/scoreboard";

const KINDS = ["ALL", "SYSTEM", "RESEARCH", "DECISION", "TRADE", "RETRO", "LESSON"] as const;

// The body of the standalone /journal page (Cam 2026-06-25). Filter chips deep-link
// to /journal?kind=X. The page header above it supplies the title + description.
export default async function JournalSection({ kind: kindParam }: { kind?: string }) {
  const kind = (kindParam ?? "ALL").toUpperCase();
  const where =
    kind !== "ALL" && KINDS.includes(kind as (typeof KINDS)[number])
      ? { kind: kind as JournalKind }
      : {};

  const [entries, scoreboard] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      orderBy: { at: "desc" },
      take: 100,
    }),
    getScoreboard().catch(() => []),
  ]);

  return (
    <section>
      <div className="mb-6">
        <Scoreboard rows={scoreboard} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Link
            key={k}
            href={k === "ALL" ? "/journal" : `/journal?kind=${k}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              kind === k ? "bg-teal-400/20 text-teal-200" : "text-teal-200/50 hover:bg-teal-400/10"
            }`}
          >
            {k}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Entries of this kind appear once the agent has something to say — it journals research, decisions, trades, retros, and lessons as they happen."
        />
      ) : (
        <div className="space-y-4">
          {entries.map((j) => (
            <Card key={j.id} className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Chip tone={j.kind === "TRADE" ? "green" : j.kind === "LESSON" ? "teal" : "dim"}>{j.kind}</Chip>
                {j.symbol && <span className="font-semibold text-teal-50">{j.symbol}</span>}
                <span className="text-sm font-medium text-teal-50">{j.title}</span>
                <span className="ml-auto text-xs text-teal-200/40">
                  {fmtWhen(j.at)} · {j.agentVersion}
                  {j.confidence !== null ? ` · confidence ${j.confidence}%` : ""}
                </span>
              </div>
              <div className="mt-3">
                <CollapsibleMd text={j.body} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <details className="mt-10 border-t border-teal-400/10 pt-6">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wider text-teal-200/50">
          Order ledger — every fill, resting limit, and rejection
        </summary>
        <div className="mt-4">
          <ActivityFeed limit={100} />
        </div>
      </details>
    </section>
  );
}
