import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isClaudeLimitError, parseResetHint, quietUntilFor } from "@/agent/limit-quiet";
import { attemptGate } from "@/agent/retry";

// Claude-limit quiet (D123, 2026-09-11). The 4-pushes-a-minute storm had two parts: every limit death
// alerted, and a race/desk whose entrants all failed was re-tried every 60s tick. These pin the
// classifier, the "until when" rule, and the attempt throttle — the class, not the instance.

const NOW = new Date("2026-09-11T17:59:00Z"); // 13:59 ET (EDT)
const et = (d: Date | null) => (d ? d.toLocaleString("en-CA", { timeZone: "America/Toronto", hour12: false }) : null);

describe("isClaudeLimitError — the message family", () => {
  it("recognises the real captures", () => {
    for (const msg of [
      "Claude Code returned an error result: You've hit your org's monthly spend limit · ask your admin to raise it at claude.ai/settings/usage?from=cc_cli_limit_message",
      "You've hit your limit · resets 3pm (America/Toronto)",
      "You've hit your weekly limit · resets Sep 15 at 3pm",
      "Claude AI usage limit reached|1757620800",
      "You're out of extra usage",
      'API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed your organization\'s rate limit"}}',
    ]) {
      assert.equal(isClaudeLimitError(msg), true, msg);
    }
  });
  it("leaves ordinary failures alone — those still deserve their own alert", () => {
    for (const msg of [
      "connect ECONNREFUSED 172.18.0.5:5002",
      "No IBKR contract found for XIC",
      "error_max_turns",
      "error_during_execution",
      "Error in connector: Error querying the database: FATAL: the database system is in recovery mode",
      "",
    ]) {
      assert.equal(isClaudeLimitError(msg), false, msg || "(empty)");
    }
    assert.equal(isClaudeLimitError(null), false);
    assert.equal(isClaudeLimitError(undefined), false);
  });
});

describe("parseResetHint — the reset the error names", () => {
  it("resolves an ET clock to today's occurrence", () => {
    const d = parseResetHint("You've hit your limit · resets 3pm (America/Toronto)", NOW);
    assert.equal(d?.toISOString(), "2026-09-11T19:00:00.000Z");
  });
  it("handles minutes and spacing", () => {
    assert.equal(parseResetHint("resets 3:30 pm", NOW)?.toISOString(), "2026-09-11T19:30:00.000Z");
    assert.equal(parseResetHint("resets at 15:00", NOW)?.toISOString(), "2026-09-11T19:00:00.000Z");
  });
  it("rolls a clock that already passed to tomorrow, never the past", () => {
    const d = parseResetHint("resets 1pm", NOW); // 13:00 ET was 59 min ago
    assert.equal(et(d), "2026-09-12, 13:00:00");
  });
  it("walks to a named month-day", () => {
    const d = parseResetHint("You've hit your weekly limit · resets Sep 15 at 3pm", NOW);
    assert.equal(d?.toISOString(), "2026-09-15T19:00:00.000Z");
  });
  it("reads the epoch suffix some CLI builds append", () => {
    const epoch = Math.floor(Date.UTC(2026, 8, 11, 20) / 1000);
    assert.equal(parseResetHint(`Claude AI usage limit reached|${epoch}`, NOW)?.toISOString(), "2026-09-11T20:00:00.000Z");
  });
  it("returns null when nothing is named", () => {
    assert.equal(parseResetHint("You've hit your org's monthly spend limit · ask your admin to raise it", NOW), null);
  });
});

describe("quietUntilFor — message, else window, else fallback", () => {
  const anchor = new Date("2026-09-11T19:00:00Z"); // owner anchored 15:00 ET on /tokens
  it("prefers the reset the error names", () => {
    const q = quietUntilFor("You've hit your limit · resets 3:30pm", NOW, anchor);
    assert.equal(q.source, "message");
    assert.equal(q.until.toISOString(), "2026-09-11T19:30:00.000Z");
  });
  it("falls back to the next 5-hour window from the anchor — 'the next window, which we have'", () => {
    const q = quietUntilFor("You've hit your org's monthly spend limit · ask your admin", NOW, anchor);
    assert.equal(q.source, "window");
    assert.equal(q.until.toISOString(), "2026-09-11T19:00:00.000Z");
  });
  it("rolls a stale anchor forward — never quiet 'until' a past instant", () => {
    const stale = new Date("2026-07-11T08:00:00Z");
    const q = quietUntilFor("spend limit", NOW, stale);
    assert.equal(q.source, "window");
    assert.ok(q.until.getTime() > NOW.getTime());
    assert.ok(q.until.getTime() - NOW.getTime() <= 5 * 3600_000);
  });
  it("uses a 60-minute fallback when no anchor is set", () => {
    const q = quietUntilFor("spend limit", NOW, null);
    assert.equal(q.source, "fallback");
    assert.equal(q.until.toISOString(), "2026-09-11T18:59:00.000Z");
  });
  it("caps an absurd named horizon at a week", () => {
    const epoch = Math.floor(Date.UTC(2026, 11, 25) / 1000);
    const q = quietUntilFor(`limit reached|${epoch}`, NOW, null);
    assert.equal(q.until.getTime() - NOW.getTime(), 7 * 24 * 3600_000);
  });
});

describe("attemptGate — once per gap, win or lose", () => {
  it("admits the first try, refuses a retry inside the gap, admits after it", () => {
    const seen = new Map<number, number>();
    const t0 = NOW.getTime();
    assert.equal(attemptGate(seen, 1, t0), true);
    assert.equal(attemptGate(seen, 1, t0 + 60_000), false); // the next 60s tick — the storm's shape
    assert.equal(attemptGate(seen, 1, t0 + 54 * 60_000), false);
    assert.equal(attemptGate(seen, 1, t0 + 55 * 60_000), true);
  });
  it("throttles races independently", () => {
    const seen = new Map<number, number>();
    const t0 = NOW.getTime();
    assert.equal(attemptGate(seen, 1, t0), true);
    assert.equal(attemptGate(seen, 6, t0), true);
    assert.equal(attemptGate(seen, 1, t0 + 1000), false);
  });
});
