import Link from "next/link";
import { prisma } from "@/lib/db";
import type { JournalKind } from "@prisma/client";
import { fmtWhen } from "@/lib/money";
import { Card, PageHeader, Chip, EmptyState } from "@/components/ui";
import Md from "@/components/Md";

const KINDS = ["ALL", "SYSTEM", "RESEARCH", "DECISION", "TRADE", "RETRO", "LESSON"] as const;

export default async function Journal({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const sp = await searchParams;
  const kind = (sp.kind ?? "ALL").toUpperCase();
  const where =
    kind !== "ALL" && KINDS.includes(kind as (typeof KINDS)[number])
      ? { kind: kind as JournalKind }
      : {};

  const entries = await prisma.journalEntry.findMany({
    where,
    orderBy: { at: "desc" },
    take: 100,
  });

  return (
    <main>
      <PageHeader
        title="Journal"
        sub="The agent's working memory: every thesis, decision, retro, and lesson — including the decisions not to trade."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Link
            key={k}
            href={k === "ALL" ? "/journal" : `/journal?kind=${k}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              kind === k
                ? "bg-teal-400/20 text-teal-200"
                : "text-teal-200/50 hover:bg-teal-400/10"
            }`}
          >
            {k}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Entries of this kind appear once the agent starts thinking out loud (Phase 2)."
        />
      ) : (
        <div className="space-y-4">
          {entries.map((j) => (
            <Card key={j.id} className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Chip tone={j.kind === "TRADE" ? "green" : j.kind === "LESSON" ? "teal" : "dim"}>
                  {j.kind}
                </Chip>
                {j.symbol && <span className="font-semibold text-teal-50">{j.symbol}</span>}
                <span className="text-sm font-medium text-teal-50">{j.title}</span>
                <span className="ml-auto text-xs text-teal-200/40">
                  {fmtWhen(j.at)} · {j.agentVersion}
                  {j.confidence !== null ? ` · confidence ${j.confidence}%` : ""}
                </span>
              </div>
              <div className="mt-3">
                <Md text={j.body} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
