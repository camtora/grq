"use client";

import { useEffect, useState } from "react";
import { GLOSSARY } from "@/lib/glossary";

// A clickable/hoverable concept term — the literacy pillar made visible
// (docs/LITERACY.md). Known terms come from the static glossary (instant, on
// hover). Anything else is explained on demand by the agent via /api/explain
// (cached), so jargon the agent flags with [[double brackets]] in its prose
// becomes a tap-to-explain. Dark popover by design — reads the same in either theme.
export default function Term({
  k,
  children,
  className = "",
  align = "left",
}: {
  k: string;
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  const def = GLOSSARY[k];
  const [open, setOpen] = useState(false);
  const [dyn, setDyn] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Dynamic fetch for terms not in the static glossary (once, on first open).
  useEffect(() => {
    if (!open || def || dyn || loading) return;
    setLoading(true);
    fetch("/api/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ term: k }),
    })
      .then((r) => r.json())
      .then((d) => setDyn(typeof d.body === "string" && d.body ? d.body : "Couldn't explain that one."))
      .catch(() => setDyn("Couldn't reach the explainer."))
      .finally(() => setLoading(false));
  }, [open, def, dyn, loading, k]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const title = def ? def.term : k;
  const popBody = def ? def.def : loading ? "Asking the agent…" : (dyn ?? "");

  return (
    <span
      className="relative inline-block"
      onMouseEnter={def ? () => setOpen(true) : undefined}
      onMouseLeave={def ? () => setOpen(false) : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`cursor-help border-b border-dotted border-teal-400/60 ${className}`}
        aria-label={`Explain ${title}`}
      >
        {children ?? title}
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute top-full z-30 mt-1.5 w-64 cursor-default rounded-lg border border-teal-400/25 bg-[#0a1413] p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-teal-100/80 shadow-2xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          <span className="mb-1 block font-semibold text-teal-50">{title}</span>
          {popBody}
        </span>
      )}
    </span>
  );
}
