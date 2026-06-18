import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { startOfEtDay, etDateStr } from "@/agent/calendar";
import { Card, PageHeader, Chip, EmptyState } from "@/components/ui";
import Md from "@/components/Md";
import { Stats, parseStats } from "@/components/ReportStats";

export const dynamic = "force-dynamic";

// One day, the whole agent narrative: the morning game plan, every intraday update
// (check-ins + the midday brief, chronological), and the EOD close — each section
// collapsible (native <details>, SSR). Reached via "View report" from the Reports
// Daily tab + the Portfolio brief. Date is YYYY-MM-DD (ET). (Cam 2026-06-18)

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function etTime(d: Date): string {
  return d.toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" });
}

export default async function DayReport({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const anchor = new Date(`${date}T12:00:00Z`);
  const start = startOfEtDay(anchor);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const [plan, intraday, eod] = await Promise.all([
    prisma.journalEntry.findFirst({
      where: { kind: "RESEARCH", title: { startsWith: "Game plan" }, at: { gte: start, lt: end } },
      orderBy: { at: "desc" },
    }),
    prisma.journalEntry.findMany({
      where: {
        kind: "RESEARCH",
        at: { gte: start, lt: end },
        OR: [{ title: { startsWith: "Check-in" } }, { title: { startsWith: "Midday brief" } }],
      },
      orderBy: { at: "desc" }, // newest first — read the day backwards from the close
    }),
    prisma.report.findFirst({ where: { kind: "EOD", date: { gte: start, lt: end } } }),
  ]);

  const prev = etDateStr(new Date(start.getTime() - 12 * 60 * 60 * 1000));
  const next = etDateStr(new Date(end.getTime() + 12 * 60 * 60 * 1000));
  const nothing = !plan && intraday.length === 0 && !eod;

  return (
    <main>
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-xs text-teal-300 hover:underline">← all reports</Link>
        <span className="ml-auto flex items-center gap-3 text-xs">
          <Link href={`/reports/day/${prev}`} className="text-teal-300 hover:underline">← prev day</Link>
          <Link href={`/reports/day/${next}`} className="text-teal-300 hover:underline">next day →</Link>
        </span>
      </div>

      <PageHeader title={dayLabel(anchor)} sub="The agent's full day — morning plan, intraday updates, and the close." />

      {nothing ? (
        <EmptyState title="Nothing filed this day" body="No game plan, intraday check-ins, or close report for this date." />
      ) : (
        <div className="space-y-4">
          {/* Newest first: the close, then intraday updates backwards, then the morning plan. */}
          {/* The close — leads the day once it has actually closed; open by default. */}
          {eod && (
            <Card className="p-5">
              <details open className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                  <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">The close</h2>
                  <span className="text-xs tabular-nums text-teal-200/40">{etTime(eod.createdAt)} ET</span>
                  <span className="ml-auto text-xs text-teal-300/60 group-open:hidden">▸ show</span>
                  <span className="ml-auto hidden text-xs text-teal-300/40 group-open:inline">▾ hide</span>
                </summary>
                <div className="mt-3 border-t border-teal-400/10 pt-3">
                  <Stats stats={parseStats(eod.statsJson)} />
                  <Md text={eod.body} />
                </div>
              </details>
            </Card>
          )}

          {/* Intraday updates — newest first, each entry collapsed by default. */}
          <Card className="p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">
              Intraday updates {intraday.length > 0 && <span className="text-teal-200/40">· {intraday.length}</span>}
            </h2>
            {intraday.length === 0 ? (
              <p className="text-sm text-teal-200/40">No intraday updates filed.</p>
            ) : (
              <div className="space-y-2">
                {intraday.map((e) => (
                  <details key={e.id} className="group border-t border-teal-400/10 pt-2 first:border-t-0 first:pt-0">
                    <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                      <span className="shrink-0 text-xs tabular-nums text-teal-200/50">{etTime(e.at)} ET</span>
                      {e.title.startsWith("Midday brief") && <Chip tone="dim">brief</Chip>}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-teal-50">{e.title}</span>
                      <span className="shrink-0 text-xs text-teal-300/60 group-open:hidden">▸</span>
                      <span className="hidden shrink-0 text-xs text-teal-300/40 group-open:inline">▾</span>
                    </summary>
                    <div className="mt-2 border-t border-teal-400/5 pt-2">
                      <Md text={e.body} />
                    </div>
                  </details>
                ))}
              </div>
            )}
          </Card>

          {/* Morning plan — the day's anchor, at the bottom; open by default. */}
          <Card className="p-5">
            <details open className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Morning plan</h2>
                {plan && <span className="text-xs tabular-nums text-teal-200/40">{etTime(plan.at)} ET</span>}
                <span className="ml-auto text-xs text-teal-300/60 group-open:hidden">▸ show</span>
                <span className="ml-auto hidden text-xs text-teal-300/40 group-open:inline">▾ hide</span>
              </summary>
              <div className="mt-3 border-t border-teal-400/10 pt-3">
                {plan ? <Md text={plan.body} /> : <p className="text-sm text-teal-200/40">No game plan filed this day.</p>}
              </div>
            </details>
          </Card>
        </div>
      )}
    </main>
  );
}
