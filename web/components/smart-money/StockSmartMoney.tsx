import { Card, Chip } from "@/components/ui";
import Term from "@/components/Term";
import SmartMoneyAvatar from "./SmartMoneyAvatar";
import { fmtUsd } from "@/lib/smart-money/types";
import type { SymbolSmartMoney } from "@/lib/smart-money/queries";

// "Smart money on this stock" — which tracked investors hold or traded THIS name,
// with their face + position, plus aggregate congress/insider activity. Server
// component (only the avatar is client). Renders nothing when there's no activity.
const ACTION_CLS: Record<string, string> = {
  NEW: "text-teal-300",
  ADD: "text-emerald-400",
  TRIM: "text-amber-400",
  HOLD: "text-teal-200/45",
  EXIT: "text-red-400",
};

function HolderTile({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2.5 rounded-lg border border-teal-400/10 bg-teal-400/[0.03] p-2.5">{children}</div>;
}

export default function StockSmartMoney({ sm }: { sm: SymbolSmartMoney }) {
  if (!sm.hasAny) return null;
  const hasFaces = sm.fundHolders.length > 0 || sm.people.length > 0;

  return (
    <Card className="mb-6 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Chip tone="teal">smart money</Chip>
        <span className="text-sm text-teal-200/50">tracked investors in {sm.symbol}</span>
      </div>

      {hasFaces && (
        <div className="grid gap-2 sm:grid-cols-2">
          {sm.fundHolders.map((f, i) => (
            <HolderTile key={`${f.slug}-${f.putCall ?? "x"}-${i}`}>
              <SmartMoneyAvatar name={f.name} avatar={f.avatar} accent={f.accent} className="h-9 w-9 text-xs" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-teal-50">{f.name}</div>
                <div className="truncate text-[11px] text-teal-200/45">{f.firm} · 13F {f.asOf}</div>
              </div>
              <div className="shrink-0 text-right">
                {f.putCall ? (
                  <Term k={f.putCall === "PUT" ? "put-option" : "call-option"} className="!border-b-0">
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        f.putCall === "PUT" ? "border-red-400/30 bg-red-400/15 text-red-300" : "border-sky-400/30 bg-sky-400/15 text-sky-300"
                      }`}
                    >
                      {f.putCall === "PUT" ? "PUT · bearish" : "CALL · bullish"}
                    </span>
                  </Term>
                ) : (
                  <>
                    <div className="text-sm font-semibold tabular-nums text-teal-100/85">{(f.pctOfPort * 100).toFixed(1)}%</div>
                    <div className={`text-[10px] font-semibold uppercase tracking-wider ${ACTION_CLS[f.action] ?? "text-teal-200/45"}`}>{f.action}</div>
                  </>
                )}
              </div>
            </HolderTile>
          ))}

          {sm.people.map((p) => {
            const t = p.trades[0];
            return (
              <HolderTile key={p.slug}>
                <SmartMoneyAvatar name={p.name} avatar={p.avatar} accent={p.accent} className="h-9 w-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-teal-50">{p.name}</div>
                  <div className="truncate text-[11px] text-teal-200/45">{p.role}</div>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      t.side === "BUY" ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-300" : "border-red-400/30 bg-red-400/15 text-red-300"
                    }`}
                  >
                    {t.side}
                  </span>
                  <div className="mt-0.5 text-[10px] text-teal-200/40">
                    {t.amountRange} · {t.txnDate.slice(5)}
                  </div>
                </div>
              </HolderTile>
            );
          })}
        </div>
      )}

      {(sm.congressBuyers > 0 || sm.congressSellers > 0 || sm.insiderBuyers > 0) && (
        <div className={`flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-teal-200/50 ${hasFaces ? "mt-3" : ""}`}>
          {(sm.congressBuyers > 0 || sm.congressSellers > 0) && (
            <span>
              <Term k="congress-trade">Congress</Term> (180d):{" "}
              {sm.congressBuyers > 0 && <b className="text-emerald-300/80">{sm.congressBuyers} bought</b>}
              {sm.congressBuyers > 0 && sm.congressSellers > 0 && " · "}
              {sm.congressSellers > 0 && <b className="text-red-300/80">{sm.congressSellers} sold</b>}
            </span>
          )}
          {sm.insiderBuyers > 0 && (
            <span>
              <Term k="insider">Insiders</Term> (90d): <b className="text-emerald-300/80">{sm.insiderBuyers} bought</b> ~{fmtUsd(sm.insiderBuyValueUsd)}
            </span>
          )}
        </div>
      )}

      <p className="mt-2 text-[10px] text-teal-200/40">
        Disclosed holdings &amp; trades — <Term k="13f">13F</Term> lags ~45 days; colour, not timing.
      </p>
    </Card>
  );
}
