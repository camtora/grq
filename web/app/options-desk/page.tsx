import Link from "next/link";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { money } from "@/lib/money";
import { etDateStr } from "@/agent/calendar";
import { getSession } from "@/lib/session";
import { loadDesk, listDesks, ARM_COLORS } from "@/lib/options-desk/desk";
import BullChart from "@/components/bulls/BullChart";
import PanelHeader from "@/components/PanelHeader";
import DeskRow from "@/components/desk/DeskRow";
import DeskControls from "@/components/desk/DeskControls";
import NewDeskForm from "@/components/desk/NewDeskForm";

// The Options Desk — a sandbox A/B: a CONTROL (Opus, stock-only) vs a TREATMENT (Opus + the power to
// BUY calls/puts). Pure sandbox, fully isolated from the real fund. Also a literacy surface: every
// option the treatment opens is explained in plain English. docs/THE-OPTIONS-DESK.md.
export const dynamic = "force-dynamic";

export default async function OptionsDeskPage({ searchParams }: { searchParams: Promise<{ desk?: string }> }) {
  const sp = await searchParams;
  const wantId = sp.desk && /^\d+$/.test(sp.desk) ? Number(sp.desk) : undefined;
  const [session, desks, data] = await Promise.all([getSession(), listDesks(), loadDesk(wantId)]);
  const isMember = session?.role === "member";

  return (
    <main>
      <PageHeader
        title="The Options Desk"
        sub="Same money, same menu, one difference: one Opus can only buy and sell stocks (exactly what the fund does today); the other can ALSO buy call and put options. Which one compounds better? A pure sandbox — and a place to learn how options actually work, on real names."
        right={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {/* The options learning portal, folded in here (Cam 2026-07-01): its four pages as
                buttons in the header. Open to everyone — viewers can learn/play. */}
            {[
              { href: "/options?tab=learn", label: "Learn" },
              { href: "/options?tab=calculator", label: "Calculator" },
              { href: "/options?tab=experiment", label: "Experiment" },
              { href: "/options?tab=ask", label: "Ask" },
            ].map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="rounded-lg border border-teal-400/15 bg-teal-400/[0.03] px-2.5 py-1 text-xs font-semibold text-teal-300/80 transition-colors hover:bg-teal-400/10 hover:text-teal-100"
              >
                {p.label}
              </Link>
            ))}
            {isMember ? <NewDeskForm /> : null}
          </div>
        }
      />

      {!data || data.arms.length === 0 ? (
        <EmptyState title="No desk yet" body={isMember ? "Spin one up with “New desk” above." : "No desks have been created yet."} />
      ) : (
        <>
          {desks.length > 1 ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {desks.map((d) => {
                const active = d.id === data.desk.id;
                return (
                  <Link
                    key={d.id}
                    href={`/options-desk?desk=${d.id}`}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${active ? "border-teal-400/40 bg-teal-400/10 text-teal-100" : "border-teal-400/10 bg-teal-400/[0.03] text-teal-300/70 hover:bg-teal-400/10"}`}
                  >
                    {d.name}
                    <span className="ml-1.5 text-[10px] text-teal-200/40">{d.status === "RUNNING" ? "●" : d.status === "PAUSED" ? "❚❚" : "■"}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-teal-200/50">
              <span className="font-semibold text-teal-50">{data.desk.name}</span>
              <span>{data.arms.length} arms</span>
              <span>{data.desk.cadence} cadence</span>
              <span>{money(data.desk.startingStakeCents)} stake each</span>
              <span className={data.desk.status === "RUNNING" ? "text-emerald-300" : "text-amber-300"}>{data.desk.status}</span>
              {data.desk.startedAt ? <span>since {etDateStr(data.desk.startedAt)}</span> : null}
            </div>
            {isMember ? <DeskControls deskId={data.desk.id} status={data.desk.status} /> : null}
          </div>

          {/* Graph along the top (full width), the two model arms side-by-side beneath it so
              they're easy to compare position-for-position (Cam 2026-06-30). */}
          <div className="mb-4">
            <div className="mb-2"><PanelHeader>Return over time</PanelHeader></div>
            {/* Full page width, held to a compact height (Cam 2026-07-01): a WIDE viewBox (width=1400)
                keeps the rendered strip short and the axis text normal-sized even full-bleed on the
                1700px layout — the flatter aspect is what stops the old height/text blowup. */}
            <BullChart width={1400} height={200} series={data.arms.map((a) => ({ label: a.label, color: ARM_COLORS[a.arm] ?? "var(--spark-up)", points: a.navHistory }))} />
          </div>
          <div>
            <div className="mb-2"><PanelHeader>The two arms</PanelHeader></div>
            <div className="grid items-start gap-3 lg:grid-cols-2">
              {data.arms.map((a) => (
                <DeskRow key={a.entrantId} a={a} color={ARM_COLORS[a.arm] ?? "var(--spark-up)"} />
              ))}
            </div>
          </div>

          {data.realFund ? (
            <Card className="mt-4 p-3 text-xs text-teal-200/50">
              <span className="font-semibold text-teal-50">Reference — the real fund (Opus, live + tooled):</span>{" "}
              <span className={`tabular-nums ${data.realFund.returnPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {data.realFund.returnPct >= 0 ? "+" : ""}
                {data.realFund.returnPct.toFixed(2)}%
              </span>{" "}
              on {money(data.realFund.navCents)} NAV. Not directly comparable — shown for context only.
            </Card>
          ) : null}

          <Card className="mt-4 p-4">
          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-teal-200/50">Options in five terms (for Cam &amp; Graham)</summary>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-teal-100/70">
              <li><span className="font-semibold text-teal-50">Option.</span> A contract — the right (not obligation) to buy or sell 100 shares at a fixed price by a fixed date. You pay a price for it called the <em>premium</em>. Options are NOT shorting.</li>
              <li><span className="font-semibold text-teal-50">Call vs put.</span> Buy a <em>call</em> if you think the stock goes UP; buy a <em>put</em> if you think it goes DOWN. A put is how the treatment bets on a decline — something the stock-only fund simply can&apos;t do.</li>
              <li><span className="font-semibold text-teal-50">Strike.</span> The fixed price in the contract. A call only pays off above it; a put only below it.</li>
              <li><span className="font-semibold text-teal-50">Premium &amp; max loss.</span> What you pay up front. When you BUY an option (all this desk ever does), that premium is the <em>most you can lose</em> — nothing more. Defined risk.</li>
              <li><span className="font-semibold text-teal-50">Expiry &amp; time decay.</span> Options expire, and they bleed a little value every day the stock sits still. You can be right on direction and still lose by running out of time — watch this play out in the cards above.</li>
            </ul>
          </details>
          </Card>

          <Card className="mt-3 p-4">
          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-teal-200/50">How the Options Desk works</summary>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-teal-100/70">
              <li><span className="font-semibold text-teal-50">Control vs treatment.</span> Both arms are Opus with the same {money(data.desk.startingStakeCents)} stake and the same researched menu. The only difference is the treatment may also <em>buy</em> options — buy-to-open only, never selling/writing, never spreads, so its risk is always defined.</li>
              <li><span className="font-semibold text-teal-50">Deterministic contracts.</span> The treatment picks the underlying, the direction, and a coarse bias (at-the-money or slightly out); the desk resolves the exact strike and a ~30-60-day expiry. That keeps the comparison about <em>judgment</em>, not strike-picking.</li>
              <li><span className="font-semibold text-teal-50">A pure sandbox.</span> Every fill lands only in this desk&apos;s own book — it never touches the real fund, the order gate, or the broker, and it never trades a real option. The fund&apos;s no-options guardrail is unchanged.</li>
            </ul>
          </details>
          </Card>

          <Card className="mt-3 p-4">
          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-teal-200/50">Why the test is built this way — phases &amp; what&apos;s in vs. out</summary>
            <div className="mt-3 space-y-3 text-xs leading-relaxed text-teal-100/70">
              <p>
                <span className="font-semibold text-teal-50">The one rule.</span> A comparison only means something if <em>exactly one thing</em> differs between the two arms — here, the options power. Everything below either keeps the arms identical, keeps every position defined-risk, or is a limit we chose not to fight yet.
              </p>

              <div>
                <div className="font-semibold uppercase tracking-wider text-teal-200/40">The phases</div>
                <ul className="mt-1 space-y-1">
                  <li><span className="font-semibold text-teal-50">0 · Design</span> — scope locked: buy-only, control vs treatment. <span className="text-emerald-300/70">done</span></li>
                  <li><span className="font-semibold text-teal-50">1 · Engine + desk + this page</span> — the two-arm sandbox, option pricing, the board + teaching cards. <span className="text-emerald-300/70">live</span></li>
                  <li><span className="font-semibold text-teal-50">2 · Literacy + controls</span> — the expiry &ldquo;punchline&rdquo; card, a per-option decay sparkline, member desk controls, and an opt-out push nudge. <span className="text-emerald-300/70">live</span></li>
                  <li><span className="font-semibold text-teal-50">3 · Deferred</span> — tooled arms, spreads, an options overlay on the real fund, feeding it dealer-gamma/skew. <span className="text-teal-200/40">maybe, once v1 teaches us something</span></li>
                </ul>
              </div>

              <div>
                <div className="font-semibold uppercase tracking-wider text-teal-200/40">What&apos;s deliberately in</div>
                <ul className="mt-1 space-y-1">
                  <li><span className="font-semibold text-teal-50">Two blind arms.</span> Same model, stake, menu, cadence, and no tools — so any gap between them is the options power and nothing else.</li>
                  <li><span className="font-semibold text-teal-50">Calls and puts.</span> The call tests leveraged conviction; the put tests something the real fund can&apos;t do at all — profiting from a decline.</li>
                  <li><span className="font-semibold text-teal-50">Buy-to-open only.</span> The most either can lose on a contract is the premium it paid — defined risk every time, and honest teaching cards.</li>
                  <li><span className="font-semibold text-teal-50">The real fund as a reference line.</span> Shown for context, never scored against — scoring against it would muddy the test (see below).</li>
                </ul>
              </div>

              <div>
                <div className="font-semibold uppercase tracking-wider text-teal-200/40">What&apos;s left out — and why</div>
                <ul className="mt-1 space-y-1">
                  <li><span className="font-semibold text-teal-50">The real agent as the control.</span> It researches with tools and runs a different book, so it&apos;d differ on <em>two</em> things, not one — and we couldn&apos;t blame any result on options. The control is a clean-room twin of the treatment instead.</li>
                  <li><span className="font-semibold text-teal-50">Tools / research for either arm.</span> Keeps the test clean and cheap — both arms reason from the same frozen snapshot. Giving both arms tools is a later, pricier upgrade.</li>
                  <li><span className="font-semibold text-teal-50">Selling / writing options, and spreads.</span> Selling carries <em>unlimited</em> risk (like shorting); spreads add complexity for little v1 gain. Both stay off.</li>
                  <li><span className="font-semibold text-teal-50">Canadian names &amp; real money.</span> The free options feed is US-only, and per the guardrail this never trades a real option — it is permanently a sandbox.</li>
                </ul>
              </div>
            </div>
          </details>
          </Card>

          <p className="mt-4 text-xs text-teal-200/40">
            Sandbox · option prices are MODELED (CBOE delayed ~15-min mid, or Black-Scholes from implied volatility) — educational, not executable. Options are US-only; CA names have none. Books are CAD; US fills convert at the live FX rate.
          </p>
        </>
      )}
    </main>
  );
}
