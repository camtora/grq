import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/ui";
import ModelTile from "@/components/race/ModelTile";
import { loadStandings } from "@/lib/race/standings";
import { etDateStr } from "@/agent/calendar";

// The Race (D68) — the model bake-off. Every decision/report session, the live agent (the CHAMPION,
// Opus, the only model that trades) and the shadow CHALLENGERS get the EXACT same frozen prompt; the
// challengers only say what they WOULD do (no tools, never touch the §6 gate). This overview ranks
// every mind on its calls, marked to the live price. Each day links to that day's call matrix.
export const dynamic = "force-dynamic";

export default async function RacePage() {
  const { models, fxUsdCad } = await loadStandings();
  const today = etDateStr();

  return (
    <main>
      <PageHeader
        title="The Race"
        sub="Same data, different minds. Each session every model gets the EXACT same frozen prompt — only Opus trades, the rest call it shadow-only. Every BUY/SELL is snapshotted and marked to the live price. Who'd be ahead?"
        right={
          <Link href={`/race/${today}`} className="rounded-lg border border-teal-400/20 bg-teal-400/5 px-2.5 py-1 text-xs font-semibold text-teal-300 hover:bg-teal-400/10">
            Today&apos;s Race →
          </Link>
        }
      />

      {models.length === 0 ? (
        <EmptyState
          title="No races yet"
          body="The next morning plan, intraday check-in, and EOD report will each run the challengers on the same data and land here. First entries appear on the next market session."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {models.map((s, i) => (
              <ModelTile key={s.model} s={s} rank={i + 1} today={today} />
            ))}
          </div>
          <details className="mt-4 rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-teal-200/50">How The Race works</summary>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-teal-100/70">
              <li>
                <span className="font-semibold text-teal-50">Same data, every mind.</span> At each session — the morning plan, the
                hourly check-ins, the EOD — every model gets the EXACT same frozen prompt. Only Opus (the champion) actually trades;
                the rest are shadow-only and never touch the trade gate.
              </li>
              <li>
                <span className="font-semibold text-teal-50">A “call” is a decision to act now</span> — buy / sell / hold /
                stand-down — not a conditional “I’d buy if X happens.” The champion’s call is the order it actually places (whether or
                not the gate lets it through), so it’s measured the same way as a shadow that can never reach the gate.
              </li>
              <li>
                <span className="font-semibold text-teal-50">Every session re-asks “what now?”</span> A model that still wants a name
                re-calls it each check-in, and <span className="font-semibold text-teal-50">every call is scored on its own</span>: its
                price is snapshotted the moment it’s made and marked to the live price. So the same ticker can appear several times —
                that’s repeated conviction, counted each time, not one position.
              </li>
              <li>
                <span className="font-semibold text-teal-50">Not a perfectly level field — and we say so.</span> Every model gets the
                same frozen snapshot, but only the champion (Opus) can use <span className="font-semibold text-teal-50">tools</span>{" "}
                mid-session — web search, full dossier reads, fresh quotes. The shadows answer from the snapshot alone, one shot. So
                the race compares <em>judgment on the same seed</em>; the champion also gets to dig deeper.
              </li>
              <li>
                <span className="font-semibold text-teal-50">Hypothetical, and honest about it.</span> No lane faces a real fill,
                slippage, or commission — even the champion’s here is its <em>proposal</em>, not its executed trade (its real fund
                P&amp;L lives on the dashboard). A SELL is scored directionally (as if shorted / the move sidestepped); hold and
                stand-down don’t score. P&amp;L is shown in CAD{fxUsdCad ? `, USD calls converted at ~${fxUsdCad.toFixed(2)} CAD/USD` : ""}.
              </li>
            </ul>
          </details>
        </>
      )}
    </main>
  );
}
