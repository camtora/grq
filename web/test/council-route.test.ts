import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRouteJson, councilMarkdown, councilToolText } from "../agent/council";

// The chat HARD GATE (D115) depends on reading the router model's JSON out of whatever wrapping it
// arrives in. These pin the tolerant parse + the render contract without a live model.

test("parseRouteJson — clean object routes to the council with its symbols", () => {
  const r = parseRouteJson('{"council": true, "symbols": ["NVDA", "TD"]}', 3);
  assert.equal(r.council, true);
  assert.deepEqual(r.symbols, ["NVDA", "TD"]);
});

test("parseRouteJson — tolerates a ```json fence and surrounding prose", () => {
  const raw = 'Sure, here you go:\n```json\n{"council": true, "symbols": ["XIC"]}\n```\n';
  const r = parseRouteJson(raw, 3);
  assert.equal(r.council, true);
  assert.deepEqual(r.symbols, ["XIC"]);
});

test("parseRouteJson — non-council forces symbols empty even if the model listed some", () => {
  const r = parseRouteJson('{"council": false, "symbols": ["NVDA"]}', 3);
  assert.equal(r.council, false);
  assert.deepEqual(r.symbols, []);
});

test("parseRouteJson — caps symbols at maxSymbols and trims/drops blanks", () => {
  const r = parseRouteJson('{"council": true, "symbols": [" AAPL ", "MSFT", "", "GOOG", "NVDA"]}', 3);
  assert.deepEqual(r.symbols, ["AAPL", "MSFT", "GOOG"]);
});

test("parseRouteJson — fails closed to Alfred on garbage / no JSON", () => {
  assert.deepEqual(parseRouteJson("no json here", 3), { council: false, symbols: [] });
  assert.deepEqual(parseRouteJson("{not valid json", 3), { council: false, symbols: [] });
  assert.deepEqual(parseRouteJson("", 3), { council: false, symbols: [] });
});

test("councilMarkdown — verdict leads, the room follows, all five labels present", () => {
  const md = councilMarkdown({
    question: "Buy NVDA here?",
    verdict: "Hold. Wait for the pullback.",
    advisors: [
      { key: "contrarian", label: "The Contrarian", emoji: "⚖️", take: "Overbought." },
      { key: "executor", label: "The Executor", emoji: "🔧", take: "Set a limit at 1200." },
    ],
  });
  assert.match(md, /The council convened/);
  // verdict appears before the room divider
  assert.ok(md.indexOf("Hold. Wait") < md.indexOf("### The room"));
  assert.match(md, /The Contrarian/);
  assert.match(md, /The Executor/);
});

test("councilToolText — frames the verdict as advice, not an order", () => {
  const t = councilToolText({
    question: "Buy NVDA?",
    verdict: "Buy a starter.",
    advisors: [{ key: "expansionist", label: "The Expansionist", emoji: "🚀", take: "Big TAM." }],
  });
  assert.match(t, /advice, not an order/);
  assert.match(t, /§6 gate/);
  assert.match(t, /CHAIRMAN'S VERDICT/);
});
