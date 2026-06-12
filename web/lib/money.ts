const fmtCad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

export function money(cents: number): string {
  return fmtCad.format(cents / 100);
}

/** Signed money with explicit +/− for P&L display. */
export function signedMoney(cents: number): string {
  const s = fmtCad.format(Math.abs(cents) / 100);
  return cents < 0 ? `−${s}` : `+${s}`;
}

export function pct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function pnlClass(cents: number): string {
  if (cents > 0) return "text-emerald-400";
  if (cents < 0) return "text-red-400";
  return "text-teal-200/60";
}

export function fmtWhen(d: Date): string {
  return d.toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
