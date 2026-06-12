import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtDay } from "@/lib/money";
import { Card, Chip } from "@/components/ui";
import Md from "@/components/Md";

export default async function ReportDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reportId = Number.parseInt(id, 10);
  if (!Number.isInteger(reportId)) notFound();

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) notFound();

  let stats: Record<string, string | number> | null = null;
  if (report.statsJson) {
    try {
      stats = JSON.parse(report.statsJson);
    } catch {
      stats = null;
    }
  }

  return (
    <main>
      <Link href="/reports" className="text-xs text-teal-300 hover:underline">
        ← all reports
      </Link>
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-3">
        <Chip tone={report.kind === "WEEKLY" ? "teal" : "dim"}>{report.kind}</Chip>
        <h1 className="text-2xl font-bold text-teal-50">{report.title}</h1>
        <span className="ml-auto text-sm text-teal-200/40">{fmtDay(report.date)}</span>
      </div>

      {stats && (
        <Card className="mb-6 grid grid-cols-2 gap-x-8 gap-y-3 p-5 md:grid-cols-4">
          {Object.entries(stats).map(([k, v]) => (
            <div key={k}>
              <div className="text-xs uppercase tracking-wider text-teal-200/40">{k}</div>
              <div className="mt-1 font-semibold tabular-nums text-teal-50">{String(v)}</div>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-6">
        <Md text={report.body} />
      </Card>
    </main>
  );
}
