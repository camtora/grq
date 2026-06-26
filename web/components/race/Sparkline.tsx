// Tiny cumulative-P&L sparkline (pure SVG, no deps). Green when the model is up overall, red when
// down. A faint zero baseline anchors the eye. Renders nothing meaningful below 2 points.
export default function Sparkline({ data, className = "" }: { data: number[]; className?: string }) {
  if (data.length < 2) return <div className={className} />;
  const w = 120;
  const h = 32;
  const pad = 2;
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 0);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = data[data.length - 1];
  const stroke = last > 0 ? "#34d399" : last < 0 ? "#f87171" : "#5eead4";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-full w-full ${className}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="currentColor" strokeWidth={0.5} className="text-teal-200/15" />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
