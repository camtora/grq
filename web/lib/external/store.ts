// NB: no `import "server-only"` here — the agent runner (a plain tsx process, not Next)
// imports this for the nightly accounts sync, and `server-only` isn't resolvable there
// (it crash-loops the agent). This module is still only ever imported server-side.
import { prisma } from "@/lib/db";
import { memberKeyForEmail } from "@/lib/users";
import { bareTicker } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { toCadCents, usdCadRate } from "@/lib/fx";
import {
  type SnaptradePartner,
  listSnaptradeUsers,
  readOnlyConnectUrl,
  listSnaptradeAccounts,
  listSnaptradePositions,
} from "./snaptrade";

// ── per-member SnapTrade credentials (Personal keys) ──────────────────────────
// Cam and Graham each have their OWN SnapTrade *Personal* account, so each member
// resolves to a distinct set of env values (Graham's suffixed `_GRAHAM`, optional
// until he sets his up). A Personal key is pre-provisioned with exactly one user
// (userId = the SnapTrade login email) — we do NOT register users (error 1012).
// The three values per member: clientId + consumerKey (partner signing) +
// userSecret (the user's read-scoped data token). userId is auto-discovered via
// listSnaptradeUsers (or pinned with SNAPTRADE_USER_ID[_GRAHAM]). The userSecret
// stays in env — never in the DB.
type MemberCreds = { partner: SnaptradePartner; userSecret: string; userIdOverride: string | null };

async function credsFor(email: string): Promise<MemberCreds | null> {
  // Self-served DB keys win; env is the fallback. The env keys belong to a SPECIFIC named
  // person — Cam (unsuffixed) and Graham (`_GRAHAM`) — so the env fallback is scoped to that
  // person ONLY. Anyone else (a third person / viewer like Jose) MUST have their own
  // ExternalCredential row; they never inherit Cam's key (Cam 2026-06-29).
  const row = await prisma.externalCredential.findUnique({ where: { email } }).catch(() => null);
  const key = memberKeyForEmail(email); // "cam" | "graham" | null
  const env = (name: string): string | undefined =>
    key === "graham" ? process.env[`${name}_GRAHAM`] : key === "cam" ? process.env[name] : undefined;
  const clientId = row?.clientId || env("SNAPTRADE_CLIENT_ID");
  const consumerKey = row?.consumerKey || env("SNAPTRADE_CONSUMER_KEY");
  const userSecretSrc = row?.userSecret || env("SNAPTRADE_USER_SECRET");
  const userIdOverride = env("SNAPTRADE_USER_ID") || null;
  if (clientId && consumerKey) {
    // SnapTrade Personal keys: the single auto-provisioned user's read token IS the
    // consumer secret (verified 2026-06-28 — it pulled Cam's TD TFSA). So the two
    // keys alone are enough; default the userSecret to the consumer secret unless an
    // explicit one is set. (A developer/partner key would need a real per-user secret.)
    return { partner: { clientId, consumerKey }, userSecret: userSecretSrc || consumerKey, userIdOverride };
  }
  return null;
}

/** Is SnapTrade fully configured for THIS member (DB keys or env)? */
export async function snaptradeConfiguredFor(email: string): Promise<boolean> {
  return (await credsFor(email)) !== null;
}

/** Save a member's own SnapTrade Personal-key credentials (self-serve, via the UI),
 *  then pull their accounts so holdings show up immediately. Returns the account
 *  count, or throws if the keys don't work (so the UI can report it). */
export async function saveMemberKeys(
  email: string,
  clientId: string,
  consumerKey: string,
  userSecret?: string,
): Promise<number> {
  const data = {
    clientId: clientId.trim(),
    consumerKey: consumerKey.trim(),
    userSecret: userSecret?.trim() || null,
  };
  await prisma.externalCredential.upsert({ where: { email }, create: { email, ...data }, update: data });
  try {
    return await syncMember(email);
  } catch (e) {
    // Keys saved but didn't authenticate — drop them so the member isn't left in a
    // half-connected state, and surface a CLEAN reason (the SnapTrade SDK error dumps
    // response headers into .message; take just the first line + a friendly hint).
    await prisma.externalCredential.delete({ where: { email } }).catch(() => {});
    await prisma.externalUser.deleteMany({ where: { email } }).catch(() => {});
    const first = (e instanceof Error ? e.message : "").split("\n")[0].trim();
    const hint = /401|403|signature|unauthor|invalid/i.test(first)
      ? "the Client ID or Consumer Key was rejected — double-check both (Consumer Key, not the userId)."
      : first || "double-check the Client ID and Consumer Key.";
    throw new Error(`Those keys didn't connect: ${hint}`);
  }
}

/** Resolve the SnapTrade identity to call the API with: the partner (signing
 *  keys), the userId (env-pinned, cached, or auto-discovered from the Personal
 *  key's single user), and the userSecret (from env). Caches the userId. */
async function resolveUser(
  email: string,
): Promise<{ partner: SnaptradePartner; userId: string; userSecret: string }> {
  const creds = await credsFor(email);
  if (!creds) throw new Error("SnapTrade is not configured for this member yet.");

  let userId = creds.userIdOverride;
  if (!userId) {
    const cached = await prisma.externalUser.findUnique({ where: { email } });
    userId = cached?.snaptradeUserId ?? null;
  }
  if (!userId) {
    const users = await listSnaptradeUsers(creds.partner);
    userId = users[0] ?? null;
    if (!userId) throw new Error("No SnapTrade user is provisioned for these keys.");
  }
  await prisma.externalUser.upsert({
    where: { email },
    create: { email, snaptradeUserId: userId },
    update: { snaptradeUserId: userId },
  });
  return { partner: creds.partner, userId, userSecret: creds.userSecret };
}

// ── small safe getters for SnapTrade's loosely-typed nested JSON ──────────────
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
/** Dollars (float, as SnapTrade reports) → integer cents. One rounding, at ingest. */
function toCents(dollars: unknown): number {
  return Math.round(num(dollars) * 100);
}
/** Exact units → a trimmed display string (never math'd downstream). */
function qtyString(units: number): string {
  if (Number.isInteger(units)) return String(units);
  return parseFloat(units.toFixed(6)).toString();
}

/** Build the read-only Connection Portal URL — used only for the INITIAL brokerage
 *  connect / a reconnect (the steady state is a backend read). Read-only at the
 *  source via connectionType "read". */
export async function buildConnectUrl(email: string, origin: string): Promise<string> {
  const { partner, userId, userSecret } = await resolveUser(email);
  const dark = memberKeyForEmail(email) === "graham"; // Graham runs dark theme
  return readOnlyConnectUrl(partner, {
    userId,
    userSecret,
    customRedirect: `${origin}/accounts?connected=1`,
    darkMode: dark,
  });
}

// ── sync (SnapTrade → DB) ─────────────────────────────────────────────────────

type ParsedHolding = {
  symbol: string;
  description: string | null;
  qty: string;
  priceCents: number;
  marketValueCents: number;
  currency: string;
  openPnlCents: number | null;
};

function parsePositions(rows: unknown[], acctCurrency: string): ParsedHolding[] {
  const out: ParsedHolding[] = [];
  for (const row of rows) {
    const p = obj(row);
    const uni = obj(p.symbol).symbol ? obj(obj(p.symbol).symbol) : obj(p.symbol);
    const ticker = str(uni.symbol) ?? str(uni.raw_symbol) ?? str(p.symbol);
    if (!ticker) continue;
    const currency = str(obj(uni.currency).code) ?? acctCurrency;
    const units = num(p.units) || num(p.fractional_units);
    const price = num(p.price);
    out.push({
      symbol: ticker.toUpperCase(),
      description: str(uni.description),
      qty: qtyString(units),
      priceCents: toCents(price),
      marketValueCents: Math.round(price * units * 100),
      currency,
      openPnlCents: p.open_pnl == null ? null : toCents(p.open_pnl),
    });
  }
  return out;
}

/** Pull the member's accounts + holdings from SnapTrade and mirror them locally.
 *  Read-only end to end. Returns the number of accounts synced. */
export async function syncMember(email: string): Promise<number> {
  const { partner, userId, userSecret } = await resolveUser(email);
  const accounts = await listSnaptradeAccounts(partner, { userId, userSecret });

  const seenIds: string[] = [];
  for (const raw of accounts) {
    const a = obj(raw);
    const id = str(a.id);
    if (!id) continue;
    seenIds.push(id);

    const balance = obj(obj(a.balance).total);
    const currency = str(balance.currency) ?? "CAD";
    const auth = a.brokerage_authorization;
    const authorizationId = str(auth) ?? str(obj(auth).id);

    await prisma.externalAccount.upsert({
      where: { id },
      create: {
        id,
        ownerEmail: email,
        authorizationId,
        institution: str(a.institution_name) ?? "Brokerage",
        name: str(a.name) ?? "Account",
        numberMasked: str(a.number),
        accountType: str(obj(a.meta).type) ?? str(a.raw_type),
        currency,
        totalValueCents: toCents(balance.amount),
        cashCents: toCents(a.cash),
      },
      update: {
        authorizationId,
        institution: str(a.institution_name) ?? "Brokerage",
        name: str(a.name) ?? "Account",
        numberMasked: str(a.number),
        accountType: str(obj(a.meta).type) ?? str(a.raw_type),
        currency,
        totalValueCents: toCents(balance.amount),
        cashCents: toCents(a.cash),
        syncedAt: new Date(),
        disabled: false,
      },
    });

    // Replace holdings wholesale so closed positions disappear.
    let positions: unknown[] = [];
    try {
      positions = await listSnaptradePositions(partner, { userId, userSecret, accountId: id });
    } catch {
      // A disabled/broken connection still returns the account; flag it, keep last holdings.
      await prisma.externalAccount.update({ where: { id }, data: { disabled: true } });
      continue;
    }
    const holdings = parsePositions(positions, currency);
    await prisma.$transaction([
      prisma.externalHolding.deleteMany({ where: { accountId: id } }),
      ...(holdings.length
        ? [
            prisma.externalHolding.createMany({
              data: holdings.map((h) => ({ ...h, accountId: id })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  // Drop accounts that vanished from SnapTrade (e.g. disconnected).
  await prisma.externalAccount.deleteMany({
    where: { ownerEmail: email, id: { notIn: seenIds.length ? seenIds : ["__none__"] } },
  });

  return seenIds.length;
}

/** Sync a member's accounts only if SnapTrade is configured for them. Used by the
 *  passive auto-sync on page load, so it stays a pure backend read. */
export async function syncMemberIfConnected(
  email: string,
): Promise<{ configured: boolean; count: number }> {
  if (!(await snaptradeConfiguredFor(email))) return { configured: false, count: 0 };
  const count = await syncMember(email);
  return { configured: true, count };
}

/** Sync EVERY connected member's accounts (the nightly background refresh, so holdings —
 *  especially share counts after a member trades — stay current without anyone opening the
 *  app). Best-effort per member; one member's failure never blocks the others. Returns the
 *  per-member counts. (Intraday VALUE is already live via accountsForMembers' quote mark;
 *  this keeps QUANTITIES honest.) */
export async function syncAllConnected(emails: string[]): Promise<{ email: string; count: number }[]> {
  const out: { email: string; count: number }[] = [];
  for (const email of emails) {
    try {
      const { configured, count } = await syncMemberIfConnected(email);
      if (configured) out.push({ email, count });
    } catch {
      // skip — a broken connection shouldn't stall the rest
    }
  }
  return out;
}

/** Write today's daily value snapshot (one row per member, total in CAD) — the forward-only
 *  time-series behind the portfolio day-change tile. Called once/day by the nightly sync AFTER
 *  syncAllConnected, so it captures the freshly-synced (≈ prior-close) value as today's baseline.
 *  `dateStr` = the ET date "YYYY-MM-DD". Idempotent (upsert on owner+date). Best-effort. */
export async function snapshotExternalValues(emails: string[], dateStr: string): Promise<number> {
  const fx = await usdCadRate().catch(() => null);
  const views = await accountsForMembers(emails);
  let written = 0;
  for (const v of views) {
    if (!v.connected) continue;
    const totalCadCents = v.accounts.reduce((s, a) => s + toCadCents(a.totalValueCents, a.currency, fx), 0);
    if (totalCadCents <= 0) continue;
    await prisma.externalDailyValue
      .upsert({
        where: { ownerEmail_date: { ownerEmail: v.email, date: dateStr } },
        create: { ownerEmail: v.email, date: dateStr, totalCadCents },
        update: { totalCadCents },
      })
      .then(() => {
        written += 1;
      })
      .catch(() => {});
  }
  return written;
}

/** The most recent daily-value baseline for a member (the latest snapshot ≤ today) — the
 *  anchor a live total is compared against for the day-change tile. Null until the first
 *  nightly snapshot has run. */
export async function externalDayBaselineCadCents(email: string): Promise<number | null> {
  const row = await prisma.externalDailyValue
    .findFirst({ where: { ownerEmail: email }, orderBy: { date: "desc" } })
    .catch(() => null);
  return row?.totalCadCents ?? null;
}

/** Forget a member's external data locally (privacy / unlink). For Personal keys
 *  we do NOT delete the SnapTrade user — it's the member's own auto-provisioned
 *  account and lives independent of GRQ; we just drop our mirror + cached userId. */
export async function disconnectMember(email: string): Promise<void> {
  // ExternalAccount + ExternalHolding cascade off ExternalUser. Also drop any
  // self-served keys so "Unlink" fully removes the member from the loop.
  await prisma.externalCredential.deleteMany({ where: { email } });
  await prisma.externalUser.deleteMany({ where: { email } });
  await prisma.externalAccount.deleteMany({ where: { ownerEmail: email } });
}

// ── read model (DB → page) ────────────────────────────────────────────────────

export type HoldingView = {
  symbol: string;
  dossierHref: string;
  description: string | null;
  qty: string;
  priceCents: number;
  marketValueCents: number;
  currency: string;
  openPnlCents: number | null;
};

export type AccountView = {
  id: string;
  institution: string;
  name: string;
  numberMasked: string | null;
  accountType: string | null;
  currency: string;
  totalValueCents: number;
  cashCents: number;
  disabled: boolean;
  syncedAt: string;
  holdings: HoldingView[];
};

export type MemberAccountsView = {
  email: string;
  connected: boolean;
  accounts: AccountView[];
};

/** A CAD holding links to its `.TO` dossier (so untracked TSX names resolve to a
 *  Canadian quote), a non-CAD holding to the bare US ticker. Tracked names
 *  canonicalize either way on the stock page. */
function dossierHrefFor(symbol: string, currency: string): string {
  return `/stocks/${encodeURIComponent(quoteSymFor(symbol, currency))}`;
}

/** The symbol our quote feed knows this holding by: CAD names resolve to `.TO`, US names
 *  stay bare (same convention as the dossier link + the universe). */
function quoteSymFor(symbol: string, currency: string): string {
  const bare = bareTicker(symbol);
  return currency.toUpperCase() === "CAD" ? `${bare}.TO` : bare;
}

/** All members' external accounts (Cam & Graham both see both). `emails` is the
 *  full member roster; a member with no connection still appears (connected:false). */
export async function accountsForMembers(emails: string[]): Promise<MemberAccountsView[]> {
  const users = await prisma.externalUser.findMany({
    where: { email: { in: emails } },
    select: { email: true },
  });
  const connected = new Set(users.map((u) => u.email));

  const accounts = await prisma.externalAccount.findMany({
    where: { ownerEmail: { in: emails } },
    orderBy: [{ institution: "asc" }, { name: "asc" }],
    include: { holdings: { orderBy: { marketValueCents: "desc" } } },
  });

  // Mark holdings to OUR live quote feed (FMP, DB-cached) so values + net worth move
  // intraday — SnapTrade gives us quantities + cost, the live price is ours. Holdings keep
  // their last-synced price as the fallback when we have no quote (illiquid / untracked).
  const quoteSyms = Array.from(
    new Set(accounts.flatMap((a) => a.holdings.map((h) => quoteSymFor(h.symbol, h.currency)))),
  );
  const quotes = quoteSyms.length ? await getQuotes(quoteSyms).catch(() => new Map()) : new Map();

  return emails.map((email) => ({
    email,
    connected: connected.has(email),
    accounts: accounts
      .filter((a) => a.ownerEmail === email)
      .map((a) => {
        const holdings = a.holdings.map((h) => {
          const live = quotes.get(quoteSymFor(h.symbol, h.currency).toUpperCase());
          const units = Number(h.qty);
          // Re-mark only when we have a live price AND a parseable share count; else keep sync values.
          if (live && Number.isFinite(units) && units !== 0) {
            const priceCents = live.midCents;
            const marketValueCents = Math.round(units * priceCents);
            // Preserve cost basis: stored openPnl = storedMV − cost ⇒ cost = storedMV − storedOpenPnl.
            const openPnlCents = h.openPnlCents == null ? null : marketValueCents - (h.marketValueCents - h.openPnlCents);
            return { ...h, priceCents, marketValueCents, openPnlCents };
          }
          return h;
        });
        // Account value = cash + the (now live) holdings. Net worth follows automatically.
        const holdingsValue = holdings.reduce((s, h) => s + h.marketValueCents, 0);
        return {
          id: a.id,
          institution: a.institution,
          name: a.name,
          numberMasked: a.numberMasked,
          accountType: a.accountType,
          currency: a.currency,
          totalValueCents: a.cashCents + holdingsValue,
          cashCents: a.cashCents,
          disabled: a.disabled,
          syncedAt: a.syncedAt.toISOString(),
          holdings: holdings.map((h) => ({
            symbol: h.symbol,
            dossierHref: dossierHrefFor(h.symbol, h.currency),
            description: h.description,
            qty: h.qty,
            priceCents: h.priceCents,
            marketValueCents: h.marketValueCents,
            currency: h.currency,
            openPnlCents: h.openPnlCents,
          })),
        };
      }),
  }));
}
