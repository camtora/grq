// A monogram "logo" for a ticker — a colored disc with the symbol's letters.
// Zero-dependency stand-in for real company logos (logos/editorial photos are a
// planned imagery upgrade — see docs/NEWSPAPER.md). Color is deterministic from
// the symbol so a given stock always wears the same badge.
const PALETTE = [
  "bg-teal-500/25 text-teal-100",
  "bg-emerald-500/25 text-emerald-100",
  "bg-sky-500/25 text-sky-100",
  "bg-amber-500/25 text-amber-100",
  "bg-rose-500/25 text-rose-100",
  "bg-violet-500/25 text-violet-100",
  "bg-cyan-500/25 text-cyan-100",
  "bg-indigo-500/25 text-indigo-100",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export default function StockAvatar({
  symbol,
  className = "h-9 w-9 text-xs",
}: {
  symbol: string;
  className?: string;
}) {
  const initials = symbol.replace(/[.\-].*$/, "").slice(0, 2);
  const cls = PALETTE[hash(symbol) % PALETTE.length];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-black ${cls} ${className}`}
      title={symbol}
    >
      {initials}
    </span>
  );
}
