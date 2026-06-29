import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isOwner } from "@/lib/users";
import { getPortfolio } from "@/lib/portfolio";
import { usdCadRate } from "@/lib/fx";
import { PageHeader, Card, Chip } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import {
  DIALS,
  HARD,
  CHECKIN_TIMES_ET,
  OPERATING_COST_USD_CENTS_PER_MONTH,
  SELF_INVEST,
  MODELS,
} from "@/agent/policy";
import { PERSONA } from "@/agent/persona";
import { startOfEtDay, etDateStr } from "@/agent/calendar";
import Md from "@/components/Md";
import { CHANGELOG, type ChangeTag } from "@/lib/changelog";
import { getDecisions } from "@/lib/decisions";

const cad = (cents: number) => `C$${(cents / 100).toLocaleString("en-CA", { maximumFractionDigits: 0 })}`;

const TAG_TONE: Record<ChangeTag, "teal" | "green" | "dim"> = {
  Strategy: "green",
  Guardrail: "teal",
  Transparency: "dim",
  Operations: "dim",
};

// Plain-English operating manual for the owners (members only). The factual numbers are
// pulled LIVE from the same policy the agent obeys, so this page can never quietly drift
// out of sync with reality. Curated prose covers the philosophy + the changelog.
export default async function HowItWorks({ searchParams }: { searchParams: Promise<{ tab?: string; d?: string }> }) {
  const session = await getSession();
  // Admin-only: Cam & Graham (owners) only — viewers and non-owner members get a 404.
  if (!session || !isOwner(session.email)) notFound();
  const sp = await searchParams;
  const tab = sp.tab === "decisions" ? "decisions" : sp.tab === "daily-report" ? "daily-report" : "manual";

  const tabBar = (
    <div className="mb-6 flex gap-1 border-b border-teal-400/10">
      {[
        { key: "manual", label: "Manual", href: "/how-it-works" },
        { key: "daily-report", label: "Daily report", href: "/how-it-works?tab=daily-report" },
        { key: "decisions", label: "Decision log", href: "/how-it-works?tab=decisions" },
      ].map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
            tab === t.key ? "border-teal-400 text-teal-100" : "border-transparent text-teal-200/50 hover:text-teal-100"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );

  if (tab === "decisions") {
    const decisions = await getDecisions();
    return (
      <main>
        <Link href="/settings" className="text-xs text-teal-300 hover:underline">← settings</Link>
        <PageHeader title="How GRQ works" sub="The complete engineering decision record — every choice, with its rationale, newest first. This reads the live decision log, so new decisions appear here automatically." />
        {tabBar}
        {decisions.length === 0 ? (
          <Card className="p-6 text-sm text-teal-200/60">The decision log isn&apos;t available right now.</Card>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-teal-200/40">{decisions.length} decisions on record.</p>
            {decisions.map((d) => (
              <details key={d.n} className="rounded-xl border border-teal-400/10 bg-teal-400/[0.02] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-teal-50">
                  <span className="tabular-nums text-teal-300">D{d.n}</span> — {d.title}
                  {d.meta ? <span className="ml-2 text-xs font-normal text-teal-200/40">{d.meta}</span> : null}
                </summary>
                <div className="mt-3 border-t border-teal-400/10 pt-3 text-sm text-teal-100/80">
                  <Md text={d.body} />
                </div>
              </details>
            ))}
          </div>
        )}
      </main>
    );
  }

  if (tab === "daily-report") {
    // Day-changer mirrors the Today page (?d=YYYY-MM-DD). The newest diary covers the
    // 3am→3am window that just closed, so it's dated YESTERDAY — default to the most
    // recent one that exists, and don't let the reader walk into the future.
    const valid = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d);
    const latest = await prisma.report.findFirst({ where: { kind: "CHANGE" }, orderBy: { date: "desc" } });
    const latestStr = latest ? etDateStr(latest.date) : etDateStr(new Date(Date.now() - 86_400_000));
    const dateStr = valid ? sp.d! : latestStr;
    const anchor = new Date(`${dateStr}T12:00:00Z`);
    const start = startOfEtDay(anchor);
    const end = new Date(start.getTime() + 86_400_000);
    const report = await prisma.report.findFirst({ where: { kind: "CHANGE", date: { gte: start, lt: end } } });
    const prev = etDateStr(new Date(start.getTime() - 12 * 3_600_000));
    const next = etDateStr(new Date(end.getTime() + 12 * 3_600_000));
    const atLatest = dateStr >= latestStr;
    const dayLabel = new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
    });
    let commitCount: number | null = null;
    try { commitCount = report?.statsJson ? (JSON.parse(report.statsJson).commits ?? null) : null; } catch { /* ignore */ }

    return (
      <main>
        <Link href="/settings" className="text-xs text-teal-300 hover:underline">← settings</Link>
        <PageHeader
          title="How GRQ works"
          sub="The daily build diary — a plain-English rundown of what changed in the app each day, written automatically at 3am ET so the two of us stay on the same page."
        />
        {tabBar}
        <Card className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-teal-400/10 pb-3">
            <div>
              <div className="text-lg font-bold text-teal-50">{dayLabel}</div>
              {commitCount != null && (
                <div className="text-xs text-teal-200/40">{commitCount} change{commitCount === 1 ? "" : "s"} shipped</div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 text-sm">
              <Link href={`/how-it-works?tab=daily-report&d=${prev}`} className="rounded-lg border border-teal-400/20 px-3 py-1.5 text-teal-300 hover:bg-teal-400/10">
                ← {prev}
              </Link>
              {!atLatest && (
                <Link href="/how-it-works?tab=daily-report" className="rounded-lg border border-teal-400/20 px-3 py-1.5 text-teal-300 hover:bg-teal-400/10">
                  latest
                </Link>
              )}
              {!atLatest && (
                <Link href={`/how-it-works?tab=daily-report&d=${next}`} className="rounded-lg border border-teal-400/20 px-3 py-1.5 text-teal-300 hover:bg-teal-400/10">
                  {next} →
                </Link>
              )}
            </div>
          </div>
          {report ? (
            <div className="text-sm leading-relaxed text-teal-100/85">
              <Md text={report.body} />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-teal-200/50">
              {atLatest
                ? "No diary for this day yet — it's written automatically at 3am ET once the day's work is in."
                : "No diary for this day — either nothing was shipped, or it predates the build diary."}
            </p>
          )}
        </Card>
      </main>
    );
  }

  const [settings, pf, fx] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    getPortfolio(),
    usdCadRate(),
  ]);
  const riskLevel = settings?.riskLevel ?? "BALANCED";
  const dial = DIALS[riskLevel];
  const rate = fx ?? 1.42;
  const costCadYr = OPERATING_COST_USD_CENTS_PER_MONTH * 12 * rate;
  const hurdlePct = pf.navCents > 0 ? (costCadYr / pf.navCents) * 100 : 0;

  const dialRows: { k: string; v: string; gloss: string }[] = [
    { k: "Most in one stock", v: `${dial.maxPositionPct}% of the fund`, gloss: "No single position can grow past this share of the whole fund." },
    { k: "Cash band (each currency)", v: `${dial.cashFloorPct}%–${dial.cashCeilingPct}%`, gloss: "CAD and USD are kept separate. Below the floor it must hold dry powder; above the ceiling it must put money to work (a real stock, or a parked index ETF)." },
    { k: "Auto-sell (stop)", v: `${dial.stopPct}% below cost`, gloss: "If a holding falls this far below what we paid, it's sold automatically — no waiting." },
    { k: "Auto-take-profit", v: `${dial.takeProfitPct}% above cost`, gloss: "If a holding rises this far above cost, the gain is taken automatically." },
    { k: "New buys per week", v: `≤ ${dial.maxNewTradesPerWeek}`, gloss: "A ceiling on how many new positions it can open in a rolling 7 days." },
    { k: "Conviction bar", v: `≥ ${HARD.minBuyConfidence}%`, gloss: "It won't buy anything it isn't at least this confident in. This is the single biggest brake on activity." },
    { k: "Daily-loss pause", v: `${HARD.dailyLossPauseBps / 100}% in a day`, gloss: "If the fund drops this much in one day, it stops opening new positions for the rest of the day." },
    { k: "Drawdown auto-halt", v: `${HARD.drawdownKillBps / 100}% from the high`, gloss: "If the fund falls this far from its high-water mark, all trading halts automatically (the kill switch engages)." },
    { k: "Order pace", v: `${HARD.maxOrdersPerDay}/day · ${HARD.maxOrdersPerHour}/hour`, gloss: "Hard limits on how fast it can fire orders — no runaway trading." },
    { k: "Fee-worth-it test", v: `≥ ${HARD.feeEdgeMultiple}× costs`, gloss: "A trade's expected gain must clear at least this multiple of its round-trip commissions, or it's rejected." },
  ];

  const guardrails = [
    "Never shorts, never borrows on margin, never trades options. (Shorting is an off-by-default switch only a human can ever flip.)",
    "Either owner can flip the kill switch at any time — nothing trades while it's engaged.",
    "The agent only proposes orders; deterministic code approves or rejects every single one. It cannot change its own limits — only Cam & Graham can, by editing the code.",
    "Moving money between currencies (CAD↔USD) needs an owner's explicit approval — the agent can request it, never do it.",
    "No real money trades until the soak gate passes: at least 4 clean weeks total, of which 2+ on the live broker's paper account.",
    "Everything is whole shares and integer cents — no fractional-share or floating-point fuzziness, anywhere.",
  ];

  const rhythm = [
    { t: "~6:00 ET", d: "Pre-morning read — a quick scan of the overnight tape; refreshes research it'll want before the open." },
    { t: "9:00 ET", d: "Game plan — the day's hypothesis, written before the bell." },
    { t: `${CHECKIN_TIMES_ET.join(" · ")} ET`, d: "Hourly check-ins — each one rebuilds the plan from scratch, acts on what's live, and must surface new ideas." },
    { t: "12:30 ET", d: "Midday brief — a readable lunchtime summary (no trading decisions)." },
    { t: "16:15 ET", d: "End-of-day report — what happened, why, and tomorrow's watch list." },
    { t: "Saturday", d: "Weekly review — grades closed theses, bank lessons, and gives a contribute/hold/withdraw recommendation." },
  ];

  const learns = [
    "Every trade carries a falsifiable thesis at entry — a price target, a stop, a time horizon, and what would prove it wrong.",
    "At exit, it writes a retro: did the thesis play out, and was it right for the right reasons or just lucky?",
    "Durable patterns become lessons that are re-read before every future decision.",
    "It grades its information sources by hit-rate — the fund learns whose signals to trust.",
  ];

  return (
    <main>
      <Link href="/settings" className="text-xs text-teal-300 hover:underline">← settings</Link>
      <PageHeader
        title="How GRQ works"
        sub="The plain-English operating manual. The rules and numbers below are pulled live from the same code the agent obeys — so this page can't drift out of sync with reality."
      />

      {tabBar}

      <div className="space-y-8">
        {/* The bar */}
        <Card className="p-6">
          <div className="mb-2"><PanelHeader>The bar we're aiming at</PanelHeader></div>
          <p className="mt-3 text-teal-100/80">
            The goal is <strong className="text-teal-50">not</strong> simply to beat the TSX — anyone can roughly match the
            index with one click. The real bar is clearing the fund&apos;s own running costs: about{" "}
            <strong className="text-teal-50">US$490/month</strong> for its market-data and AI subscriptions. Until monthly
            P&amp;L clears that, the fund hasn&apos;t genuinely made money.
          </p>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-xl border border-teal-400/15 bg-teal-400/[0.04] p-4">
            <div>
              <div className="text-2xl font-bold tabular-nums text-teal-50">~{hurdlePct.toFixed(1)}%/yr</div>
              <div className="text-xs text-teal-200/50">cost hurdle at today&apos;s {cad(pf.navCents)} fund size</div>
            </div>
            <p className="max-w-md text-sm text-teal-200/60">
              Steep while the fund is small, and it shrinks as the fund grows. The fix is scale and patient compounding —
              never oversized risk to chase the number.
            </p>
          </div>
        </Card>

        {/* The money rules */}
        <Card className="p-6">
          <div className="mb-2"><PanelHeader>The money rules (the agent can never break these)</PanelHeader></div>
          <ul className="mt-3 space-y-2.5">
            {guardrails.map((g, i) => (
              <li key={i} className="flex gap-3 text-sm text-teal-100/80">
                <span className="mt-0.5 shrink-0 text-teal-400">◆</span>
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* The current dials */}
        <Card className="p-6">
          <div className="mb-2"><PanelHeader
            right={
              <span className="text-xs text-teal-200/50">
                Risk setting: <Chip tone="teal">{riskLevel}</Chip> · adjustable on{" "}
                <Link href="/settings" className="text-teal-300 hover:underline">Settings</Link>
              </span>
            }
          >The current dials</PanelHeader></div>
          <div className="mt-4 divide-y divide-teal-400/10">
            {dialRows.map((r) => (
              <div key={r.k} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                <div className="w-48 shrink-0 text-sm font-semibold text-teal-50">{r.k}</div>
                <div className="w-44 shrink-0 text-sm font-bold tabular-nums text-teal-200">{r.v}</div>
                <div className="text-sm text-teal-200/60">{r.gloss}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Daily rhythm */}
        <Card className="p-6">
          <div className="mb-2"><PanelHeader>The daily rhythm</PanelHeader></div>
          <div className="mt-4 space-y-3">
            {rhythm.map((r) => (
              <div key={r.t} className="flex flex-col gap-1 sm:flex-row sm:gap-4">
                <div className="w-40 shrink-0 text-sm font-bold tabular-nums text-teal-200">{r.t}</div>
                <div className="text-sm text-teal-200/70">{r.d}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* How it learns */}
        <Card className="p-6">
          <div className="mb-2"><PanelHeader>How it learns</PanelHeader></div>
          <ul className="mt-3 space-y-2.5">
            {learns.map((l, i) => (
              <li key={i} className="flex gap-3 text-sm text-teal-100/80">
                <span className="mt-0.5 shrink-0 text-teal-400">→</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Changelog */}
        <div>
          <div className="mb-3"><PanelHeader>What&apos;s changed</PanelHeader></div>
          <div className="space-y-4">
            {CHANGELOG.map((c, i) => (
              <Card key={i} className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Chip tone={TAG_TONE[c.tag]}>{c.tag}</Chip>
                  <span className="text-sm font-semibold text-teal-50">{c.title}</span>
                  <span className="ml-auto text-xs tabular-nums text-teal-200/40">{c.date}{c.dRef ? ` · ${c.dRef}` : ""}</span>
                </div>
                <p className="mt-3 text-sm text-teal-100/80"><span className="font-semibold text-teal-200/70">What:</span> {c.what}</p>
                <p className="mt-1.5 text-sm text-teal-200/60"><span className="font-semibold text-teal-200/70">Why:</span> {c.why}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Under the hood */}
        <Card className="p-6">
          <div className="mb-2"><PanelHeader>Under the hood</PanelHeader></div>
          <p className="mt-2 text-sm text-teal-200/50">
            The raw materials, for full transparency — exactly what the agent is told and the exact numbers it&apos;s bound by.
          </p>

          <details className="mt-4 rounded-xl border border-teal-400/10 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-teal-200">The agent&apos;s actual standing instructions</summary>
            <pre className="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg bg-teal-950/40 p-4 text-xs leading-relaxed text-teal-100/80">{PERSONA}</pre>
          </details>

          <details className="mt-3 rounded-xl border border-teal-400/10 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-teal-200">The exact rule numbers</summary>
            <pre className="mt-4 max-h-[28rem] overflow-auto whitespace-pre rounded-lg bg-teal-950/40 p-4 text-xs leading-relaxed text-teal-100/80">
{JSON.stringify({ dials: DIALS, hardLimits: HARD, selfInvest: SELF_INVEST, models: MODELS, operatingCostUsdCentsPerMonth: OPERATING_COST_USD_CENTS_PER_MONTH }, null, 2)}
            </pre>
          </details>
        </Card>
      </div>
    </main>
  );
}
