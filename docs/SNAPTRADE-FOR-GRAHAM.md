# Show your accounts in GRQ — a 10-minute setup

Hey Graham — this is **optional**. It lets your personal brokerage holdings (your TD
TFSA, or anything else) show up in GRQ on the **Accounts** page, right beside the fund,
with each holding linking to its GRQ research page. Cam's already wired up; this is the
same thing for you.

You only ever do this once.

---

## First, the part that matters: GRQ *cannot* trade these accounts

This is **visibility only**. GRQ shows your holdings and that's it. It can never buy, sell,
or move anything in your account. That's locked three ways:

1. The connection is **read-only at the source** — SnapTrade (the service in the middle)
   refuses any trade on it. Not a setting we can fluke; it's how the connection is created.
2. GRQ's trading code physically can't reach this data — it lives in a separate, read-only
   corner of the app.
3. GRQ never sees your TD password. You log into TD on TD's own page; GRQ only ever gets
   read access to the *numbers*.

You can unlink anytime (see the end). Heads-up on the flip side: **Cam will see your
holdings, and you'll see his** — that mutual visibility is the whole point of the page.

---

## What you'll need

- ~10 minutes.
- Your TD Direct Investing login (or whatever brokerage you want to show).
- A way to send Cam two values **privately** (text, Signal, 1Password — not a public
  channel). One of them is a secret.

---

## The steps

### 1. Make a SnapTrade account
Go to **https://dashboard.snaptrade.com** and sign up (free for personal use). SnapTrade is
the read-only middleman that talks to your brokerage so GRQ doesn't have to.

### 2. Connect your brokerage *inside SnapTrade*
In the SnapTrade dashboard, connect your brokerage — pick **TD Direct Investing**, and log in
with your normal TD credentials when it asks. This is the only hands-on step, and you do it on
TD's / SnapTrade's pages, never in GRQ.

> Honest caveat: TD's SnapTrade connection is fairly new ("beta"), so it can occasionally be
> flaky or need a reconnect. If your holdings ever go stale, just reconnect here in SnapTrade —
> nothing to do in GRQ. Data refreshes about once a day.

### 3. Grab your two keys
In the SnapTrade dashboard, find your API keys. There are two:

- **Client ID** — starts with `PERS-` (e.g. `PERS-XXXXXXXX`)
- **Consumer Key / Secret** — a long random string

That's everything. (You do *not* need to dig up any other "user secret" — for a personal
SnapTrade account those two are all GRQ needs.)

### 4. Send both to Cam, privately
Send Cam the **Client ID** and the **Consumer Key** over a private channel. The Consumer Key
is a password-grade secret, so don't post it anywhere public. If you ever want to revoke it,
SnapTrade lets you regenerate it (and Cam can swap the new one in).

---

## What happens next (Cam's side)

Cam drops your two keys into GRQ's config and restarts the web service — **no app rebuild**.
Within a minute your accounts show up on the Accounts page (click your avatar, top-right).
Both of you will see both accounts.

---

## FAQ

**Can GRQ or the trading agent buy/sell in my account?**
No. Read-only, three independent locks. It's a dashboard, not a hand on the wheel.

**Does Cam see my balances and holdings?**
Yes — both members see both accounts. That mutual transparency is the point. If you're not
comfortable with that, just don't set this up; nothing else in GRQ changes.

**What brokerages work?**
TD Direct Investing plus most major ones (Questrade, Wealthsimple, RBC, etc.). One personal
SnapTrade account can hold several.

**How do I unlink later?**
Two ways, both reversible: disconnect the brokerage inside SnapTrade (kills the data feed at
the source), and/or hit **Unlink** on GRQ's Accounts page (wipes GRQ's local copy). Either
way, no trace and you can redo it whenever.

**Is this costing anything?**
Personal SnapTrade use is free within its connection limits — plenty for one or two accounts.

---

*Questions → ask Cam. The whole thing is reversible, so there's no way to break anything.*
