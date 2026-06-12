import { prisma } from "@/lib/db";
import { money, fmtWhen } from "@/lib/money";
import { Card, PageHeader, Chip, Pnl, EmptyState } from "@/components/ui";
import Md from "@/components/Md";

const STATUS_TONE: Record<string, "green" | "teal" | "red" | "dim"> = {
  FILLED: "green",
  PENDING: "teal",
  REJECTED: "red",
  CANCELLED: "dim",
};

export default async function Activity() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { trades: true },
    take: 100,
  });

  return (
    <main>
      <PageHeader
        title="Activity"
        sub="Every order the engine has seen — fills, resting limits, and rejections with the guardrail that fired."
      />

      {orders.length === 0 ? (
        <EmptyState title="No orders yet" body="The engine hasn't been asked to do anything." />
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const realized = o.trades.reduce((s, t) => s + (t.realizedPnlCents ?? 0), 0);
            const hasRealized = o.trades.some((t) => t.realizedPnlCents !== null);
            return (
              <Card key={o.id} className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`font-bold ${o.side === "BUY" ? "text-teal-300" : "text-amber-300"}`}
                  >
                    {o.side}
                  </span>
                  <span className="font-semibold text-teal-50">
                    {o.qty} {o.symbol}
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
      )}
    </main>
  );
}
