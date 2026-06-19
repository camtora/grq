// A small line chart. Default mode is a bare sparkline (used inline where space
// is tight). Pass `axes` (with `dates` + `format`) to get a read-as-a-chart
// version: a price scale on the Y, a date range on the X, and faint gridlines —
// because a line with no scale is just a squiggle (context, everywhere).
export default function Sparkline({
  values,
  width = 560,
  height = 80,
  dates,
  format,
  axes = false,
  area = false,
  className = "h-20 w-full",
}: {
  values: number[];
  width?: number;
  height?: number;
  dates?: (Date | string | number)[];
  format?: (v: number) => string;
  axes?: boolean;
  /** Fill the area under the line (a faint tint) — used by the larger hero chart. */
  area?: boolean;
  /** Sizing for the bare (no-axes) svg — override to stretch as a backdrop. */
  className?: string;
}) {
  if (values.length < 2) {
    return <div className="text-xs text-teal-200/40">Not enough history yet.</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 6;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - 2 * pad);
    const y = pad + (1 - (v - min) / span) * (height - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = values[values.length - 1] >= values[0];
  const stroke = up ? "var(--spark-up)" : "var(--spark-down)";
  const last = pts[pts.length - 1].split(",");

  const chart = (grid: boolean) => (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
      aria-label="price history"
    >
      {grid &&
        [pad, height / 2, height - pad].map((y, i) => (
          <line key={i} x1={0} y1={y} x2={width} y2={y} stroke="var(--card-border)" strokeWidth="1" strokeDasharray="3 4" />
        ))}
      {area && (
        <polygon points={`${pts.join(" ")} ${width - pad},${height - pad} ${pad},${height - pad}`} fill={stroke} fillOpacity={0.12} stroke="none" />
      )}
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={stroke} />
    </svg>
  );

  if (!axes) return chart(false);

  const fmt = format ?? ((v: number) => String(v));
  const mid = (min + max) / 2;
  const dfmt: Intl.DateTimeFormatOptions =
    dates && dates.length > 1 &&
    (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86_400_000 > 200
      ? { month: "short", year: "numeric" }
      : { month: "short", day: "numeric" };
  const fmtDate = (d: Date | string | number) => new Date(d).toLocaleDateString("en-CA", dfmt);

  return (
    <div className="text-[10px] tabular-nums text-teal-200/40">
      <div className="flex items-stretch">
        <div className="flex h-20 w-16 shrink-0 flex-col justify-between py-[5px] pr-2 text-right">
          <span>{fmt(max)}</span>
          <span>{fmt(mid)}</span>
          <span>{fmt(min)}</span>
        </div>
        <div className="min-w-0 flex-1">{chart(true)}</div>
      </div>
      {dates && dates.length === values.length && (
        <div className="ml-16 mt-1 flex justify-between">
          <span>{fmtDate(dates[0])}</span>
          <span>{fmtDate(dates[Math.floor((dates.length - 1) / 2)])}</span>
          <span>{fmtDate(dates[dates.length - 1])}</span>
        </div>
      )}
    </div>
  );
}
