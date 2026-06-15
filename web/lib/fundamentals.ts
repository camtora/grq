import { prisma } from "./db";
import { fmpProfile, fmpEnabled } from "./fmp";

// Refresh FMP fundamentals for universe members — the agent runner calls this on
// a schedule (a few at a time, to respect rate limits). Powers the stock filters
// (country / exchange / industry / cap). Stale after 7 days; never-fetched first.
export async function backfillFundamentals(limit = 8): Promise<number> {
  if (!fmpEnabled()) return 0;
  const stale = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const members = await prisma.universeMember.findMany({
    where: { status: { not: "RETIRED" }, OR: [{ fmpAt: null }, { fmpAt: { lt: stale } }] },
    orderBy: { fmpAt: { sort: "asc", nulls: "first" } },
    take: limit,
  });
  let n = 0;
  for (const m of members) {
    const p = await fmpProfile(m.yahoo).catch(() => null);
    await prisma.universeMember.update({
      where: { symbol: m.symbol },
      data: {
        sector: p?.sector ?? null,
        industry: p?.industry ?? null,
        country: p?.country ?? null,
        currency: p?.currency ?? null,
        exchange: p?.exchange ?? null,
        marketCapM: p && p.marketCap > 0 ? Math.round(p.marketCap / 1_000_000) : null,
        fmpAt: new Date(),
      },
    });
    if (p) n++;
  }
  return n;
}

// Cap buckets for the filter. Thresholds in millions (of the listing's currency
// — close enough for bucketing across CAD/USD). Mega ≥ $200B, Large ≥ $10B,
// Mid ≥ $2B, Small ≥ $300M, else Micro.
export type CapTier = "mega" | "large" | "mid" | "small" | "micro";
export function capTier(marketCapM: number | null | undefined): CapTier | null {
  if (!marketCapM || marketCapM <= 0) return null;
  if (marketCapM >= 200_000) return "mega";
  if (marketCapM >= 10_000) return "large";
  if (marketCapM >= 2_000) return "mid";
  if (marketCapM >= 300) return "small";
  return "micro";
}
export const CAP_LABEL: Record<CapTier, string> = {
  mega: "Mega ≥$200B",
  large: "Large ≥$10B",
  mid: "Mid ≥$2B",
  small: "Small ≥$300M",
  micro: "Micro <$300M",
};
