import Link from "next/link";

// Learn's navigation buttons (Cam 2026-07-04): every nav affordance on the portal says
// exactly what it does — "Next Lesson", "Back to Courses" — in a clear, LARGE button.
// Deliberately bigger than the compact house Button (docs/DESIGN.md §1.5): Learn is a
// reading surface and its nav is the primary action, not chrome. Web-only convention,
// scoped to /learn (+ mirrored in GRQ Go).

export default function LearnButton({
  href,
  children,
  tone = "solid",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  tone?: "solid" | "ghost";
  className?: string;
}) {
  const tones: Record<string, string> = {
    solid: "border-teal-400/30 bg-teal-400/15 text-teal-200 hover:bg-teal-400/25",
    ghost: "border-[color:var(--card-border)] text-teal-200/80 hover:bg-teal-400/10 hover:text-teal-200",
  };
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors ${tones[tone]} ${className}`}
    >
      {children}
    </Link>
  );
}
