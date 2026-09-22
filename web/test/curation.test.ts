import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decideRefresh,
  decidePrune,
  decideDailyRefresh,
  type RefreshSignals,
  type PruneSignals,
  type DailyRefreshSignals,
} from "@/agent/curation";
import { REFRESH } from "@/agent/policy";

// The research-refresh materiality gate + pool prune (policy REFRESH, Cam 2026-07-05).
// The two decision functions are pure — this pins the behaviour the Sunday sweep relies
// on so a threshold change can't silently flip the gate open or shut.

const base: RefreshSignals = {
  tier: "candidate",
  watched: false,
  hasDossier: true,
  dossierAgeDays: 5,
  driftBps: 100,
  earnings: false,
  news: false,
  insiderCluster: false,
  crowdSpike: false,
};

describe("decideRefresh — the gate", () => {
  it("skips a quiet, recently-dossiered candidate", () => {
    const d = decideRefresh(base);
    assert.equal(d.refresh, false);
    assert.match(d.reason, /quiet/);
  });

  it("refreshes past the staleness floor no matter how quiet", () => {
    assert.equal(decideRefresh({ ...base, dossierAgeDays: REFRESH.staleMaxDays }).refresh, true);
    assert.equal(decideRefresh({ ...base, dossierAgeDays: REFRESH.staleMaxDays - 1 }).refresh, false);
  });

  it("held/active names get the tighter staleness floor", () => {
    const age = REFRESH.heldStaleMaxDays; // past held floor, under candidate floor
    assert.equal(decideRefresh({ ...base, tier: "candidate", dossierAgeDays: age }).refresh, false);
    assert.equal(decideRefresh({ ...base, tier: "held", dossierAgeDays: age }).refresh, true);
    assert.equal(decideRefresh({ ...base, tier: "active", dossierAgeDays: age }).refresh, true);
  });

  it("price drift trips the gate at the tier's threshold", () => {
    assert.equal(decideRefresh({ ...base, driftBps: REFRESH.driftBps }).refresh, true);
    assert.equal(decideRefresh({ ...base, driftBps: REFRESH.driftBps - 1 }).refresh, false);
    // held has a smaller drift floor
    assert.equal(decideRefresh({ ...base, tier: "held", driftBps: REFRESH.heldDriftBps }).refresh, true);
    assert.equal(decideRefresh({ ...base, tier: "candidate", driftBps: REFRESH.heldDriftBps }).refresh, false);
  });

  it("each material catalyst trips the gate on its own", () => {
    for (const k of ["earnings", "news", "insiderCluster", "crowdSpike"] as const) {
      const d = decideRefresh({ ...base, [k]: true });
      assert.equal(d.refresh, true, `${k} should trip the gate`);
    }
  });

  it("never-researched: tracked → refresh, unwatched candidate → wait (D46)", () => {
    assert.equal(decideRefresh({ ...base, hasDossier: false, dossierAgeDays: null, tier: "held" }).refresh, true);
    assert.equal(decideRefresh({ ...base, hasDossier: false, dossierAgeDays: null, watched: true }).refresh, true);
    const wait = decideRefresh({ ...base, hasDossier: false, dossierAgeDays: null, tier: "candidate", watched: false });
    assert.equal(wait.refresh, false);
    assert.match(wait.reason, /on-demand/);
  });

  it("a null drift never throws and doesn't trip on its own", () => {
    assert.equal(decideRefresh({ ...base, driftBps: null }).refresh, false);
  });
});

const pbase: PruneSignals = {
  status: "CANDIDATE",
  watched: false,
  hasDirective: false,
  hasDossier: true,
  dossierAgeDays: 10,
  addedAgeDays: 90,
  stanceIsBuy: false,
};

describe("decidePrune — the pool prune", () => {
  it("never touches ACTIVE or RETIRED", () => {
    assert.equal(decidePrune({ ...pbase, status: "ACTIVE", dossierAgeDays: 999 }).retire, false);
    assert.equal(decidePrune({ ...pbase, status: "RETIRED", dossierAgeDays: 999 }).retire, false);
  });

  it("retires a stale, unwatched, non-buy candidate", () => {
    assert.equal(decidePrune({ ...pbase, dossierAgeDays: REFRESH.demoteStaleDays }).retire, true);
    assert.equal(decidePrune({ ...pbase, dossierAgeDays: REFRESH.demoteStaleDays - 1 }).retire, false);
  });

  it("keeps anything a human cares about — watched, pinned, or buy-rated", () => {
    const stale = { ...pbase, dossierAgeDays: 999 };
    assert.equal(decidePrune({ ...stale, watched: true }).retire, false);
    assert.equal(decidePrune({ ...stale, hasDirective: true }).retire, false);
    assert.equal(decidePrune({ ...stale, stanceIsBuy: true }).retire, false);
  });

  it("retires a never-opened lead only past the unopened age", () => {
    assert.equal(decidePrune({ ...pbase, hasDossier: false, dossierAgeDays: null, addedAgeDays: REFRESH.demoteUnopenedDays }).retire, true);
    const fresh = decidePrune({ ...pbase, hasDossier: false, dossierAgeDays: null, addedAgeDays: REFRESH.demoteUnopenedDays - 1 });
    assert.equal(fresh.retire, false);
    assert.match(fresh.reason, /new lead/);
  });

  // The bug this pair caused, locked shut (Cam 2026-08-15). The sweep prunes BEFORE it
  // gates, so a prune floor at/above the refresh floor is unreachable: the refresh
  // re-dossiers the name first and resets its age, so it can never grow old enough to
  // prune. Shipped that way (prune 45d vs refresh 28d) and the prune retired NOTHING for
  // six weeks — the pool filled to CANDIDATE_CAP and started rejecting new watches.
  // Assert the ORDERING, not the numbers, so either dial can move freely but not invert.
  it("keeps the prune floor reachable — prune must fire before the refresh resets the clock", () => {
    assert.ok(
      REFRESH.demoteStaleDays < REFRESH.staleMaxDays,
      `demoteStaleDays (${REFRESH.demoteStaleDays}) must stay BELOW staleMaxDays (${REFRESH.staleMaxDays}) — ` +
        `otherwise the weekly refresh re-dossiers a quiet candidate before it can ever be pruned, ` +
        `the prune becomes dead code, and the candidate pool grows until it hits CANDIDATE_CAP.`
    );
    // The same trap for never-dossiered leads: they must be prunable before the gate
    // would blind-dossier them (only watched/prioritized names are dossiered un-asked,
    // and those are kept by the prune anyway — so this just keeps the two dials sane).
    assert.ok(REFRESH.demoteUnopenedDays < REFRESH.staleMaxDays, "demoteUnopenedDays must stay below staleMaxDays");
  });

  // A quiet candidate must actually reach the prune — walk it forward day by day and
  // assert it retires, rather than trusting the constants to be ordered correctly.
  it("a quiet unwatched candidate is reachable by the prune before the refresh floor", () => {
    let retiredAt: number | null = null;
    for (let age = 0; age <= REFRESH.staleMaxDays; age++) {
      if (decidePrune({ ...pbase, dossierAgeDays: age }).retire) {
        retiredAt = age;
        break;
      }
    }
    assert.ok(retiredAt !== null, "a quiet unwatched candidate never retires — the prune is unreachable");
    assert.ok(retiredAt < REFRESH.staleMaxDays, `prunes at ${retiredAt}d, after the ${REFRESH.staleMaxDays}d refresh reset`);
  });
});


describe("decideDailyRefresh — the daily dossier gate (D126b)", () => {
  // Why: daily-refresh queued a ~331k dossier for any tracked name that moved ≥4%, while
  // the weekly gate calls a candidate's move immaterial below 8% — so it re-researched
  // names it had already rated no-buy. 262 such dossiers in 30 days (~87M tokens).
  const cand: DailyRefreshSignals = {
    status: "CANDIDATE",
    held: false,
    watched: false,
    hasStance: true,
    stanceIsBuy: false,
  };

  it("skips an unwatched candidate we have already called below Buy", () => {
    const d = decideDailyRefresh(cand);
    assert.equal(d.refresh, false);
    assert.match(d.reason, /already called below Buy/);
  });

  it("still refreshes it once Alfred rates it a Buy", () => {
    assert.equal(decideDailyRefresh({ ...cand, stanceIsBuy: true }).refresh, true);
  });

  it("never gates a name we have no call on yet", () => {
    assert.equal(decideDailyRefresh({ ...cand, hasStance: false, stanceIsBuy: false }).refresh, true);
  });

  it("never gates an ACTIVE (tradeable) name", () => {
    assert.equal(decideDailyRefresh({ ...cand, status: "ACTIVE" }).refresh, true);
  });

  it("never gates a held name — money at stake outranks the rating", () => {
    const d = decideDailyRefresh({ ...cand, held: true });
    assert.equal(d.refresh, true);
    assert.match(d.reason, /money at stake/);
  });
});

describe("a member's watchlist gets its daily dossier, whatever the rating (Cam, 2026-09-22)", () => {
  // Cam, verbatim: "anything in Graham or I's watch list is there intentionally - regardless
  // of its rating - we're interested in the stock and want Alfred's analysis (ie dossier on
  // it) on a daily basis." Both paths must honour that, so both are pinned here.
  it("daily-refresh never skips a watched name, however badly rated", () => {
    const d = decideDailyRefresh({
      status: "CANDIDATE",
      held: false,
      watched: true,
      hasStance: true,
      stanceIsBuy: false,
    });
    assert.equal(d.refresh, true);
    assert.match(d.reason, /a member watches it/);
  });

  it("the pool prune never retires a watched name either", () => {
    const d = decidePrune({ ...pbase, watched: true, dossierAgeDays: 999, stanceIsBuy: false });
    assert.equal(d.retire, false);
    assert.match(d.reason, /watched by a member/);
  });

  it("nor a watched name that was never opened", () => {
    const d = decidePrune({ ...pbase, watched: true, hasDossier: false, addedAgeDays: 999 });
    assert.equal(d.retire, false);
    assert.match(d.reason, /watched by a member/);
  });
});
