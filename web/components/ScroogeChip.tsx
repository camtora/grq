// The cash row's "logo" — Scrooge McDuck (Cam's pick, 2026-07-04; the same asset
// GRQ Go uses). The art sits on white, so it rides the same white chip as the
// company logos. Plain <img>, safe in server and client components alike.
export default function ScroogeChip({ className = "h-6 w-6" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/scrooge.png"
      alt="Cash"
      className={`shrink-0 rounded-full border border-teal-400/10 bg-white object-cover ${className}`}
    />
  );
}
