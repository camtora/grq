// The confidence gauge — a radial ring meter (the design handoff's signature element).
// GRQ's conviction (0–100) as an arc of the teal accent over a faint track, with the
// number + a "CONF" label at the center. Pure SVG → server-renderable; theme-aware via
// the same tokens the sparkline uses (--spark-up teal in both themes).
const R = 22;
const CIRC = 2 * Math.PI * R; // ≈ 138.23

export default function ConfidenceGauge({
  value,
  size = 58,
  label = "CONF",
}: {
  value: number | null;
  size?: number;
  label?: string;
}) {
  const frac = value == null ? 0 : Math.min(1, Math.max(0, value / 100));
  const stroke = size >= 80 ? 5.5 : size >= 56 ? 5 : 6;
  // Label scales down on the tiny (scanner) gauge; the long "CONFIDENCE" word needs a
  // smaller glyph than "CONF".
  const labelSize = label.length > 5 ? 6.5 : 7;
  return (
    <svg viewBox="0 0 52 52" width={size} height={size} style={{ overflow: "visible" }} role="img" aria-label={`confidence ${value ?? "unknown"}`}>
      <circle cx="26" cy="26" r={R} fill="none" stroke="var(--card-border)" strokeWidth={stroke} />
      {value != null && (
        <circle
          cx="26"
          cy="26"
          r={R}
          fill="none"
          stroke="var(--spark-up)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(frac * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`}
          transform="rotate(-90 26 26)"
        />
      )}
      <text x="26" y={label ? 24 : 30} textAnchor="middle" className="font-mono" fill="var(--body-fg)" fontSize="15" fontWeight="700">
        {value == null ? "—" : value}
      </text>
      {label && (
        <text x="26" y="35" textAnchor="middle" className="font-mono" fill="var(--card-fg-muted, #6c8a83)" fontSize={labelSize} letterSpacing="1">
          {label}
        </text>
      )}
    </svg>
  );
}
