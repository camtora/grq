"use client";

import { useEffect, useState } from "react";

// Client-side filter bar for the /stocks table. The table is server-rendered;
// each <tr> carries data-country/exchange/sector/cap, and this toggles row
// visibility — cheap, no refetch. Section headers hide while a filter is active
// (the filtered view is a flat list).
type Opt = { value: string; label: string };

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Opt[] }) {
  if (options.length === 0) return null;
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="uppercase tracking-wider text-teal-200/40">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-teal-400/20 bg-(--field-bg) px-2 py-1.5 text-sm text-teal-100 outline-none"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function StockFilters({
  countries,
  exchanges,
  sectors,
  caps,
}: {
  countries: Opt[];
  exchanges: Opt[];
  sectors: Opt[];
  caps: Opt[];
}) {
  const [country, setCountry] = useState("");
  const [exchange, setExchange] = useState("");
  const [sector, setSector] = useState("");
  const [cap, setCap] = useState("");
  const [shown, setShown] = useState<number | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>("tr.stock-row"));
    setTotal(rows.length);
    let n = 0;
    for (const row of rows) {
      const ok =
        (!country || row.dataset.country === country) &&
        (!exchange || row.dataset.exchange === exchange) &&
        (!sector || row.dataset.sector === sector) &&
        (!cap || row.dataset.cap === cap);
      row.hidden = !ok;
      // Keep an open expansion row in lockstep with its parent (it's the next sibling).
      const detail = row.nextElementSibling;
      if (detail instanceof HTMLElement && detail.classList.contains("stock-row-detail")) detail.hidden = !ok;
      if (ok) n++;
    }
    const anyFilter = !!(country || exchange || sector || cap);
    document.querySelectorAll<HTMLElement>("tr.section-header").forEach((h) => (h.hidden = anyFilter));
    setShown(n);
  }, [country, exchange, sector, cap]);

  const active = !!(country || exchange || sector || cap);
  const clear = () => {
    setCountry("");
    setExchange("");
    setSector("");
    setCap("");
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-teal-400/10 bg-teal-400/[0.02] px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-teal-200/50">Filter</span>
      <Select label="Country" value={country} onChange={setCountry} options={countries} />
      <Select label="Exchange" value={exchange} onChange={setExchange} options={exchanges} />
      <Select label="Sector" value={sector} onChange={setSector} options={sectors} />
      <Select label="Cap" value={cap} onChange={setCap} options={caps} />
      {shown !== null && (
        <span className="text-xs text-teal-200/40">
          {active ? `${shown} of ${total}` : `${total} names`}
        </span>
      )}
      {active && (
        <button onClick={clear} className="text-xs font-semibold text-teal-300 hover:underline">
          clear
        </button>
      )}
    </div>
  );
}
