// A small "live" marker — the pulsing emerald dot first used beside the price
// ticker (LiveQuote), reused on stock-page panels whose data is pulled FRESH from
// FMP on EVERY page load (analyst ratings, price targets, earnings, valuation vs
// peers, institutional). It distinguishes live market data from GRQ's
// research-gated call. See docs/DATA-SOURCES.md → "Data freshness & refresh cadence".
export default function LiveDot({ label = "live", title }: { label?: string | null; title?: string }) {
  return (
    <span
      title={title ?? "Live — pulled fresh from the market-data feed each time you open this page"}
      className="inline-flex items-center gap-1 align-middle text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      {label}
    </span>
  );
}
