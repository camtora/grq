import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/session";
import { memberEmails } from "@/lib/users";
import { personByEmail } from "@/lib/people";
import { money, fmtWhen } from "@/lib/money";
import { PageHeader, Card, Chip, EmptyState } from "@/components/ui";
import Avatar from "@/components/Avatar";
import MyAccountControls from "@/components/accounts/MyAccountControls";
import {
  accountsForMembers,
  snaptradeConfiguredFor,
  type MemberAccountsView,
  type AccountView,
} from "@/lib/external/store";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await getSession();
  if (!session || session.role !== "member") {
    return (
      <main>
        <PageHeader title="Accounts" />
        <EmptyState
          title="Members only"
          body="Personal brokerage accounts are visible to fund members."
        />
      </main>
    );
  }

  const me = session.email;
  const everyone = memberEmails();
  const emails = [me, ...everyone.filter((e) => e !== me)];
  const views = await accountsForMembers(emails);

  return (
    <main>
      <Link href="/" className="text-xs text-teal-300 hover:underline">
        ← today
      </Link>
      <PageHeader
        title="Accounts"
        sub="Personal brokerage accounts — Cam &amp; Graham, side-by-side with the fund."
      />

      {/* The guardrail, stated plainly. */}
      <Card className="mb-7 flex items-start gap-3 border-teal-400/20 bg-teal-400/[0.06] p-4">
        <span className="text-base leading-none">🔒</span>
        <div className="text-sm text-teal-100/80">
          <span className="font-semibold text-teal-50">Visibility only.</span> GRQ can&apos;t
          trade these accounts — the connection is <span className="font-semibold">read-only at the source</span>,
          kept entirely separate from the fund&apos;s trading. It&apos;s here so you can see what
          you each hold outside the fund, and jump to the research on any name.
        </div>
      </Card>

      <div className="space-y-9">
        {views.map((v) => (
          <MemberSection
            key={v.email}
            view={v}
            isSelf={v.email === me}
            configured={snaptradeConfiguredFor(v.email)}
          />
        ))}
      </div>
    </main>
  );
}

function totalsByCurrency(accounts: AccountView[]): string {
  const by = new Map<string, number>();
  for (const a of accounts) by.set(a.currency, (by.get(a.currency) ?? 0) + a.totalValueCents);
  return [...by.entries()].map(([cur, cents]) => money(cents, cur)).join(" · ");
}

function MemberSection({
  view,
  isSelf,
  configured,
}: {
  view: MemberAccountsView;
  isSelf: boolean;
  configured: boolean;
}) {
  const person = personByEmail(view.email);
  const name = person?.name ?? view.email;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar src={person?.photo ?? null} name={name} size="h-9 w-9" />
          <div>
            <div className="flex items-center gap-2 font-semibold text-teal-50">
              {name}
              {isSelf ? <Chip tone="dim">you</Chip> : null}
            </div>
            {view.accounts.length > 0 ? (
              <div className="text-xs text-teal-200/50 tabular-nums">
                {totalsByCurrency(view.accounts)} ·{" "}
                {view.accounts.length} account{view.accounts.length === 1 ? "" : "s"}
              </div>
            ) : (
              <div className="text-xs text-teal-200/40">No holdings yet</div>
            )}
          </div>
        </div>
        {isSelf ? (
          <Suspense fallback={null}>
            <MyAccountControls configured={configured} hasAccounts={view.accounts.length > 0} />
          </Suspense>
        ) : null}
      </div>

      {view.accounts.length === 0 ? (
        <Card className="p-5 text-sm text-teal-200/50">
          {!configured
            ? isSelf
              ? "Add your SnapTrade keys to link your brokerage — then your holdings appear here, read-only."
              : `${name} hasn't set up SnapTrade yet.`
            : isSelf
              ? "Link your TD account in SnapTrade (or hit “Connect a brokerage”) and your holdings show up here automatically."
              : `${name} hasn't linked a brokerage yet.`}
        </Card>
      ) : (
        <div className="space-y-4">
          {view.accounts.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </div>
      )}
    </section>
  );
}

function AccountCard({ account: a }: { account: AccountView }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-400/10 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-teal-50">{a.institution}</span>
          <span className="text-teal-200/60">{a.name}</span>
          {a.accountType ? <Chip tone="teal">{a.accountType}</Chip> : null}
          {a.numberMasked ? (
            <span className="text-xs text-teal-200/40 tabular-nums">{a.numberMasked}</span>
          ) : null}
          {a.disabled ? <Chip tone="red">reconnect needed</Chip> : null}
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums text-teal-50">
            {money(a.totalValueCents, a.currency)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-teal-200/40">
            updated {fmtWhen(new Date(a.syncedAt))}
          </div>
        </div>
      </div>

      {a.holdings.length === 0 ? (
        <div className="px-5 py-4 text-sm text-teal-200/40">No holdings reported.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-teal-200/40">
              <th className="px-5 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
              <th className="px-5 py-2 text-right font-medium">Unrealized</th>
            </tr>
          </thead>
          <tbody>
            {a.holdings.map((h) => (
              <tr key={h.symbol} className="border-t border-teal-400/[0.06] hover:bg-teal-400/[0.04]">
                <td className="px-5 py-2">
                  <Link href={h.dossierHref} className="font-semibold text-teal-200 hover:underline">
                    {h.symbol}
                  </Link>
                </td>
                <td className="max-w-[18rem] truncate px-3 py-2 text-teal-200/60" title={h.description ?? ""}>
                  {h.description ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-teal-200/80">{h.qty}</td>
                <td className="px-3 py-2 text-right tabular-nums text-teal-200/80">
                  {money(h.priceCents, h.currency)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-50">
                  {money(h.marketValueCents, h.currency)}
                </td>
                <td className="px-5 py-2 text-right tabular-nums">
                  {h.openPnlCents == null ? (
                    <span className="text-teal-200/30">—</span>
                  ) : (
                    <span className={h.openPnlCents >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {money(h.openPnlCents, h.currency)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
