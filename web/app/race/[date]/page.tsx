import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/ui";
import SessionMatrix from "@/components/race/SessionMatrix";
import StandingsStrip from "@/components/race/StandingsStrip";
import { loadDay } from "@/lib/race/standings";
import { startOfEtDay, etDateStr } from "@/agent/calendar";

// One day's race: that day's session call-matrix + day standings, with Today-style back-in-time
// navigation. A "race" = a trading day (ET).
export const dynamic = "force-dynamic";

export default async function RaceDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const detail = await loadDay(date);

  // Date nav (mirrors the Today page) — ET day boundaries, DST-aware.
  const anchor = new Date(`${date}T12:00:00Z`);
  const start = startOfEtDay(anchor);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const todayStr = etDateStr();
  const isToday = date === todayStr;
  const prev = etDateStr(new Date(start.getTime() - 12 * 60 * 60 * 1000));
  const next = etDateStr(new Date(end.getTime() + 12 * 60 * 60 * 1000));

  return (
    <main>
      <Link href="/race" className="text-xs text-teal-300 hover:underline">
        ← the race
      </Link>

      <PageHeader
        title={`The Race — ${date}`}
        sub="Every mind's call on the same frozen prompt, session by session. Click a cell to read its full reasoning."
        right={
          <div className="flex items-center gap-3 text-xs">
            <Link href={`/race/${prev}`} className="text-teal-300 hover:underline">
              ← {prev}
            </Link>
            {!isToday && (
              <Link href={`/race/${todayStr}`} className="text-teal-200/50 hover:underline">
                today
              </Link>
            )}
            {date < todayStr && (
              <Link href={`/race/${next}`} className="text-teal-300 hover:underline">
                {next} →
              </Link>
            )}
          </div>
        }
      />

      {!detail.hasData ? (
        <EmptyState title="No races this day" body="No sessions ran on this date — try the previous day." />
      ) : (
        <>
          <StandingsStrip standings={detail.standings} />
          <div className="mt-6">
            <SessionMatrix sessions={detail.sessions} models={detail.models} />
          </div>
        </>
      )}
    </main>
  );
}
