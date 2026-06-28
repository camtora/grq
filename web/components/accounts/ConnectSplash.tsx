import { Card } from "@/components/ui";

const STEP = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-teal-400/30 bg-teal-400/10 text-xs font-bold text-teal-200";

/** The guided "wire your accounts" splash for a member who hasn't set up SnapTrade.
 *  Keys stay in env, so the last step is "send them to Cam" — he drops them in and
 *  the holdings appear (no rebuild). Read-only throughout. */
export default function ConnectSplash() {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none">👋</span>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-teal-50">See your own holdings here</h3>
          <p className="mt-1 max-w-2xl text-sm text-teal-200/60">
            Link your brokerage (TD or any other), <span className="font-semibold text-teal-200/80">read-only</span>,
            and your personal holdings show up beside the fund — each linked to GRQ&apos;s research, with GRQ&apos;s call
            stamped on it. GRQ can <span className="font-semibold text-teal-200/80">never trade these</span>; it&apos;s a
            window, not a hand on the wheel.
          </p>

          <ol className="mt-5 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className={STEP}>1</span>
              <span className="pt-0.5 text-teal-100/80">
                Make a free account at{" "}
                <a
                  href="https://dashboard.snaptrade.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-teal-300 hover:underline"
                >
                  SnapTrade&nbsp;↗
                </a>{" "}
                — the read-only middleman that talks to your brokerage so GRQ doesn&apos;t have to.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className={STEP}>2</span>
              <span className="pt-0.5 text-teal-100/80">
                Inside SnapTrade, connect your brokerage — pick <span className="font-semibold">TD Direct Investing</span>{" "}
                and log in once with your normal TD credentials. (This is the only hands-on step, and it happens on
                TD&apos;s / SnapTrade&apos;s pages — never in GRQ.)
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className={STEP}>3</span>
              <span className="pt-0.5 text-teal-100/80">
                Grab your two keys — a <span className="font-semibold">Client ID</span> starting{" "}
                <code className="rounded bg-teal-400/10 px-1 text-teal-200">PERS-</code> and a{" "}
                <span className="font-semibold">Consumer Key</span> — and send them to{" "}
                <span className="font-semibold text-teal-200/80">Cam</span> privately.
              </span>
            </li>
          </ol>

          <p className="mt-5 text-xs text-teal-200/40">
            Cam drops them in and your accounts appear here within a minute — no app update needed. Heads-up: once
            you&apos;re connected, Cam will see your holdings and you&apos;ll see his — that mutual view is the point.
          </p>
        </div>
      </div>
    </Card>
  );
}
