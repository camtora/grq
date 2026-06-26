import Link from "next/link";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { money } from "@/lib/money";
import { etDateStr } from "@/agent/calendar";
import { getSession } from "@/lib/session";
import { MODELS, RACE } from "@/agent/policy";
import { modelLabel } from "@/lib/race/models";
import { loadBullRace, listRaces, BULL_COLORS } from "@/lib/race/bulls";
import BullChart from "@/components/bulls/BullChart";
import BullRow from "@/components/bulls/BullRow";
import NewRaceForm from "@/components/bulls/NewRaceForm";
import RaceControls from "@/components/bulls/RaceControls";

// Bull Races hub — each model runs its OWN paper account; members create/configure/reset races.
// A pure sandbox, fully isolated from the real fund. The always-on judgment bake-off is at /race.
export const dynamic = "force-dynamic";

export default async function BullsPage({ searchParams }: { searchParams: Promise<{ race?: string }> }) {
  const sp = await searchParams;
  const wantId = sp.race && /^\d+$/.test(sp.race) ? Number(sp.race) : undefined;
  const [session, races, data] = await Promise.all([getSession(), listRaces(), loadBullRace(wantId)]);
  const isMember = session?.role === "member";
  const roster = [MODELS.decision, ...RACE.challengers].map((m) => ({ model: m, label: modelLabel(m) }));

  return (
    <main>
      <PageHeader
        title="Bull Races"
        sub="Eight bulls, eight paper accounts. Each model manages its OWN cash, picks its OWN trades, lives with its OWN P&L — same market, separate books. Pick your bulls, set their dials, run a race."
        right={isMember ? <NewRaceForm roster={roster} /> : null}
      />

      {races.length === 0 || !data ? (
        <EmptyState title="No races yet" body={isMember ? "Spin one up with “New race” above." : "No races have been created yet."} />
      ) : (
        <>
          {races.length > 1 ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {races.map((r) => {
                const active = r.id === data.race.id;
                return (
                  <Link
                    key={r.id}
                    href={`/bulls?race=${r.id}`}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${active ? "border-teal-400/40 bg-teal-400/10 text-teal-100" : "border-teal-400/10 bg-teal-400/[0.03] text-teal-300/70 hover:bg-teal-400/10"}`}
                  >
                    {r.name}
                    <span className="ml-1.5 text-[10px] text-teal-200/40">{r.status === "RUNNING" ? "●" : r.status === "PAUSED" ? "❚❚" : "■"}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-teal-200/50">
              <span className="font-semibold text-teal-50">{data.race.name}</span>
              <span>{data.bulls.length} bulls</span>
              <span>{data.race.cadence} cadence</span>
              <span>{money(data.race.startingStakeCents)} stake each</span>
              <span className={data.race.status === "RUNNING" ? "text-emerald-300" : "text-amber-300"}>{data.race.status}</span>
              {data.race.startedAt ? <span>since {etDateStr(data.race.startedAt)}</span> : null}
            </div>
            {isMember ? <RaceControls raceId={data.race.id} status={data.race.status} /> : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-teal-200/50">Leaderboard</h2>
              <div className="space-y-2">
                {data.bulls.map((b, i) => (
                  <BullRow key={b.entrantId} b={b} rank={i + 1} color={BULL_COLORS[i % BULL_COLORS.length]} />
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-teal-200/50">Return over time</h2>
              <BullChart series={data.bulls.map((b, i) => ({ label: b.label, color: BULL_COLORS[i % BULL_COLORS.length], points: b.navHistory }))} />
            </div>
          </div>

          {data.realFund ? (
            <Card className="mt-4 p-3 text-xs text-teal-200/50">
              <span className="font-semibold text-teal-50">Reference — the real fund (Opus, live + tooled):</span>{" "}
              <span className={`tabular-nums ${data.realFund.returnPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {data.realFund.returnPct >= 0 ? "+" : ""}
                {data.realFund.returnPct.toFixed(2)}%
              </span>{" "}
              on {money(data.realFund.navCents)} NAV. Not directly comparable (different capital, timeframe, and it researches with tools) — shown for context only.
            </Card>
          ) : null}

          <details className="mt-4 rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-teal-200/50">How Bull Races work</summary>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-teal-100/70">
              <li>
                <span className="font-semibold text-teal-50">Own book, own rules.</span> Each bull starts with {money(data.race.startingStakeCents)} CAD and trades on its own — every BUY/SELL fills into <em>its</em> account at the live price (with commission). P&amp;L is real portfolio value, marked to the market.
              </li>
              <li>
                <span className="font-semibold text-teal-50">Level field.</span> Every bull runs seed-only / no-tools — even Opus — so this measures judgment, not who has the better research shovel. (The real Opus fund, which <em>does</em> use tools, is shown only as a reference above.)
              </li>
              <li>
                <span className="font-semibold text-teal-50">Risk dials bite.</span> Each bull trades under its dial (position cap, cash floor, weekly-buy cap); a call that breaks them is auto-rejected. A pure sandbox — it never touches the real fund.
              </li>
            </ul>
          </details>

          <p className="mt-4 text-xs text-teal-200/40">
            Hypothetical paper accounts — fills are simulated at the live (delayed ~15 min) mid with IBKR-style commission, no real money. US names fill in CAD at the live FX rate.
          </p>
        </>
      )}
    </main>
  );
}
