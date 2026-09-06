import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession, seesBook } from "@/lib/session";
import { fmtWhen } from "@/lib/money";
import { PageHeader, Card, Chip } from "@/components/ui";
import ChessBar from "@/components/chess/ChessBar";
import ChessStatus from "@/components/chess/ChessStatus";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "green" | "teal" | "red" | "dim"> = { READY: "green", PENDING: "teal", RUNNING: "teal", FAILED: "red" };
const STATUS_LABEL: Record<string, string> = { READY: "ready", PENDING: "queued", RUNNING: "mapping…", FAILED: "no board" };

// First readable line of an agent markdown block, stripped of bullets/markup — the one-line gist.
const firstLine = (s: string | null): string | null =>
  s ? ((s.split("\n").find((l) => l.trim()) ?? "").replace(/^[-*]\s*/, "").replace(/[*_`#>]/g, "").trim() || null) : null;

// Chess Moves (docs/CHESS-MOVES.md, D94) — thematic / supply-chain second-order reasoning. A member
// briefs an industry or chain; Alfred names the force in motion and traces who wins vs who loses,
// 2–3 ripples deep. Leads, never verdicts — every play still clears research → the §6 gate to trade.
export default async function ChessPage() {
  const session = await getSession();
  const isMember = session?.role === "member";
  const book = seesBook(session); // Alfred's takes + members' briefs are prose — members'/viewers' only (D122)

  const themes = await prisma.chessTheme.findMany({
    where: { status: { not: "RETIRED" } },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      _count: { select: { plays: true } },
      plays: { orderBy: { rank: "asc" }, take: 16, select: { symbol: true, direction: true } },
    },
  });

  const latestReadyAt = themes.find((t) => t.status === "READY")?.completedAt?.toISOString() ?? null;
  const pending = themes.some((t) => t.status === "PENDING" || t.status === "RUNNING");

  return (
    <main>
      <PageHeader
        title="Chess Moves"
        sub="Name an industry or a chain of companies. Alfred spots the force already in motion, then traces who wins and who loses two to three moves out — the second-order plays, before the market reprices them."
      />

      {/* What is this — Graham's "what am I looking at?" answered up front. */}
      <Card className="mb-5 border-teal-400/15 bg-teal-400/[0.02] p-5">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
          {[
            { n: 1, t: "Pick a board", d: "A “board” is one industry or a chain of related companies — e.g. “apparel & tariffs” or “the uranium squeeze.” Brief it in plain English, or Alfred picks a timely one each week." },
            { n: 2, t: "Alfred maps it", d: "He names the force already in motion, draws the value chain, and tags every company a winner (▲) or loser (▼) by how many ripples out it sits." },
            { n: 3, t: "Follow the leads", d: "Each name is a lead, not a buy — a hunch about who moves next. Open one to research it; only then can it ever clear the fund’s gate." },
          ].map((s) => (
            <div key={s.n} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-400/15 text-xs font-bold text-teal-200">{s.n}</span>
              <div>
                <div className="text-sm font-semibold text-teal-50">{s.t}</div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-teal-200/55">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-teal-400/10 pt-3 text-xs text-teal-200/45">
          <span className="font-semibold text-teal-200/70">The point:</span> spot the second-order winners and losers before the market does. It&apos;s Alfred&apos;s
          reasoning, not a data feed — treat every play as a probabilistic bet, never a fact.
        </p>
      </Card>

      {isMember && <ChessBar />}

      <ChessStatus pending={pending} latestReadyAt={latestReadyAt}>
        {themes.length > 0 ? (
          <div className="space-y-3">
            {themes.map((t) => {
              const ready = t.status === "READY";
              const winners = t.plays.filter((p) => p.direction === "BENEFICIARY");
              const losers = t.plays.filter((p) => p.direction === "VICTIM");
              const take = book ? (firstLine(t.bottomLine) ?? firstLine(t.thesis)) : null;
              const dirClass = (d: string) =>
                d === "BENEFICIARY" ? "bg-emerald-400/10 text-emerald-300/90" : d === "VICTIM" ? "bg-red-400/10 text-red-300/90" : "bg-teal-400/10 text-teal-200/70";

              const inner = (
                <Card className={`p-5 transition-colors ${ready ? "hover:border-teal-400/30 hover:bg-teal-400/[0.04]" : ""}`}>
                  {/* Title + status + what kind of board */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-teal-50">{t.title}</span>
                        <Chip tone={STATUS_TONE[t.status] ?? "dim"}>{STATUS_LABEL[t.status] ?? t.status.toLowerCase()}</Chip>
                        {t.kind === "WEEKLY" && <Chip tone="dim">board of the week</Chip>}
                      </div>
                      {/* The subject — what this board is actually about (the anchor). */}
                      {t.anchor && <p className="mt-1 max-w-3xl text-[13px] leading-snug text-teal-100/75">{t.anchor}</p>}
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-teal-200/40">
                      <div>{t.requestedBy ?? "Alfred"}</div>
                      <div>{fmtWhen(t.createdAt)}</div>
                    </div>
                  </div>

                  {/* The take — the plain-English punchline. */}
                  {ready && take && <p className="mt-2.5 max-w-3xl text-[13px] italic leading-snug text-teal-200/55">“{take}”</p>}

                  {/* Winners vs losers + the pieces, coloured by side. */}
                  {ready && t._count.plays > 0 && (
                    <div className="mt-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {winners.length > 0 && <span className="text-emerald-300/90">▲ {winners.length} winner{winners.length > 1 ? "s" : ""}</span>}
                        {losers.length > 0 && <span className="text-red-300/90">▼ {losers.length} loser{losers.length > 1 ? "s" : ""}</span>}
                        <span className="text-teal-200/40">· {t._count.plays} ripple play{t._count.plays > 1 ? "s" : ""}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {t.plays.slice(0, 10).map((p) => (
                          <span key={p.symbol} className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-medium ${dirClass(p.direction)}`}>
                            {p.direction === "BENEFICIARY" ? "▲" : p.direction === "VICTIM" ? "▼" : "·"} {p.symbol}
                          </span>
                        ))}
                        {t._count.plays > Math.min(10, t.plays.length) && (
                          <span className="text-[11px] text-teal-200/40">+{t._count.plays - Math.min(10, t.plays.length)} more</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* The prompt that produced it + the open CTA. */}
                  <div className="mt-3.5 flex items-center justify-between border-t border-teal-400/10 pt-2.5 text-[11px] text-teal-200/40">
                    <span className="min-w-0 truncate">
                      {t.brief ? (book ? <>briefed: <span className="italic text-teal-200/55">“{t.brief}”</span></> : "a member’s brief") : "Alfred’s weekly self-pick"}
                    </span>
                    {ready ? (
                      <span className="shrink-0 font-semibold text-teal-300">Open board →</span>
                    ) : (
                      <span className="shrink-0 text-teal-200/40">{STATUS_LABEL[t.status] === "mapping…" ? "mapping the board…" : STATUS_LABEL[t.status]}</span>
                    )}
                  </div>
                </Card>
              );
              return ready ? (
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
