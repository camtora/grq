import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/ui";
import SessionMatrix from "@/components/race/SessionMatrix";
import StandingsStrip from "@/components/race/StandingsStrip";
import { loadDay } from "@/lib/race/standings";
import DateNav from "@/components/DateNav";

// One day's race: that day's session call-matrix + day standings, with Today-style back-in-time
// navigation. A "race" = a trading day (ET).
export const dynamic = "force-dynamic";

export default async function RaceDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ vs?: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const sp = await searchParams;

  const detail = await loadDay(date);

  // The compare is URL-driven: Opus (champion) is pinned left; `?vs=MODEL` picks the challenger on
  // the right (set by clicking a standings tile). Default to the top-ranked challenger.
  const champion = detail.standings.find((s) => s.role === "champion")?.model ?? detail.models[0] ?? "";
  const challengers = detail.standings.filter((s) => s.role !== "champion").map((s) => s.model);
  const selected = typeof sp.vs === "string" && challengers.includes(sp.vs) ? sp.vs : challengers[0] ?? "";

  return (
    <main>
      <Link href="/race" className="text-xs text-teal-300 hover:underline">
        ← the race
      </Link>

      <PageHeader
        title={`The Race — ${date}`}
        sub="Same frozen prompt, session by session. Click a model in the day standings to compare it head-to-head with ★ Opus below."
        right={<DateNav date={date} basePath="/race" mode="path" />}
      />

      {!detail.hasData ? (
        <EmptyState title="No races this day" body="No sessions ran on this date — try the previous day." />
      ) : (
        <>
          <StandingsStrip standings={detail.standings} date={date} selected={selected} />
          <div className="mt-6">
            <SessionMatrix sessions={detail.sessions} champion={champion} selected={selected} standings={detail.standings} />
          </div>
        </>
      )}
    </main>
  );
}
