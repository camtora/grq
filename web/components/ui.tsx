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
  size,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  valueClassName?: string;
  term?: string;
  /** Tighter padding + smaller value — for dense single-row stat strips. Legacy alias for size="sm". */
  compact?: boolean;
  /** "lg" (default hero tiles) · "md" (a notch down — Portfolio's stat row, Cam 2026-07-03:
   *  the 24px values towered over the 14px positions body) · "sm" (dense strips). */
  size?: "lg" | "md" | "sm";
}) {
  const s = size ?? (compact ? "sm" : "lg");
  const pad = s === "sm" ? "p-3" : s === "md" ? "p-4" : "p-5";
  const labelCls = s === "sm" ? "text-[10px]" : s === "md" ? "text-[11px]" : "text-xs";
  const valueCls = s === "sm" ? "mt-1 text-base" : s === "md" ? "mt-1.5 text-xl" : "mt-2 text-2xl";
  const noteCls = s === "sm" ? "mt-0.5 text-[10px]" : s === "md" ? "mt-1 text-[11px]" : "mt-1 text-xs";
  return (
    <Card className={pad}>
      <div className={`uppercase tracking-wider text-teal-200/50 ${labelCls}`}>
        {term ? <Term k={term}>{label}</Term> : label}
      </div>
      <div className={`font-semibold tabular-nums ${valueClassName} ${valueCls}`}>{value}</div>
      {note ? <div className={`text-teal-200/40 ${noteCls}`}>{note}</div> : null}
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

// The page-level section title — the Today page's newspaper header, promoted to the
// shared kit (Cam 2026-07-03: bolder/larger/brighter than PanelHeader so top-of-page
// sections stand out; PanelHeader remains the smaller in-panel heading, e.g. the stock
// page's panels). `sub` is the lighter normal-case descriptor trailing the main word
// ("· your holdings"); `right` is the optional meta/link slot PanelHeader also offers.
export function SectionHeader({
  children,
  sub,
  right,
}: {
  children: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <h2 className="text-base font-bold uppercase tracking-wide text-teal-100">
        {children}
        {sub ? (
          <span className="ml-2 text-xs font-normal normal-case tracking-normal text-teal-200/45">{sub}</span>
        ) : null}
      </h2>
      {right ? <div className="shrink-0 pb-0.5 text-xs">{right}</div> : null}
    </div>
  );
}

// The house button. Matches the header KillSwitch control: compact, uppercase,
// rounded-lg. `solid` is the accented default; `ghost` is the bordered/quiet
// variant. Spreads native button props (type, disabled, formAction, …). For
// links styled as buttons, apply these same classes to an <a>/<Link>.
export function Button({
  children,
  variant = "solid",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" }) {
  const variants: Record<string, string> = {
    solid: "border border-teal-400/30 bg-teal-400/15 text-teal-200 hover:bg-teal-400/25",
    ghost: "border border-[color:var(--card-border)] text-teal-200/90 hover:bg-teal-400/10",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
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
