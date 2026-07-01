import { Card } from "@/components/ui";
import Term from "@/components/Term";
import Link from "next/link";

// The "how shorting works / why it's dangerous" panel (docs/SHORT-LAB.md). Term-linked to the glossary.
export default function ShortEducation() {
  return (
    <Card className="space-y-3 p-5">
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Shorting in five ideas</div>
      <ul className="space-y-2 text-xs leading-relaxed text-teal-100/75">
        <li>
          <span className="font-semibold text-teal-50"><Term k="short-selling">Short selling</Term>.</span> You borrow shares, sell them now, and must buy them back later. You profit if the price falls, so it&apos;s a bet <em>against</em> a stock — the trade the long-only fund can&apos;t make.
        </li>
        <li>
          <span className="font-semibold text-teal-50">Unbounded loss.</span> A stock you own can only fall to zero, but a stock you&apos;re short can rise forever — so your loss has <em>no cap</em>. That&apos;s the single most important difference from every other trade here. (A <Link href="/options?tab=calculator&strat=long-put" className="text-teal-300 hover:underline">long put</Link> is the defined-risk way to bet down.)
        </li>
        <li>
          <span className="font-semibold text-teal-50"><Term k="cost-to-borrow">Cost to borrow</Term>.</span> You&apos;re renting the shares — a hard-to-borrow name can cost a lot of %/yr, and you pay any dividend while short. Time works against you even if you&apos;re eventually right.
        </li>
        <li>
          <span className="font-semibold text-teal-50"><Term k="margin-call">Margin &amp; the margin call</Term>.</span> Shorting runs on borrowed collateral. If the stock rises against you and your equity falls below the maintenance line, you get <em>force-covered</em> at the worst possible moment — this lab models exactly that.
        </li>
        <li>
          <span className="font-semibold text-teal-50"><Term k="short-squeeze">Short squeeze</Term>.</span> When a crowded short rallies, shorts scramble to cover, which pushes the price up further — a feedback loop with no long-side equivalent. Watch <Term k="short-interest">short interest</Term> and <Term k="days-to-cover">days-to-cover</Term>.
        </li>
      </ul>
      <p className="text-[11px] text-teal-200/40">
        Everything here is modeled and educational — the fund never shorts (a hard guardrail). Prices are live/delayed quotes; borrow cost is a modeled estimate.
      </p>
    </Card>
  );
}
