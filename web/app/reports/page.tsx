import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fmtWhen } from "@/lib/money";
import { etDateStr } from "@/agent/calendar";
import { Card, PageHeader, Chip, EmptyState } from "@/components/ui";
import CollapsibleMd from "@/components/CollapsibleMd";
import Md from "@/components/Md";
import { Stats, parseStats } from "@/components/ReportStats";
import PeopleBadges from "@/components/PeopleBadges";
import { PEOPLE } from "@/lib/people";

// Reports is a hub over every kind of report the fund files: the Daily (morning
// game plan beside the EOD close), the Saturday Weekly review, Smart-money
// roundups, Retros (source post-mortems), and Lessons. URL-param tabs keep it SSR.
const TABS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "smart", label: "Smart Money" },
  { key: "retros", label: "Retros" },
  { key: "lessons", label: "Lessons" },
  { key: "conviction", label: "Conviction" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// One-line plain-text preview of a markdown body, for the compact Daily cards.
function preview(body: string, n = 130): string {
  const t = body
    .replace(/[#*`_>]/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function EntryCard({
  j,
}: {
  j: { id: number; kind: string; symbol: string | null; title: string; body: string; at: Date; agentVersion: string; confidence: number | null };
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Chip tone={j.kind === "LESSON" ? "teal" : j.kind === "RETRO" ? "green" : "dim"}>{j.kind}</Chip>
        {j.symbol && <span className="font-semibold text-teal-50">{j.symbol}</span>}
        <span className="text-sm font-medium text-teal-50">{j.title}</span>
        <span className="ml-auto text-xs text-teal-200/40">
          {fmtWhen(j.at)} · {j.agentVersion}
          {j.confidence !== null ? ` · confidence ${j.confidence}%` : ""}
        </span>
      </div>
      <div className="mt-3">
        <CollapsibleMd text={j.body} threshold={600} />
      </div>
    </Card>
  );
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : "daily";

  const [eodCount, weeklyCount, smartCount, retroCount, lessonCount, convictionCount] = await Promise.all([
    prisma.report.count({ where: { kind: "EOD" } }),
    prisma.report.count({ where: { kind: "WEEKLY" } }),
    prisma.journalEntry.count({ where: { kind: "RESEARCH", title: { startsWith: "Smart money" } } }),
    prisma.journalEntry.count({ where: { kind: "RETRO" } }),
    prisma.journalEntry.count({ where: { kind: "LESSON" } }),
    prisma.tradeProposal.count({ where: { side: "BUY" } }),
  ]);
  const countByTab: Record<TabKey, number> = {
    daily: eodCount,
    weekly: weeklyCount,
    smart: smartCount,
    retros: retroCount,
    lessons: lessonCount,
    conviction: convictionCount,
  };

  let content: React.ReactNode;

  if (tab === "daily") {
    // Each day = morning game plan + EOD close + a count of intraday updates
    // (check-ins + midday brief). The full per-day timeline lives at /reports/day/<date>.
    const [eods, plans, intradayEntries] = await Promise.all([
      prisma.report.findMany({ where: { kind: "EOD" }, orderBy: { date: "desc" }, take: 40 }),
      prisma.journalEntry.findMany({
        where: { kind: "RESEARCH", title: { startsWith: "Game plan" } },
        orderBy: { at: "desc" },
        take: 40,
      }),
      prisma.journalEntry.findMany({
        where: { kind: "RESEARCH", OR: [{ title: { startsWith: "Check-in" } }, { title: { startsWith: "Midday brief" } }] },
        orderBy: { at: "desc" },
        take: 400,
        select: { at: true },
      }),
    ]);
    const intradayCountBy = new Map<string, number>();
    for (const e of intradayEntries) {
      const k = etDateStr(e.at);
      intradayCountBy.set(k, (intradayCountBy.get(k) ?? 0) + 1);
    }
    type Day = { date: Date; eod?: (typeof eods)[number]; plan?: (typeof plans)[number] };
    const days = new Map<string, Day>();
    for (const e of eods) days.set(etDateStr(e.date), { date: e.date, eod: e });
    for (const p of plans) {
      const k = etDateStr(p.at);
      const cur = days.get(k);
      if (cur) cur.plan = p;
      else days.set(k, { date: p.at, plan: p });
    }
    // Days that only logged intraday updates (no plan/close) still get a card.
    for (const k of intradayCountBy.keys()) {
      if (!days.has(k)) days.set(k, { date: new Date(`${k}T12:00:00Z`) });
    }
    const dailyList = [...days.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 30)
      .map(([, v]) => v);

    content =
      dailyList.length === 0 ? (
        <EmptyState
          title="No daily reports yet"
          body="Each market day pairs the morning game plan with the EOD close here — the first lands at ~9:00 and ~16:15 ET on the next market day."
        />
      ) : (
        <div className="space-y-3">
          {dailyList.map((d) => {
            const k = etDateStr(d.date);
            const n = intradayCountBy.get(k) ?? 0;
            return (
              <Card key={k} className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-teal-50">{dayLabel(d.date)}</span>
                  {n > 0 && <Chip tone="dim">{n} intraday update{n > 1 ? "s" : ""}</Chip>}
                  <Link
                    href={`/reports/day/${k}`}
                    className="ml-auto rounded-md border border-teal-400/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-teal-300 hover:bg-teal-400/10"
                  >
                    View report →
                  </Link>
                </div>
                <div className="mt-3 grid gap-x-6 gap-y-2 text-sm text-teal-100/55 lg:grid-cols-2">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-teal-200/40">Morning</span>{" "}
                    {d.plan ? preview(d.plan.body) : <span className="text-teal-200/30">no plan filed</span>}
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wider text-teal-200/40">Close</span>{" "}
                    {d.eod ? preview(d.eod.body) : <span className="text-teal-200/30">no close filed</span>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      );
  } else if (tab === "weekly") {
    const weeklies = await prisma.report.findMany({ where: { kind: "WEEKLY" }, orderBy: { date: "desc" }, take: 30 });
    content =
      weeklies.length === 0 ? (
        <EmptyState
          title="No weekly reviews yet"
          body="The Saturday deep review — what worked, the lessons, source grades, and the capital recommendation — lands once a full week is in the books."
        />
      ) : (
        <div className="space-y-4">
          {weeklies.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="mb-3 flex items-center gap-3">
                <Chip tone="teal">weekly</Chip>
                <span className="text-sm font-medium text-teal-50">{r.title}</span>
              </div>
              <Stats stats={parseStats(r.statsJson)} />
              <CollapsibleMd text={r.body} threshold={800} />
            </Card>
          ))}
        </div>
      );
  } else if (tab === "conviction") {
    const proposals = await prisma.tradeProposal.findMany({ orderBy: { at: "desc" }, take: 120 });
    const buys = proposals.filter((p) => p.side === "BUY");
    const withBoth = buys.filter((p) => p.tradeConfidence != null && p.dossierConfidence != null);
    const clearedGate = buys.filter((p) => (p.tradeConfidence ?? 0) >= 75).length;
    const filled = buys.filter((p) => p.accepted).length;
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
    const avgTrade = avg(withBoth.map((p) => p.tradeConfidence as number));
    const avgDossier = avg(withBoth.map((p) => p.dossierConfidence as number));
    const avgGap = avgTrade != null && avgDossier != null ? avgTrade - avgDossier : null;
    const summary: [string, string][] = [
      ["BUY proposals", String(buys.length)],
      ["cleared 75% gate", `${clearedGate}/${buys.length}`],
      ["actually traded", `${filled}/${buys.length}`],
      ["avg per-trade conf", avgTrade != null ? `${avgTrade}%` : "—"],
      ["avg dossier conf", avgDossier != null ? `${avgDossier}%` : "—"],
      ["avg gap (trade − dossier)", avgGap != null ? `${avgGap > 0 ? "+" : ""}${avgGap} pts` : "—"],
    ];
    content =
      proposals.length === 0 ? (
        <EmptyState
          title="No proposals logged yet"
          body="Every BUY/SELL the agent proposes — including the ones the 75% conviction gate rejects — lands here, with its per-trade confidence beside the standing dossier confidence. The tally starts from the next proposal."
        />
      ) : (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {summary.map(([k, v]) => (
                <span key={k}>
                  <span className="text-xs uppercase tracking-wider text-teal-200/40">{k}</span>{" "}
                  <span className="font-semibold tabular-nums text-teal-50">{v}</span>
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-teal-200/40">
              A persistently negative gap means the agent rates names highly in research but talks itself below the 75% bar at the
              trigger — the pattern we&apos;re watching for. Price at proposal is kept too, so we can retro whether waiting paid off.
            </p>
          </Card>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Side</th>
                  <th className="px-4 py-3 text-right">Trade conf</th>
                  <th className="px-4 py-3 text-right">Dossier</th>
                  <th className="px-4 py-3 text-right">Gap</th>
                  <th className="px-4 py-3">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => {
                  const gap =
                    p.tradeConfidence != null && p.dossierConfidence != null ? p.tradeConfidence - p.dossierConfidence : null;
                  const convictionBlocked = !p.accepted && (p.rejectReason ?? "").includes("Conviction gate");
                  return (
                    <tr key={p.id} className="border-t border-teal-400/10">
                      <td className="px-4 py-2.5 text-xs text-teal-200/50">{fmtWhen(p.at)}</td>
                      <td className="px-4 py-2.5 font-semibold text-teal-100">{p.symbol}</td>
                      <td className="px-4 py-2.5">
                        <Chip tone={p.side === "BUY" ? "green" : "dim"}>{p.side}</Chip>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-teal-50">
                        {p.tradeConfidence != null ? `${p.tradeConfidence}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-teal-200/60">
                        {p.dossierConfidence != null ? `${p.dossierConfidence}%${p.dossierStance ? ` · ${p.dossierStance}` : ""}` : "—"}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums ${gap == null ? "text-teal-200/30" : gap < 0 ? "text-red-400" : "text-emerald-400"}`}
                      >
                        {gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap}`}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {p.accepted ? (
                          <span className="text-emerald-400">{p.status}</span>
                        ) : (
                          <span className={convictionBlocked ? "text-amber-400" : "text-red-400/80"} title={p.rejectReason ?? ""}>
                            {convictionBlocked ? "below 75% gate" : "rejected"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      );
  } else {
    const where: Prisma.JournalEntryWhereInput =
      tab === "smart"
        ? { kind: "RESEARCH", title: { startsWith: "Smart money" } }
        : tab === "retros"
          ? { kind: "RETRO" }
          : { kind: "LESSON" };
    const entries = await prisma.journalEntry.findMany({ where, orderBy: { at: "desc" }, take: 50 });
    const empty =
      tab === "smart"
        ? { title: "No smart-money roundups yet", body: "The agent files a 'Smart money' roundup when 13F / institutional moves are worth flagging." }
        : tab === "retros"
          ? { title: "No retros yet", body: "After a thesis resolves the agent writes a post-mortem and grades the sources it cited — those grades build the scoreboard." }
          : { title: "No lessons yet", body: "Durable patterns the agent learns get filed as lessons and re-read before every decision. It has to earn them." };
    content =
      entries.length === 0 ? (
        <EmptyState title={empty.title} body={empty.body} />
      ) : (
        <div className="space-y-4">
          {entries.map((j) => (
            <EntryCard key={j.id} j={j} />
          ))}
        </div>
      );
  }

  return (
    <main>
      <PageHeader
        title="Reports"
        sub="Every report the fund files — the daily plan & close, the Saturday review, smart-money roundups, post-mortems, and lessons."
        right={
          <PeopleBadges
            people={PEOPLE.map((p) => ({
              key: p.key,
              name: p.name,
              fullName: p.fullName,
              title: p.title,
              photo: p.photo,
              bio: <Md text={p.bio} />,
            }))}
          />
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={t.key === "daily" ? "/reports" : `/reports?tab=${t.key}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                active ? "bg-teal-400/20 text-teal-200" : "text-teal-200/50 hover:bg-teal-400/10"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 tabular-nums ${active ? "text-teal-300/70" : "text-teal-200/30"}`}>{countByTab[t.key]}</span>
            </Link>
          );
        })}
      </div>

      {content}
    </main>
  );
}
