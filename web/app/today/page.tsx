import Link from "next/link";
import { prisma } from "@/lib/db";
import { startOfEtDay, etDateStr } from "@/agent/calendar";
import { fmtWhen } from "@/lib/money";
import { Card, PageHeader, Chip } from "@/components/ui";
import CollapsibleMd from "@/components/CollapsibleMd";

function Sources({ sourcesJson }: { sourcesJson: string | null }) {
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

export default async function Today({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const sp = await searchParams;
  const valid = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d);
  const anchor = valid ? new Date(`${sp.d}T12:00:00Z`) : new Date();
  const start = startOfEtDay(anchor);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const dateStr = etDateStr(anchor);
  const todayStr = etDateStr();
  const isToday = dateStr === todayStr;
  const prev = etDateStr(new Date(start.getTime() - 12 * 60 * 60 * 1000));
  const next = etDateStr(new Date(end.getTime() + 12 * 60 * 60 * 1000));
  const dayLabel = anchor.toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const [plan, eod, weekly, entries] = await Promise.all([
    prisma.journalEntry.findFirst({
      where: { kind: "RESEARCH", title: { startsWith: "Game plan" }, at: { gte: start, lt: end } },
    }),
    prisma.report.findFirst({ where: { kind: "EOD", date: { gte: start, lt: end } } }),
    prisma.report.findFirst({ where: { kind: "WEEKLY", date: { gte: start, lt: end } } }),
    prisma.journalEntry.findMany({ where: { at: { gte: start, lt: end } }, orderBy: { at: "asc" } }),
  ]);
  const timeline = entries.filter((e) => e.id !== plan?.id);

  let eodStats: Record<string, string | number> | null = null;
  if (eod?.statsJson) {
    try {
      eodStats = JSON.parse(eod.statsJson);
    } catch {
      eodStats = null;
    }
  }

  return (
    <main>
      <PageHeader
        title={isToday ? `Today — ${dayLabel}` : dayLabel}
        sub="The day's bookends: the plan the agent woke up with, and the report it went home with."
        right={
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/today?d=${prev}`} className="rounded-lg border border-teal-400/20 px-3 py-1.5 text-teal-300 hover:bg-teal-400/10">
              ← {prev}
            </Link>
            {!isToday && (
              <Link href="/today" className="rounded-lg border border-teal-400/20 px-3 py-1.5 text-teal-300 hover:bg-teal-400/10">
                today
              </Link>
            )}
            {dateStr < todayStr && (
              <Link href={`/today?d=${next}`} className="rounded-lg border border-teal-400/20 px-3 py-1.5 text-teal-300 hover:bg-teal-400/10">
                {next} →
              </Link>
            )}
          </div>
        }
      />

      {weekly && (
        <Card className="mb-6 border-teal-400/30 p-5">
          <div className="mb-2 flex items-center gap-3">
            <Chip tone="teal">weekly review</Chip>
            <span className="font-medium text-teal-50">{weekly.title}</span>
          </div>
          <CollapsibleMd text={weekly.body} threshold={1200} />
        </Card>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-3">
            <Chip tone="teal">morning plan</Chip>
            {plan && <span className="ml-auto text-xs text-teal-200/40">{fmtWhen(plan.at)}</span>}
          </div>
          {plan ? (
            <>
              <CollapsibleMd text={plan.body} threshold={2000}>
                <Sources sourcesJson={plan.sourcesJson} />
              </CollapsibleMd>
            </>
          ) : (
            <p className="text-sm text-teal-200/40">
              {isToday
                ? "Lands around 9:00 ET on market days."
                : "No game plan this day (weekend, holiday, or pre-agent era)."}
            </p>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-3">
            <Chip tone="dim">evening report</Chip>
            {eod && <span className="ml-auto text-xs text-teal-200/40">{eod.title}</span>}
          </div>
          {eodStats && (
            <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-teal-200/60">
              {Object.entries(eodStats).map(([k, v]) => (
                <span key={k}>
                  <span className="uppercase tracking-wider text-teal-200/40">{k.replace(/_/g, " ")}</span>{" "}
                  <span className="tabular-nums text-teal-50">{String(v)}</span>
                </span>
              ))}
            </div>
          )}
          {eod ? (
            <CollapsibleMd text={eod.body} threshold={2000} />
          ) : (
            <p className="text-sm text-teal-200/40">
              {isToday ? "Lands around 16:15 ET on market days." : "No report this day."}
            </p>
          )}
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-teal-200/50">
          The day as it happened ({timeline.length})
        </h2>
        {timeline.length === 0 ? (
          <Card className="p-6 text-sm text-teal-200/40">Nothing journaled this day.</Card>
        ) : (
          <div className="space-y-3">
            {timeline.map((j) => (
              <Card key={j.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs tabular-nums text-teal-200/40">{fmtWhen(j.at)}</span>
                  <Chip tone={j.kind === "TRADE" ? "green" : j.kind === "SYSTEM" ? "dim" : "teal"}>{j.kind}</Chip>
                  {j.symbol && (
                    <Link href={`/stocks/${j.symbol}`} className="font-semibold text-teal-300 hover:underline">
                      {j.symbol}
                    </Link>
                  )}
                  <span className="text-sm font-medium text-teal-50">{j.title}</span>
                </div>
                <div className="mt-2">
                  <CollapsibleMd text={j.body} threshold={300}>
                    <Sources sourcesJson={j.sourcesJson} />
                  </CollapsibleMd>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
