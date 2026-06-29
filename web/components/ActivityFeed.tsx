import Link from "next/link";
import { prisma } from "@/lib/db";
import { money, fmtWhen } from "@/lib/money";
import { Card, Chip, Pnl, EmptyState } from "@/components/ui";
import Md from "@/components/Md";

const STATUS_TONE: Record<string, "green" | "teal" | "red" | "dim"> = {
  FILLED: "green",
  PENDING: "teal",
  REJECTED: "red",
  CANCELLED: "dim",
};

// Shared order feed. Full cards on /activity; compact divided rows in the
// Overview right rail (compact). Single source of truth for both.
export default async function ActivityFeed({
  limit = 100,
  compact = false,
}: {
  limit?: number;
  compact?: boolean;
}) {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { trades: true },
    take: limit,
  });

  if (orders.length === 0) {
    if (compact) {
      return (
        <p className="px-5 py-6 text-sm text-teal-200/40">
          No orders yet — the agent only trades when a thesis clears every guardrail.
        </p>
      );
    }
    return <EmptyState title="No orders yet" body="The engine hasn't been asked to do anything." />;
  }

  if (compact) {
    return (
      <ul className="divide-y divide-teal-400/10">
        {orders.map((o) => {
          const realized = o.trades.reduce((s, t) => s + (t.realizedPnlCents ?? 0), 0);
          const hasRealized = o.trades.some((t) => t.realizedPnlCents !== null);
          return (
            <li key={o.id} className="px-5 py-3">
              <div className="flex items-start gap-2">
                <span className={`text-sm font-bold ${o.side === "BUY" ? "text-teal-300" : "text-amber-300"}`}>
                  {o.side}
                </span>
                <span className="text-sm font-semibold text-teal-50">
                  {o.qty}{" "}
                  <Link href={`/stocks/${o.symbol}`} className="hover:underline">
                    {o.symbol}
                  </Link>
                </span>
                {/* Timestamp alone, top-right. */}
                <span className="ml-auto shrink-0 text-xs text-teal-200/40">{fmtWhen(o.createdAt)}</span>
              </div>
              {/* Detail line: fill details (@ price · comm · pnl) left, status pill right. */}
              <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-teal-100/60">
                  {o.status === "FILLED" && (
                    <>
                      @ <span className="tabular-nums">{money(o.avgFillPriceCents ?? 0)}</span> · comm{" "}
                      <span className="tabular-nums">{money(o.commissionCents)}</span>
                      {hasRealized && (
                        <>
                          {" · "}
                          <Pnl cents={realized} className="text-xs" />
                        </>
                      )}
                    </>
                  )}
                  {o.status === "REJECTED" && o.rejectReason && (
                    <span className="text-red-300/80">⛔ {o.rejectReason}</span>
                  )}
                </span>
                <Chip tone={STATUS_TONE[o.status] ?? "dim"}>{o.status}</Chip>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((o) => {
        const realized = o.trades.reduce((s, t) => s + (t.realizedPnlCents ?? 0), 0);
        const hasRealized = o.trades.some((t) => t.realizedPnlCents !== null);
        return (
          <Card key={o.id} className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`font-bold ${o.side === "BUY" ? "text-teal-300" : "text-amber-300"}`}>
                {o.side}
              </span>
              <span className="font-semibold text-teal-50">
                {o.qty}{" "}
                <Link href={`/stocks/${o.symbol}`} className="hover:underline">
                  {o.symbol}
                </Link>
              </span>
              <span className="text-sm text-teal-200/50">
                {o.type}
                {o.limitPriceCents ? ` @ ${money(o.limitPriceCents)}` : ""}
              </span>
              <Chip tone={STATUS_TONE[o.status] ?? "dim"}>{o.status}</Chip>
              <span className="ml-auto text-xs text-teal-200/40">
                #{o.id} · {fmtWhen(o.createdAt)} · {o.placedBy}
              </span>
            </div>

            {o.status === "FILLED" && (
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-teal-100/70">
                <span>
                  filled @ <span className="tabular-nums">{money(o.avgFillPriceCents ?? 0)}</span>
                </span>
                <span>
                  commission <span className="tabular-nums">{money(o.commissionCents)}</span>
                </span>
                {hasRealized && (
                  <span>
                    realized <Pnl cents={realized} className="text-sm" />
                  </span>
                )}
              </div>
            )}

            {o.status === "REJECTED" && o.rejectReason && (
              <div className="mt-2 text-sm text-red-300/90">⛔ {o.rejectReason}</div>
            )}

            {o.reason && (
              <div className="mt-3 border-t border-teal-400/10 pt-3">
                <Md text={o.reason} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
