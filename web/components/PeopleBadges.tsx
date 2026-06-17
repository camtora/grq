"use client";
import { useState, useEffect } from "react";
import Avatar from "./Avatar";

// "About us" — the two members as clickable avatars in the Reports header.
// Clicking opens a career summary. The bio is rendered server-side (<Md>) and
// passed in as a node, so this stays a thin client shell around the dialog state.
type Badge = {
  key: string;
  name: string;
  fullName: string;
  title: string;
  photo: string;
  bio: React.ReactNode;
};

export default function PeopleBadges({ people }: { people: Badge[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = people.find((p) => p.key === openKey) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex items-center gap-4">
      <span className="hidden text-xs uppercase tracking-wider text-teal-200/40 sm:inline">About us</span>
      {people.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => setOpenKey(p.key)}
          className="group flex flex-col items-center gap-1 outline-none"
          title={`${p.fullName} — ${p.title}`}
        >
          <Avatar
            src={p.photo}
            name={p.name}
            size="h-11 w-11"
            className="transition-transform group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-teal-400"
          />
          <span className="text-[11px] font-medium text-teal-200/70 group-hover:text-teal-100">{p.name}</span>
        </button>
      ))}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpenKey(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpenKey(null)}
              className="absolute right-4 top-4 text-lg leading-none text-teal-200/50 hover:text-teal-100"
              aria-label="Close"
            >
              ✕
            </button>
            <div className="mb-4 flex items-center gap-4">
              <Avatar src={open.photo} name={open.name} size="h-16 w-16" />
              <div>
                <div className="text-lg font-bold text-teal-50">{open.fullName}</div>
                <div className="text-sm text-teal-200/60">{open.title}</div>
              </div>
            </div>
            {open.bio}
          </div>
        </div>
      )}
    </div>
  );
}
