import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideDemote, capRejectionReason, type DemoteSignals } from "@/agent/demote";
import { personByName } from "@/lib/people";
import { SELF_INVEST } from "@/agent/policy";
import { BENCHMARK } from "@/lib/universe";

// Agent self-demotion (D126). The agent may hand back a universe slot it isn't using,
// but never one a human staked a claim to. These rules are the whole safety story, so
// they're pinned here: if a future change lets the agent demote a name Cam or Graham
// added, is watching, pinned, or that the fund actually HOLDS, the build fails.

// A dead slot: ACTIVE, nobody's, nothing in it.
const dead: DemoteSignals = {
  status: "ACTIVE",
  isBenchmark: false,
  humanAdded: false,
  watchers: 0,
  pinned: false,
  heldQty: 0,
  recentDemotes: 0,
};

describe("decideDemote — the slot the agent may reclaim", () => {
  it("frees an unheld, unwatched, agent-added ACTIVE name", () => {
    const d = decideDemote(dead);
    assert.equal(d.demote, true);
    assert.match(d.reason, /dead slot/);
  });

  it("frees a seed-library name (Cam 2026-09-22: seed was a bootstrap list, not an endorsement)", () => {
    // Provenance is resolved by personByName, so a seed row arrives here humanAdded:false.
    assert.equal(personByName("seed-2026-06-12"), null);
    assert.equal(decideDemote({ ...dead, humanAdded: false }).demote, true);
  });

  it("only ever demotes — a CANDIDATE or RETIRED name is not its business", () => {
    for (const status of ["CANDIDATE", "RETIRED"] as const) {
      const d = decideDemote({ ...dead, status });
      assert.equal(d.demote, false, `${status} must be refused`);
      assert.match(d.reason, /not ACTIVE/);
    }
  });
});

describe("decideDemote — the human-claim guards", () => {
  // Each of these alone must be enough to stop the agent. Table-driven so adding a
  // claim signal without a guard is a visible omission.
  const claims: [string, Partial<DemoteSignals>, RegExp][] = [
    ["a member added it", { humanAdded: true }, /member added this name/],
    ["a member is watching it", { watchers: 1 }, /watching it/],
    ["several members are watching it", { watchers: 2 }, /2 members are watching/],
    ["a member pinned it", { pinned: true }, /PINNED/],
    ["it is the benchmark", { isBenchmark: true }, new RegExp(BENCHMARK)],
  ];

  for (const [label, signal, expected] of claims) {
    it(`refuses when ${label}`, () => {
      const d = decideDemote({ ...dead, ...signal });
      assert.equal(d.demote, false);
      assert.match(d.reason, expected);
    });
  }

  it("resolves Cam and Graham as human provenance, but not the agent", () => {
    // This is the mapping humanAdded is built from — if it ever stops resolving a
    // member's name, every name they added silently becomes agent-demotable.
    assert.ok(personByName("Cam"), "Cam must resolve to a member");
    assert.ok(personByName("Graham"), "Graham must resolve to a member");
    assert.equal(personByName("agent"), null);
  });
});

describe("decideDemote — a held name is not a spare slot", () => {
  it("refuses while the fund holds shares, and says to exit first", () => {
    const d = decideDemote({ ...dead, heldQty: 25 });
    assert.equal(d.demote, false);
    assert.match(d.reason, /holds 25 shares/);
    assert.match(d.reason, /Exit the position first/);
  });

  it("frees the slot once the position is flat", () => {
    assert.equal(decideDemote({ ...dead, heldQty: 0 }).demote, true);
  });
});

describe("decideDemote — anti-churn", () => {
  it("stops at the weekly cap", () => {
    const d = decideDemote({ ...dead, recentDemotes: SELF_INVEST.maxDemotesPerRollingWeek });
    assert.equal(d.demote, false);
    assert.match(d.reason, /weekly demotion cap/);
  });

  it("allows the one just below it", () => {
    assert.equal(decideDemote({ ...dead, recentDemotes: SELF_INVEST.maxDemotesPerRollingWeek - 1 }).demote, true);
  });

  it("cannot drain faster than promote fills — the caps stay symmetric", () => {
    assert.ok(
      SELF_INVEST.maxDemotesPerRollingWeek <= SELF_INVEST.maxPerRollingWeek,
      "a demote cap above the promote cap lets the universe churn down faster than it fills",
    );
  });
});

describe("decideDemote — a human claim outranks a mere rate limit", () => {
  it("explains the member's claim, not the cap, when both apply", () => {
    const d = decideDemote({ ...dead, humanAdded: true, recentDemotes: 999 });
    assert.equal(d.demote, false);
    assert.match(d.reason, /member added this name/);
  });
});

describe("capRejectionReason — a rejection must carry its own arithmetic", () => {
  // The 2026-09-22 failure: the message said only "at its cap — demote something". The
  // agent freed two, was still over, concluded the remaining 35 were protected, stopped,
  // and told the members the wall was theirs to open. These pin that it cannot recur.
  const CAP = SELF_INVEST.maxUniverseSize;

  it("states how many slots are needed, not just that the cap is hit", () => {
    const r = capRejectionReason(CAP + 2, 35, ["ICE", "NA"], 23);
    assert.match(r, new RegExp(`${CAP + 2}/${CAP}`), "must show active/cap");
    assert.match(r, /free 3 slots/, "62 vs a 60 cap needs 3 freed, not 2");
  });

  it("tells the agent it can clear this itself when the spare list covers it", () => {
    const r = capRejectionReason(CAP + 2, 35, ["ICE", "NA", "CP"], 23);
    assert.match(r, /RIGHT NOW/);
    assert.match(r, /NOT conclude this is member-gated/);
  });

  it("names the actual symbols so it never has to guess what is spare", () => {
    const r = capRejectionReason(CAP + 1, 3, ["CP", "SHOP", "ATD"], 25);
    for (const s of ["CP", "SHOP", "ATD"]) assert.match(r, new RegExp(s));
  });

  it("only calls it member-gated when genuinely nothing is reclaimable", () => {
    const r = capRejectionReason(CAP + 1, 0, [], 25);
    assert.match(r, /genuinely cannot clear this/);
    assert.match(r, /make the case to the members/);
  });

  it("is honest when the weekly budget — not eligibility — is the binding limit", () => {
    const r = capRejectionReason(CAP + 5, 30, ["A", "B"], 2);
    assert.match(r, /only free 2/);
    assert.match(r, /need 6/);
    assert.doesNotMatch(r, /RIGHT NOW/, "must not claim it can clear this when it cannot");
  });
});
