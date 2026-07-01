import Link from "next/link";
import { Card } from "@/components/ui";
import Term from "@/components/Term";
import PanelHeader from "@/components/PanelHeader";

// The "Learn" tab of the options portal (docs/OPTIONS-PORTAL.md). Plain-English lessons for Cam &
// Graham; every piece of jargon is a <Term> tap-to-explain. Education-first — the fund never trades
// options. Server component (static content); the interactive bits live in the Calculator tab.
function Lesson({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <PanelHeader>{title}</PanelHeader>
      <Card className="p-5">
        <div className="space-y-3 text-sm leading-relaxed text-teal-100/75">{children}</div>
      </Card>
    </div>
  );
}

export default function OptionsLearn() {
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <p className="text-sm leading-relaxed text-teal-100/80">
          An <Term k="call-option">option</Term> is a contract: the <em>right</em> — not the obligation — to buy or sell 100 shares
          at a fixed price by a fixed date. You pay a price for it called the <Term k="premium">premium</Term>. That&apos;s the
          whole idea. The rest is learning where each one pays off, what eats its value, and how to read the picture. Tap any{" "}
          <span className="border-b border-dotted border-teal-400/60">underlined term</span> to see what it means, and head to the{" "}
          <Link href="/options?tab=calculator" className="text-teal-300 hover:underline">Calculator</Link> to watch any of this play out.
        </p>
      </Card>

      <Lesson title="1 · Calls and puts">
        <p>
          Buy a <Term k="call-option">call</Term> if you think the stock goes <span className="font-semibold text-emerald-300">up</span>; buy a{" "}
          <Term k="put-option">put</Term> if you think it goes <span className="font-semibold text-red-300">down</span>. A put is how you bet on
          a decline — exactly the trade the stock-only fund can&apos;t make.
        </p>
        <p>
          Each contract controls <span className="font-semibold text-teal-50">100 shares</span>, so a premium quoted at $2.50 costs you $250.
          When you <em>buy</em> an option, that premium is the <Term k="max-loss">most you can lose</Term> — defined risk. (You can also{" "}
          <em>sell</em> options for income, which flips the risk around; that&apos;s the covered call and cash-secured put on the calculator.)
        </p>
      </Lesson>

      <Lesson title="2 · Strike, and what the premium is made of">
        <p>
          The <Term k="strike">strike</Term> is the fixed price in the contract. A call only pays off <em>above</em> it; a put only{" "}
          <em>below</em> it. Whether the stock is past the strike is its <Term k="moneyness">moneyness</Term> — in, at, or out of the money.
        </p>
        <p>
          A premium is two parts: <Term k="intrinsic-value">intrinsic value</Term> (real, exercise-now value if it&apos;s in the money) plus{" "}
          <Term k="extrinsic-value">time value</Term> (what you pay for the time and uncertainty left). An at-the-money option is <em>all</em>{" "}
          time value — which is why it has the most to lose to the clock.
        </p>
      </Lesson>

      <Lesson title="3 · The two ways to lose: direction and time">
        <p>
          You can be wrong on direction — that&apos;s obvious. But you can also be <em>right</em> and still lose, because options bleed value
          every day through <Term k="time-decay">time decay</Term>. The closer to <Term k="expiry">expiry</Term>, the faster the bleed.
        </p>
        <p>
          That&apos;s the trade-off options make you confront: you get leverage and defined risk, but you&apos;re on a deadline. The{" "}
          <Link href="/options?tab=calculator" className="text-teal-300 hover:underline">calculator&apos;s</Link> dashed &ldquo;today&rdquo; line
          versus the solid &ldquo;at expiry&rdquo; line shows exactly how much the clock is costing you.
        </p>
      </Lesson>

      <Lesson title="4 · The Greeks — the dashboard">
        <p>The four <Term k="greeks">Greeks</Term> describe how an option reacts before the stock even moves:</p>
        <ul className="space-y-1.5">
          <li><Term k="delta">Delta</Term> — how much the premium moves per $1 in the stock (and a rough read on its odds of finishing in the money).</li>
          <li><Term k="gamma">Gamma</Term> — how fast delta itself changes; the acceleration, highest near the money close to expiry.</li>
          <li><Term k="theta">Theta</Term> — the dollars lost per day to time decay. The rent you pay to hold the bet.</li>
          <li><Term k="vega">Vega</Term> — how much the premium moves when <Term k="implied-volatility">implied volatility</Term> shifts a point.</li>
        </ul>
      </Lesson>

      <Lesson title="5 · The four starter strategies">
        <p>The calculator ships with four — two you buy (defined risk) and two you sell (income, different risk):</p>
        <ul className="space-y-1.5">
          <li><Link href="/options?tab=calculator&strat=long-call" className="text-teal-300 hover:underline">Long call</Link> — leveraged bet the stock rises. Max loss = the premium.</li>
          <li><Link href="/options?tab=calculator&strat=long-put" className="text-teal-300 hover:underline">Long put</Link> — bet (or hedge) the stock falls. Max loss = the premium.</li>
          <li><Link href="/options?tab=calculator&strat=covered-call" className="text-teal-300 hover:underline"><Term k="covered-call">Covered call</Term></Link> — own shares, sell a call for income, cap your upside.</li>
          <li><Link href="/options?tab=calculator&strat=cash-secured-put" className="text-teal-300 hover:underline"><Term k="cash-secured-put">Cash-secured put</Term></Link> — get paid to maybe buy a name lower.</li>
        </ul>
        <p className="text-xs text-teal-200/50">
          The fund itself only ever <em>buys</em> options (defined risk) and never sells/writes them — the two income strategies are here to
          teach the other side. And the <Link href="/options-desk" className="text-teal-300 hover:underline">Options Desk</Link> experiment is
          watching whether adding options actually compounds better than stock alone.
        </p>
      </Lesson>

      <p className="text-[11px] text-teal-200/40">
        Everything here is educational. GRQ&apos;s live fund holds no options today (a hard guardrail); the calculator and experiment are modeled, never executable.
      </p>
    </div>
  );
}
