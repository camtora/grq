// OpenInsider scraper (D27) — the exact "top insider purchases of the day" view
// Cam linked. OpenInsider has no API, so we parse its static HTML table. This is
// a SUPPLEMENT / cross-check to FMP's Form 4 feed, not the source of truth: it is
// brittle by nature, so every failure degrades soft to [] and the page leans on
// FMP. Cluster buys (multiple insiders, one name) are the signal openinsider is
// best at surfacing.

export type OpenInsiderRow = {
  symbol: string;
  companyName: string;
  insiderName: string;
  title: string;
  tradeType: string; // "P - Purchase"
  priceUsd: number;
  shares: number;
  valueUsd: number;
  txnDate: string; // trade date (YYYY-MM-DD)
  filedAt: string; // filing date (YYYY-MM-DD)
  link: string; // SEC Form 4 url
};

const TOP_BUYS_URL = "http://openinsider.com/top-insider-purchases-of-the-day";

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const num = (s: string): number => Number(s.replace(/[^0-9.\-]/g, "")) || 0;

/** Fetch + parse OpenInsider's top-purchases table. Returns [] on any trouble. */
export async function fetchOpenInsiderTopBuys(): Promise<OpenInsiderRow[]> {
  try {
    const r = await fetch(TOP_BUYS_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GRQ/1.0; +https://grq.camerontora.ca)" },
    });
    if (!r.ok) return [];
    const html = await r.text();
    // Isolate the data table (class="tinytable") and walk its rows.
    const start = html.indexOf('class="tinytable"');
    if (start < 0) return [];
    const body = html.slice(start);
    const rawRows = body.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
    const out: OpenInsiderRow[] = [];
    for (const raw of rawRows) {
      // OpenInsider stuffs a chart-image tooltip into the ticker cell's
      // onmouseover/title attributes; the embedded "<img …>" breaks naive tag
      // stripping, so drop event-handler + title attributes before parsing.
      const row = raw.replace(/\s(?:on\w+|title)="[^"]*"/gi, "");
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) ?? []).map((c) => c.replace(/^<td[^>]*>/, "").replace(/<\/td>$/, ""));
      if (cells.length < 13) continue; // header / summary rows
      const tradeType = stripTags(cells[7]);
      if (!/purchase/i.test(tradeType)) continue; // open-market buys only
      // The ticker is the /SYMBOL link target — robust against any leftover markup.
      const symbol = (cells[3].match(/href="\/([A-Za-z.\-]+)"/)?.[1] ?? stripTags(cells[3])).toUpperCase();
      if (!/^[A-Z][A-Z.\-]{0,7}$/.test(symbol)) continue;
      out.push({
        symbol,
        companyName: stripTags(cells[4]),
        insiderName: stripTags(cells[5]),
        title: stripTags(cells[6]),
        tradeType,
        priceUsd: num(stripTags(cells[8])),
        shares: Math.abs(num(stripTags(cells[9]))),
        valueUsd: Math.abs(num(stripTags(cells[12]))),
        txnDate: stripTags(cells[2]).slice(0, 10),
        filedAt: stripTags(cells[1]).slice(0, 10),
        link: (cells[1].match(/href="(https?:[^"]+)"/)?.[1] ?? "").replace(/^http:/, "https:"),
      });
    }
    return out;
  } catch {
    return [];
  }
}
