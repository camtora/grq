import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideRefresh, decidePrune, type RefreshSignals, type PruneSignals } from "@/agent/curation";
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
});
