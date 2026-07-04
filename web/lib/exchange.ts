// The listing venue, made human (Cam 2026-07-04): every stock page calls out WHICH
// market a name trades on, under the ticker — the .TO/.V suffix convention is
// invisible to humans, and a TSX-V or OTC listing changes how you should read the
// name (liquidity, disclosure, currency). Prefer the stored exchange; fall back to
// the yahoo suffix so untracked/synthesised pages still get an honest label.

export type ExchangeMeta = {
  flag: string; // country flag emoji
  label: string; // short venue name shown bold ("TSX", "NASDAQ")
  name: string; // the venue's proper name ("Toronto Stock Exchange")
  note: string; // plain-English context (the literacy layer)
};

const KNOWN: Record<string, ExchangeMeta> = {
  TSX: { flag: "🇨🇦", label: "TSX", name: "Toronto Stock Exchange", note: "Canada's main market" },
  TSXV: { flag: "🇨🇦", label: "TSX-V", name: "TSX Venture Exchange", note: "Canada's junior/growth board" },
  CNQ: { flag: "🇨🇦", label: "CSE", name: "Canadian Securities Exchange", note: "Canada's junior board" },
  CSE: { flag: "🇨🇦", label: "CSE", name: "Canadian Securities Exchange", note: "Canada's junior board" },
  NEO: { flag: "🇨🇦", label: "NEO", name: "Cboe Canada (NEO)", note: "home of most Canadian CDRs" },
  NYSE: { flag: "🇺🇸", label: "NYSE", name: "New York Stock Exchange", note: "the US big board" },
  NASDAQ: { flag: "🇺🇸", label: "NASDAQ", name: "Nasdaq", note: "the US tech-heavy exchange" },
  AMEX: { flag: "🇺🇸", label: "NYSE American", name: "NYSE American (formerly AMEX)", note: "smaller US listings" },
  OTC: { flag: "🇺🇸", label: "OTC", name: "over-the-counter", note: "off-exchange — thinner liquidity and disclosure" },
  LSE: { flag: "🇬🇧", label: "LSE", name: "London Stock Exchange", note: "the UK main market" },
};

// Yahoo-suffix fallback for names with no stored exchange (untracked finds, the
// handful of null rows). Bare/.US symbols are US listings but the VENUE is unknown —
// say "US-listed" rather than guessing NYSE vs Nasdaq.
const BY_SUFFIX: Array<[RegExp, ExchangeMeta]> = [
  [/\.TO$/i, KNOWN.TSX],
  [/\.V$/i, KNOWN.TSXV],
  [/\.NE$/i, KNOWN.NEO],
  [/\.CN$/i, KNOWN.CSE],
];

export function exchangeMeta(exchange: string | null | undefined, yahoo: string): ExchangeMeta {
  const known = exchange ? KNOWN[exchange.toUpperCase()] : undefined;
  if (known) return known;
  for (const [re, meta] of BY_SUFFIX) if (re.test(yahoo)) return meta;
  if (exchange) return { flag: "", label: exchange, name: `${exchange} listing`, note: "venue not in the map yet" };
  return { flag: "🇺🇸", label: "US-listed", name: "US listing", note: "exact venue not on file yet" };
}

/** One prebuilt display line ("🇨🇦 TSX — Toronto Stock Exchange") for wire consumers
 *  (GRQ Go's dossier header) so the venue mapping lives here only. */
export function exchangeLine(exchange: string | null | undefined, yahoo: string): string {
  const m = exchangeMeta(exchange, yahoo);
  return `${m.flag} ${m.label} — ${m.name}`.trim();
}
