import { money, signedMoney, pnlClass } from "@/lib/money";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-teal-400/15 bg-teal-400/[0.04] ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  note,
  valueClassName = "text-teal-50",
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wider text-teal-200/50">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${valueClassName}`}>{value}</div>
      {note ? <div className="mt-1 text-xs text-teal-200/40">{note}</div> : null}
    </Card>
  );
}

export function PageHeader({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-teal-50">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-teal-200/50">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function Pnl({ cents, className = "" }: { cents: number; className?: string }) {
  return (
    <span className={`tabular-nums ${pnlClass(cents)} ${className}`}>{signedMoney(cents)}</span>
  );
}

export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{money(cents)}</span>;
}

export function Chip({
  children,
  tone = "teal",
}: {
  children: React.ReactNode;
  tone?: "teal" | "red" | "green" | "dim";
}) {
  const tones: Record<string, string> = {
    teal: "bg-teal-400/15 text-teal-300 border-teal-400/20",
    red: "bg-red-400/15 text-red-300 border-red-400/20",
    green: "bg-emerald-400/15 text-emerald-300 border-emerald-400/20",
    dim: "bg-teal-400/5 text-teal-200/50 border-teal-400/10",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <Card className="p-10 text-center">
      <div className="text-lg font-semibold text-teal-50">{title}</div>
      <div className="mx-auto mt-2 max-w-md text-sm text-teal-200/50">{body}</div>
    </Card>
  );
}
