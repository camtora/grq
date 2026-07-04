"use client";

import { useState } from "react";
import { Card } from "@/components/ui";

// Client-side search + display for the full glossary (docs/LEARN-PORTAL.md). Entries come
// pre-serialized (and related-resolved) from the server page. Related chips clear the filter
// first so the jump target is always rendered before we scroll to it.
type Entry = {
  slug: string;
  term: string;
  def: string;
  example: string | null;
  related: { slug: string; term: string }[];
};

export default function GlossaryBrowser({ entries }: { entries: Entry[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? entries.filter((e) => e.term.toLowerCase().includes(needle) || e.def.toLowerCase().includes(needle))
    : entries;

  const jump = (slug: string) => {
    setQ("");
    requestAnimationFrame(() => document.getElementById(`gloss-${slug}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search terms…"
          className="w-full max-w-xs rounded-lg border border-teal-400/15 bg-[var(--field-bg)] px-3 py-1.5 text-sm text-teal-50 placeholder:text-teal-200/30 focus:border-teal-400/40 focus:outline-none"
        />
        <span className="text-xs text-teal-200/50">
          {shown.length === entries.length ? `${entries.length} terms` : `${shown.length} of ${entries.length} terms`}
        </span>
      </div>

      {shown.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-sm text-teal-200/50">
            Nothing matches — but that might mean we&apos;re missing a term worth having. Ask Alfred, and it&apos;ll explain anyway.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((e) => (
            <div key={e.slug} id={`gloss-${e.slug}`} className="scroll-mt-20">
              <Card className="p-4">
              <div className="text-sm font-semibold text-teal-50">{e.term}</div>
              <p className="mt-1 text-sm leading-relaxed text-teal-100/75">{e.def}</p>
              {e.example ? <p className="mt-1.5 text-xs italic leading-relaxed text-teal-200/50">e.g. {e.example}</p> : null}
              {e.related.length ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-teal-200/40">related</span>
                  {e.related.map((r) => (
                    <button
                      key={r.slug}
                      type="button"
                      onClick={() => jump(r.slug)}
                      className="rounded-full border border-teal-400/15 bg-teal-400/[0.04] px-2 py-0.5 text-[10px] text-teal-300/80 transition-colors hover:bg-teal-400/10"
                    >
                      {r.term}
                    </button>
                  ))}
                </div>
              ) : null}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
