"use client";

import { useEffect, useState } from "react";

// D140 display loop — a members-only switch between candidate layouts of the same block, so Cam and
// Graham can compare them on real names instead of mockups. The pick is remembered per browser
// (localStorage — a convenience, never state anyone else needs). Removed once a layout is chosen.

export type LayoutOption = { key: string; label: string; node: React.ReactNode };

export default function LayoutSwitch({ options, initial, storeKey }: { options: LayoutOption[]; initial: string; storeKey: string }) {
  const STORE = storeKey; // one key per block on trial, so each pick is remembered separately
  const [pick, setPick] = useState(initial);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE);
      if (saved && options.some((o) => o.key === saved)) setPick(saved);
    } catch {
      /* private window / blocked storage: the default layout is fine */
    }
  }, [options, STORE]);
  const choose = (k: string) => {
    setPick(k);
    try {
      localStorage.setItem(STORE, k);
    } catch {
      /* ignore */
    }
  };
  const current = options.find((o) => o.key === pick) ?? options[0];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1 text-[10px]">
        <span className="mr-1 uppercase tracking-wider text-amber-300/80" title="Trying out layouts — pick the one you like and tell Claude. Only members see this switch.">
          Layout trial
        </span>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => choose(o.key)}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${
              current.key === o.key ? "bg-amber-400/15 text-amber-300" : "text-teal-200/45 hover:text-teal-200/80"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {current.node}
    </div>
  );
}
