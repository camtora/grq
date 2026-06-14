"use client";

import { useState } from "react";
import { GLOSSARY } from "@/lib/glossary";

// A clickable/hoverable glossary term — the literacy pillar made visible
// (docs/LITERACY.md). Dotted underline; hover or tap shows a plain-English
// definition. A dark popover by design, so it reads the same in light and dark.
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
  if (!def) return <>{children}</>;
  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`cursor-help border-b border-dotted border-teal-400/60 ${className}`}
        aria-label={`Define ${def.term}`}
      >
        {children ?? def.term}
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute top-full z-30 mt-1.5 w-64 cursor-default rounded-lg border border-teal-400/25 bg-[#0a1413] p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-teal-100/80 shadow-2xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          <span className="mb-1 block font-semibold text-teal-50">{def.term}</span>
          {def.def}
        </span>
      )}
    </span>
  );
}
