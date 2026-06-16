// Native, labelled currency (D24): CAD stays a bare "$" (the house currency,
// unchanged everywhere), while a non-CAD listing renders with its own symbol —
// en-CA gives USD as "US$170.50" — so a US name can never be mistaken for CAD.
const fmtCache = new Map<string, Intl.NumberFormat>();
function fmt(currency: string): Intl.NumberFormat {
  let f = fmtCache.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-CA", { style: "currency", currency });
    fmtCache.set(currency, f);
  }
  return f;
}

export function money(cents: number, currency: string | null = "CAD"): string {
  return fmt((currency || "CAD").toUpperCase()).format(cents / 100);
}

/** Signed money with explicit +/− for P&L display. */
export function signedMoney(cents: number, currency: string | null = "CAD"): string {
  const s = fmt((currency || "CAD").toUpperCase()).format(Math.abs(cents) / 100);
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
