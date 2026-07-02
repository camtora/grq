import { Card } from "@/components/ui";
import Term from "@/components/Term";

// "How day trading works / why it's hard" panel (docs/DAY-TRADE-LAB.md). Term-linked to the glossary.
export default function DayEducation() {
  return (
    <Card className="space-y-3 p-5">
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Day trading in five ideas</div>
      <ul className="space-y-2 text-xs leading-relaxed text-teal-100/75">
        <li>
          <span className="font-semibold text-teal-50"><Term k="day-trading">Day trading</Term>.</span> Buying and selling the same stock within one day to profit from small intraday moves — never holding overnight. The opposite of the fund&apos;s buy-and-hold-on-conviction approach.
        </li>
        <li>
          <span className="font-semibold text-teal-50"><Term k="bid-ask-spread">The bid/ask spread</Term>.</span> You buy at the (higher) ask and sell at the (lower) bid, so <em>every</em> round trip starts underwater by the spread — the silent tax that adds up fast when you trade a lot.
        </li>
        <li>
          <span className="font-semibold text-teal-50"><Term k="slippage">Commissions &amp; slippage</Term>.</span> Each fill pays a commission, and big/fast orders move the price against you. Thin per-trade margins get eaten by these costs long before you notice.
        </li>
        <li>
          <span className="font-semibold text-teal-50"><Term k="pattern-day-trader">PDT &amp; settlement</Term>.</span> In the US, &lt;$25k margin accounts get restricted after 4 day trades in 5 days (the Pattern Day Trader rule); cash accounts dodge it but hit <Term k="settlement">settlement</Term> limits — you can&apos;t instantly rebuy with unsettled proceeds.
        </li>
        <li>
          <span className="font-semibold text-teal-50">Why most lose.</span> Between spread, commissions, taxes (short-term = full income rates), and the discipline it demands, studies find ~70–90% of active day traders lose money over time. This lab lets you test that against a Holder, honestly.
        </li>
      </ul>
      <p className="text-[11px] text-teal-200/40">
        Modeled &amp; educational — the fund can&apos;t day-trade (a hard §6 limit). Prices are live/delayed quotes, so this shows the structural drag, not a scalper&apos;s edge.
      </p>
    </Card>
  );
}
