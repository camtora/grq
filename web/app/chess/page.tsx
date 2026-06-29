import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { fmtWhen } from "@/lib/money";
import { PageHeader, Card, Chip } from "@/components/ui";
import ChessBar from "@/components/chess/ChessBar";
import ChessStatus from "@/components/chess/ChessStatus";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "green" | "teal" | "red" | "dim"> = {
  READY: "green",
  PENDING: "teal",
  RUNNING: "teal",
  FAILED: "red",
};

const STATUS_LABEL: Record<string, string> = {
  READY: "ready",
  PENDING: "queued",
  RUNNING: "mapping…",
  FAILED: "no board",
};

// Chess Moves (docs/CHESS-MOVES.md) — the thematic / supply-chain reasoning experiment.
// A member briefs a theme/chain; Alfred maps the board and the ripple-effect plays. Plus
// a weekly self-picked "board of the week". Leads, never verdicts — every play still
// clears the normal research → §6 gate before anything trades.
export default async function ChessPage() {
  const session = await getSession();
  const isMember = session?.role === "member";

  const themes = await prisma.chessTheme.findMany({
    where: { status: { not: "RETIRED" } },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { _count: { select: { plays: true } }, plays: { orderBy: { rank: "asc" }, take: 6, select: { symbol: true } } },
  });

  const latestReadyAt = themes.find((t) => t.status === "READY")?.completedAt?.toISOString() ?? null;
  const pending = themes.some((t) => t.status === "PENDING" || t.status === "RUNNING");

  return (
    <main>
      <PageHeader
        title="Chess Moves"
        sub="Pick a board — an industry or a supply chain — and Alfred groks how the pieces connect, names the force in motion, and traces the ripple-effect plays before the market reprices them. An experiment in second-order thinking. Leads, not verdicts."
      />

      {isMember && <ChessBar />}

      <ChessStatus pending={pending} latestReadyAt={latestReadyAt}>
        {themes.length > 0 ? (
          <div className="space-y-3">
            {themes.map((t) => {
              const tone = STATUS_TONE[t.status] ?? "dim";
              const inner = (
                <Card className="p-5 transition-colors hover:bg-teal-400/[0.04]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-teal-50">{t.title}</span>
                        <Chip tone={tone}>{STATUS_LABEL[t.status] ?? t.status.toLowerCase()}</Chip>
                        {t.kind === "WEEKLY" && <Chip tone="dim">board of the week</Chip>}
                      </div>
                      {t.bottomLine ? (
                        <p className="mt-1 max-w-2xl text-sm text-teal-200/55">
                          {(t.bottomLine.split("\n").find((l) => l.trim()) ?? "").replace(/^[-*]\s*/, "").replace(/[*_`]/g, "")}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-teal-200/45">{t.anchor || "—"}</p>
                      )}
                      {t._count.plays > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {t.plays.map((p) => (
                            <span key={p.symbol} className="rounded bg-teal-400/10 px-1.5 py-0.5 font-mono text-[11px] text-teal-200/80">
                              {p.symbol}
                            </span>
                          ))}
                          {t._count.plays > t.plays.length && <span className="text-[11px] text-teal-200/40">+{t._count.plays - t.plays.length} more</span>}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-teal-200/40">
                      <div>{t.requestedBy ?? "Alfred"}</div>
                      <div>{fmtWhen(t.createdAt)}</div>
                    </div>
                  </div>
                </Card>
              );
              return t.status === "READY" ? (
                <Link key={t.id} href={`/chess/${t.id}`} className="block">
                  {inner}
                </Link>
              ) : (
                <div key={t.id}>{inner}</div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] px-5 py-8 text-center text-sm text-teal-200/50">
            No boards yet.{" "}
            {isMember ? "Name a theme or chain above and Alfred will map it." : "Check back soon — Alfred maps a fresh board each week."}
          </p>
        )}
      </ChessStatus>

      <p className="mt-6 text-xs text-teal-200/40">
        The chain is Alfred&apos;s web-researched reasoning, not imported data — there&apos;s no supply-chain feed. Treat every play as a
        probabilistic ripple bet, never a fact. Nothing here trades: a play becomes tradeable only after a full dossier clears the same guardrails as everything else.
      </p>
    </main>
  );
}
