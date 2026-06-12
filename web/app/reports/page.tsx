import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDay } from "@/lib/money";
import { Card, PageHeader, Chip, EmptyState } from "@/components/ui";

export default async function Reports() {
  const reports = await prisma.report.findMany({
    orderBy: { date: "desc" },
    take: 60,
  });

  return (
    <main>
      <PageHeader
        title="Reports"
        sub="End-of-day reports land at ~16:15 ET; the Sunday deep review includes lessons and the capital recommendation."
      />

      {reports.length === 0 ? (
        <EmptyState
          title="No reports yet"
          body={
            <>
              The first end-of-day report lands at <strong className="text-teal-200">~16:15 ET
              on the next market day</strong> — daily P&L, every trade with its reasoning, fees
              vs budget, and the &ldquo;vs just buying XIC&rdquo; benchmark.
            </>
          }
        />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Link key={r.id} href={`/reports/${r.id}`} className="block">
              <Card className="flex items-center gap-4 p-5 transition-colors hover:border-teal-400/40">
                <Chip tone={r.kind === "WEEKLY" ? "teal" : "dim"}>{r.kind}</Chip>
                <span className="font-medium text-teal-50">{r.title}</span>
                <span className="ml-auto text-xs text-teal-200/40">{fmtDay(r.date)}</span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
