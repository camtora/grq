import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { classifyMirrorLag, isSettled } from "../lib/broker/positions";

// NAV INTEGRITY — the test that would have caught 2026-07-29 (D120), and 2026-07-16 before it.
//
// Both halts had the same shape: a NAV snapshot written while the broker mirror still lagged a fill.
// A sale's proceeds hit cash the instant it fills; the sold shares stay marked until reconcile
// catches up minutes later. Snapshot in that window and NAV counts the money twice — $86,795 against
// a real $67,800 on 07-29. checkDrawdown took the max NAV over ALL history, so a two-second
// transient became a PERMANENT high-water mark: the fund read −22.9% off its peak, the kill switch
// engaged, and every re-enable re-killed within two ticks.
//
// D118 diagnosed that exactly ("checkDrawdown takes _max over ALL NavSnapshot history, so that peak
// was permanent") and then fixed everything except it — the repair was to delete the bad rows by
// hand. Six weeks later two ordinary stop-losses wrote a new one. Hand-deletion is not a fix, and
// neither is a `settled: true` that nine call sites have to remember.
//
// So this file locks the three things that make the class impossible:
//   1. the lag classification itself (pure — the arithmetic that decides what we actually hold)
//   2. the READ seam: nothing outside lib/nav-history.ts reads NavSnapshot back
//   3. the WRITE seam: the fill path waits for the mirror on BOTH sides, and the writer nets + stamps
//
// 2 and 3 are source-level, like guardrail-parity.test.ts and for the same reason: the suite is pure
// (no DB, no network), and the question that went unasked for six weeks is answerable in the source.

const WEB = join(import.meta.dirname, "..");
const src = (p: string) => readFileSync(join(WEB, p), "utf8");
const D = (s: string) => new Date(s);

describe("mirror lag — what the fund actually holds while a fill settles", () => {
  it("counts a filled SELL the mirror hasn't absorbed (the double-count that halted the fund)", () => {
    // 07-29: TSM sold at 14:43, mirror last written 14:30 → the 25 shares are still marked.
    const lag = classifyMirrorLag(
      [{ symbol: "TSM", updatedAt: D("2026-07-29T14:30:00Z") }],
      [{ symbol: "TSM", side: "SELL", filledQty: 25, createdAt: D("2026-07-29T14:43:06Z") }],
    );
    assert.equal(lag.unabsorbedSells.get("TSM"), 25);
    assert.equal(isSettled(lag), false);
    assert.equal(isSettled(lag, "TSM"), false);
  });

  it("ignores a SELL the mirror has already absorbed", () => {
    const lag = classifyMirrorLag(
      [{ symbol: "TSM", updatedAt: D("2026-07-29T14:49:00Z") }],
      [{ symbol: "TSM", side: "SELL", filledQty: 25, createdAt: D("2026-07-29T14:43:06Z") }],
    );
    assert.equal(lag.unabsorbedSells.size, 0);
    assert.equal(isSettled(lag), true);
  });

  it("treats a SELL with no position row as absorbed — reconcile DELETES a closed position", () => {
    const lag = classifyMirrorLag([], [{ symbol: "ETN", side: "SELL", filledQty: 11, createdAt: D("2026-07-29T14:43:09Z") }]);
    assert.equal(lag.unabsorbedSells.size, 0);
    assert.equal(isSettled(lag), true, "a name we hold no row for contributes nothing to NAV either way");
  });

  it("sums multiple unabsorbed sells of the same name (the D118 repeat-stop shape)", () => {
    const lag = classifyMirrorLag(
      [{ symbol: "CCO", updatedAt: D("2026-07-16T13:30:00Z") }],
      [
        { symbol: "CCO", side: "SELL", filledQty: 24, createdAt: D("2026-07-16T13:34:00Z") },
        { symbol: "CCO", side: "SELL", filledQty: 24, createdAt: D("2026-07-16T13:35:00Z") },
      ],
    );
    assert.equal(lag.unabsorbedSells.get("CCO"), 48);
  });

  it("flags an unmirrored BUY — NAV understated, the false daily-loss pause (D39)", () => {
    const noRowYet = classifyMirrorLag([], [{ symbol: "GEHC", side: "BUY", filledQty: 25, createdAt: D("2026-07-29T14:02:44Z") }]);
    assert.equal(noRowYet.unabsorbedBuys.has("GEHC"), true);
    assert.equal(isSettled(noRowYet), false);

    const mirrored = classifyMirrorLag(
      [{ symbol: "GEHC", updatedAt: D("2026-07-29T14:09:37Z") }],
      [{ symbol: "GEHC", side: "BUY", filledQty: 25, createdAt: D("2026-07-29T14:02:44Z") }],
    );
    assert.equal(mirrored.unabsorbedBuys.size, 0);
    assert.equal(isSettled(mirrored), true);
  });

  it("scopes settledness per symbol — one lagging name doesn't block an unrelated fill's snapshot", () => {
    const lag = classifyMirrorLag(
      [{ symbol: "TSM", updatedAt: D("2026-07-29T14:30:00Z") }, { symbol: "LIN", updatedAt: D("2026-07-29T14:45:00Z") }],
      [{ symbol: "TSM", side: "SELL", filledQty: 25, createdAt: D("2026-07-29T14:43:06Z") }],
    );
    assert.equal(isSettled(lag, "TSM"), false);
    assert.equal(isSettled(lag, "LIN"), true);
    assert.equal(isSettled(lag, "lin"), true, "symbol match is case-insensitive");
    assert.equal(isSettled(lag), false, "fund-wide, any lagging name makes the moment unsettled");
  });

  it("a fund with nothing in flight is settled", () => {
    assert.equal(isSettled(classifyMirrorLag([{ symbol: "GD", updatedAt: D("2026-07-29T14:00:00Z") }], [])), true);
  });
});

// ── The read seam ──────────────────────────────────────────────────────────────────────────────
// Every read of NavSnapshot must come back through lib/nav-history.ts, which filters `settled`. A
// raw read somewhere else is how a phantom row reaches a mark: checkDrawdown's was one line of
// `_max` with no filter, and it halted the fund twice.
const READ_VERBS = ["findFirst", "findMany", "findUnique", "aggregate", "count", "groupBy"];
const READER = "lib/nav-history.ts";
// Writers + destructive resets, which by definition cannot read a stale row into a decision.
const WRITE_ONLY = new Set(["lib/broker/sim.ts", "prisma/seed.ts", "scripts/relaunch-contributions.ts"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".git", "public"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

/** Strip comments — a file that DESCRIBES the seam (this one, nav-history.ts) must not trip it. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("NAV history reads go through one settled-only seam", () => {
  it("no file outside lib/nav-history.ts reads NavSnapshot rows back", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(WEB)) {
      const rel = relative(WEB, file);
      if (rel === READER || WRITE_ONLY.has(rel)) continue;
      const body = code(readFileSync(file, "utf8"));
      for (const verb of READ_VERBS) {
        if (new RegExp(`navSnapshot\\s*\\.\\s*${verb}\\s*\\(`).test(body)) offenders.push(`${rel} (.${verb})`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `these read NavSnapshot directly instead of via ${READER}: ${offenders.join(", ")}. An unfiltered ` +
        `read can pick up a row written mid-settlement — which is exactly how a two-second phantom NAV ` +
        `became a permanent high-water mark and halted the fund (D118, D120).`,
    );
  });

  it("the seam actually filters on settled", () => {
    const reader = code(src(READER));
    assert.match(reader, /settled:\s*true/, "lib/nav-history.ts must filter settled rows — that IS the seam");
    for (const fn of ["highWaterMarkCents", "lastSettledSnapshotBefore", "settledSnapshotsBetween", "latestSettledSnapshot"]) {
      assert.match(reader, new RegExp(`export async function ${fn}\\b`), `${fn} missing from the seam`);
    }
  });

  it("the drawdown kill reads the mark through the seam, not a raw max", () => {
    const runner = code(src("agent/runner.ts"));
    assert.match(runner, /highWaterMarkCents\s*\(/, "checkDrawdown must take its high-water mark from lib/nav-history.ts");
    assert.doesNotMatch(runner, /_max:\s*\{\s*navCents/, "a raw _max over all NavSnapshot history is the D118/D120 bug");
  });
});

// ── The write seam ─────────────────────────────────────────────────────────────────────────────
describe("a mid-settlement NAV can't be written as a mark", () => {
  it("the IBKR fill path waits for the mirror on BOTH sides", () => {
    const ibkr = code(src("lib/broker/ibkr.ts"));
    // Everything between recording the fill and snapshotting NAV for it — anchored on the CALL, not
    // the import of the same name at the top of the file.
    const snapshotCall = ibkr.indexOf("writeNavSnapshot(`IBKR fill order");
    assert.ok(snapshotCall > 0, "the fill path must still snapshot NAV — find its call site");
    const fillPath = ibkr.slice(ibkr.indexOf("const orderRow = await this.recordFill"), snapshotCall);
    assert.ok(fillPath.length > 0, "could not locate the post-fill reconcile loop");
    assert.doesNotMatch(
      fillPath,
      /side\s*===\s*"SELL"\s*\)\s*break/,
      `the post-fill reconcile loop must not skip SELLs. It did until 2026-07-31, reasoning that "sells ` +
        `reduce/close a position — never understate NAV": true, and beside the point. A sell OVERSTATES ` +
        `NAV (proceeds in cash, shares still marked), and that opt-out wrote the phantom $86,795 peak.`,
    );
    assert.match(fillPath, /isSettled\s*\(\s*await\s+mirrorLag\(\)\s*,\s*sym\s*\)/, "the loop must wait on mirror settledness");
  });

  it("writeNavSnapshot nets off unabsorbed sells and stamps settled", () => {
    const sim = code(src("lib/broker/sim.ts"));
    assert.match(sim, /mirrorLag\s*\(\s*\)/, "the NAV writer must consult the mirror lag");
    assert.match(sim, /unabsorbedSells\.get\(/, "positions must be valued net of sales the mirror hasn't absorbed");
    assert.match(sim, /settled:\s*isSettled\(/, "every snapshot must record whether the mirror was current");
  });
});
