import { money, signedMoney, pnlClass } from "@/lib/money";
import Term from "./Term";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  note,
  valueClassName = "text-teal-50",
  term,
  compact = false,
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
  valueClassName?: string;
  term?: string;
  /** Tighter padding + smaller value — for dense single-row stat strips. */
  compact?: boolean;
}) {
  return (
    <Card className={compact ? "p-3" : "p-5"}>
      <div className={`uppercase tracking-wider text-teal-200/50 ${compact ? "text-[10px]" : "text-xs"}`}>
        {term ? <Term k={term}>{label}</Term> : label}
      </div>
      <div className={`font-semibold tabular-nums ${valueClassName} ${compact ? "mt-1 text-base" : "mt-2 text-2xl"}`}>{value}</div>
      {note ? <div className={`text-teal-200/40 ${compact ? "mt-0.5 text-[10px]" : "mt-1 text-xs"}`}>{note}</div> : null}
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
