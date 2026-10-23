import PanelHeader from "@/components/PanelHeader";
import Term from "@/components/Term";
import { Card } from "@/components/ui";
import type { FinancialsView } from "@/lib/financials/view";
import { bigMoney, monthLabel } from "@/lib/financials/format";

// D140 display round 5 — "Filings & insiders": the company's OWN people and paperwork. (Outside money —
// tracked funds' 13Fs, Congress — is the Smart Money panel's job; this panel no longer repeats it.)
// Insiders are what they did with their own money in the last 12 months, in dollars, from the
// company's open-market Form 4s (lib/financials/insiders.ts). Filings lead with the latest annual and
// quarterly report, then the other recent ones, each with what it means.

type Company = Extract<FinancialsView, { kind: "company" }>;

const FORM_MEANING: Record<string, string> = {
  "8-K": "something important happened",
  "8-K/A": "a correction to an 8-K",
  "10-Q": "quarterly report",
  "10-Q/A": "a corrected quarterly report",
  "10-K": "annual report",
  "10-K/A": "a corrected annual report",
  "6-K": "an update filed by a foreign company",
  "20-F": "a foreign company's annual report",
  "40-F": "a Canadian company's annual report, filed in the US",
  "S-1": "registering new shares",
  "DEF 14A": "notice of the shareholder meeting",
  "SC 13D": "an investor now owns 5%+ and may push for change",
  "SC 13D/A": "an update from a 5%+ activist holder",
};
const ANNUAL = new Set(["10-K", "40-F", "20-F"]);
const QUARTERLY = new Set(["10-Q"]);

const B = ({ children }: { children: React.ReactNode }) => <strong className="font-semibold text-teal-50">{children}</strong>;

function Insiders({ v }: { v: Company }) {
  const s = v.insiders;
  if (!v.sec) {
    return (
      <p className="text-teal-200/45">
        No US filer we can match for this company. Canadian insiders report on SEDI, which our feed doesn&apos;t cover; Alfred&apos;s research picks them up instead.
      </p>
    );
  }
  if (!s) return <p className="text-teal-200/45">Insider trades not pulled yet for this company; they arrive with the next daily refresh.</p>;
  const none = s.buys.count === 0 && s.sells.count === 0;
  if (none) {
    return (
      <p className="text-teal-200/45">
        {v.sec.crossListed && !v.filings.some((f) => f.form === "10-K" || f.form === "10-Q")
          ? "No insider trades filed in the US. Canadian companies that file a 40-F report their insiders' trades in Canada (SEDI), which our feed doesn't cover."
          : "No open-market insider trades in our feed for the last 12 months."}
      </p>
    );
  }
  return (
    <div>
      <p className="leading-snug text-teal-100/85">
        Over the last 12 months, insiders{" "}
        {s.sells.count > 0 && (
          <>
            <B>sold {bigMoney(s.sells.cents, "USD")}</B> ({s.sells.count} sale{s.sells.count === 1 ? "" : "s"} by {s.sells.people} {s.sells.people === 1 ? "person" : "people"})
          </>
        )}
        {s.sells.count > 0 && " and "}
        {s.buys.count > 0 ? (
          <>
            <strong className="font-semibold text-emerald-400">bought {bigMoney(s.buys.cents, "USD")}</strong> ({s.buys.count} purchase{s.buys.count === 1 ? "" : "s"} by {s.buys.people}{" "}
            {s.buys.people === 1 ? "person" : "people"})
          </>
        ) : (
          <B>bought nothing</B>
        )}
        .
      </p>
      <ul className="mt-2 space-y-1.5 text-xs">
        {s.people.map((p) => (
          <li key={p.name} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              <span className="text-teal-100/85">{p.name}</span>
              {p.title && <span className="block truncate text-[11px] text-teal-200/45">{p.title}</span>}
            </span>
            <span className="shrink-0 text-right tabular-nums">
              {p.soldCents > 0 && <span className="block text-amber-300/90">sold {bigMoney(p.soldCents, "USD")}</span>}
              {p.boughtCents > 0 && <span className="block text-emerald-400">bought {bigMoney(p.boughtCents, "USD")}</span>}
              <span className="block text-[10px] text-teal-200/40">last {monthLabel(p.last)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-teal-200/40">
        Open-market trades only, not awards or option exercises. Executives selling is common (much of their pay comes in stock); buying with their own cash is the
        rarer signal.
      </p>
    </div>
  );
}

function Filing({ f, label }: { f: Company["filings"][number]; label?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-2 text-xs">
      <a href={f.docUrl ?? f.url} target="_blank" rel="noreferrer" className="min-w-0 truncate">
        {label && <span className="text-teal-100/85">{label} </span>}
        <span className="font-mono font-semibold text-teal-200 hover:underline">{f.form}</span>{" "}
        {!label && <span className="text-teal-100/60">{FORM_MEANING[f.form] ?? ""}</span>}
      </a>
      <span className="shrink-0 tabular-nums text-teal-200/40">{f.filedAt}</span>
    </li>
  );
}

function Filings({ v }: { v: Company }) {
  const fs = v.filings;
  if (fs.length === 0) return null;
  const annual = fs.find((f) => ANNUAL.has(f.form));
  const quarterly = fs.find((f) => QUARTERLY.has(f.form));
  const rest = fs.filter((f) => f !== annual && f !== quarterly && !ANNUAL.has(f.form) && !QUARTERLY.has(f.form)).slice(0, 5);
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-teal-200/50">
        <Term k="sec-filing">SEC filings</Term>
      </div>
      {(annual || quarterly) && (
        <ul className="mt-1.5 space-y-1">
          {annual && <Filing f={annual} label="Latest annual report" />}
          {quarterly && <Filing f={quarterly} label="Latest quarterly report" />}
        </ul>
      )}
      {rest.length > 0 && (
        <>
          <div className="mt-2.5 text-[10px] uppercase tracking-wider text-teal-200/40">Other recent filings</div>
          <ul className="mt-1 space-y-1">
            {rest.map((f) => (
              <Filing key={f.url} f={f} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function FilingsInsiders({ v }: { v: Company }) {
  return (
    <div className="flex h-full flex-col space-y-2">
      <PanelHeader fresh="daily">Filings &amp; insiders</PanelHeader>
      <Card className="flex-1 space-y-5 p-5 text-sm">
        <div>
          <div className="mb-1.5 text-xs uppercase tracking-wider text-teal-200/50">
            The company&apos;s own <Term k="insider">insiders</Term>
          </div>
          <Insiders v={v} />
        </div>
        <Filings v={v} />
      </Card>
    </div>
  );
}
