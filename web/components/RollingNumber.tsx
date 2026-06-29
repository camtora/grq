"use client";

// An odometer/rolling-number display (Google-Finance style): every digit is a vertical
// 0–9 strip that SLIDES to the new value when the number changes, while separators ($ , .
// US$) stay static. Pure CSS transform — no dependency. Sizes in `em`, so it inherits the
// surrounding font-size/weight/colour (drop it inside the styled price span). Honours
// prefers-reduced-motion (the strip jumps instead of rolling). The full value is exposed
// via aria-label; the digit strips are aria-hidden so a screen reader reads "$131.45", not
// "0123456789". docs/DESIGN.md — themed via inherited colour, no hardcoded hex.

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// One rolling digit: a 1em-tall window onto a 10em column, translated to the current digit.
function Digit({ d }: { d: number }) {
  return (
    <span className="inline-block h-[1em] overflow-hidden align-bottom leading-none">
      <span
        className="flex flex-col transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `translateY(-${d}em)` }}
      >
        {DIGITS.map((n) => (
          <span key={n} className="h-[1em] leading-none">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

export default function RollingNumber({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span className={`inline-flex tabular-nums ${className}`} aria-label={value}>
      {value.split("").map((ch, i) =>
        /[0-9]/.test(ch) ? (
          <Digit key={i} d={Number(ch)} />
        ) : (
          <span key={i} className="inline-block h-[1em] align-bottom leading-none" aria-hidden>
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
