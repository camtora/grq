import { prisma } from "./db";
import { fetchDailyBars } from "./broker/yahoo";

const CONCURRENCY = 4;

/** Fetch + store daily bars. range="1y" for backfill, "5d" for the nightly
 *  maintenance job (also picks up revised closes). */
export async function refreshBars(symbols: string[], range = "5d"): Promise<number> {
  let stored = 0;
  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const batch = symbols.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((s) => fetchDailyBars(s, range)));
    for (let b = 0; b < batch.length; b++) {
      const symbol = batch[b].toUpperCase();
      const bars = results[b];
      if (bars.length === 0) continue;
      // Bulk insert history, then upsert the last two rows (today's bar mutates).
      await prisma.bar.createMany({
        data: bars.map((bar) => ({ symbol, ...bar })),
        skipDuplicates: true,
      });
      for (const bar of bars.slice(-2)) {
        await prisma.bar.upsert({
          where: { symbol_date: { symbol, date: bar.date } },
          create: { symbol, ...bar },
          update: { ...bar },
        });
      }
      stored += bars.length;
    }
  }
  return stored;
}

export async function getCloses(symbol: string, limit = 260): Promise<{ date: Date; closeCents: number }[]> {
  const rows = await prisma.bar.findMany({
    where: { symbol: symbol.toUpperCase() },
    orderBy: { date: "desc" },
    take: limit,
    select: { date: true, closeCents: true },
  });
  return rows.reverse();
}
