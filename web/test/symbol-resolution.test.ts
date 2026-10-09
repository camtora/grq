import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classDash, pickCanonical, memberForListing, yahooForListing, type UniverseRow } from "@/lib/universe";

// One ticker, several spellings, sometimes several companies. These rules decide which
// tracked member a URL / watch / research request means. Both failures pinned here were
// live on 2026-10-08: HPS.A (the TSX's spelling of our HPS-A) found no member and no quote,
// and NEO.TO (Neo Performance Materials) collapsed to bare NEO — NeoGenomics, which then
// got a full dossier nobody asked for.

const row = (symbol: string, yahoo: string, status: UniverseRow["status"] = "CANDIDATE"): UniverseRow =>
  ({ symbol, yahoo, name: symbol, status }) as UniverseRow;

describe("classDash — share-class notation", () => {
  it("turns a class dot into the dash we store", () => {
    assert.equal(classDash("HPS.A"), "HPS-A");
    assert.equal(classDash("brk.b"), "BRK-B");
    assert.equal(classDash("REI.UN"), "REI-UN");
  });
  it("leaves a venue suffix alone", () => {
    assert.equal(classDash("NEO.TO"), "NEO.TO");
    assert.equal(classDash("PCRX.V"), "PCRX.V");
    assert.equal(classDash("HPS.A.TO"), "HPS-A.TO");
    assert.equal(classDash("T.US"), "T.US");
    assert.equal(classDash("MP"), "MP");
  });
});

describe("yahooForListing — a class dot on a Canadian venue is not a listing suffix", () => {
  it("resolves HPS.A on the TSX to Yahoo's HPS-A.TO", () => {
    assert.equal(yahooForListing("HPS.A", "TSX"), "HPS-A.TO");
  });
  it("keeps the existing picks", () => {
    assert.equal(yahooForListing("RY", "TSX"), "RY.TO");
    assert.equal(yahooForListing("RY.TO", "TSX"), "RY.TO");
    assert.equal(yahooForListing("NVDA", "NASDAQ"), "NVDA");
    assert.equal(yahooForListing("T.US"), "T");
    assert.equal(yahooForListing("UCU", "TSXV"), "UCU.V");
  });
});

describe("pickCanonical — which member a symbol means", () => {
  const rows = [
    row("HPS-A", "HPS-A.TO"),
    row("RY", "RY.TO"),
    row("T", "T.TO"),
    row("MU", "MU"),
    row("SPCX", "SPCX"),
    row("SPCX.TO", "SPCX.TO", "RETIRED"),
  ];
  it("matches the TSX share-class spelling to the dash member", () => {
    assert.equal(pickCanonical(rows, "HPS.A")?.symbol, "HPS-A");
    assert.equal(pickCanonical(rows, "hps.a.to")?.symbol, "HPS-A");
  });
  it("matches a suffixed URL to its own listing's member", () => {
    assert.equal(pickCanonical(rows, "RY.TO")?.symbol, "RY");
    assert.equal(pickCanonical(rows, "MU.US")?.symbol, "MU");
  });
  it("never hands a Canadian listing to a US member of the same ticker", () => {
    const us = [row("NEO", "NEO")]; // NeoGenomics
    assert.equal(pickCanonical(us, "NEO.TO"), null); // Neo Performance Materials
    assert.equal(pickCanonical(us, "NEO")?.symbol, "NEO");
  });
  it("never hands .US to a Canadian member of the same ticker", () => {
    assert.equal(pickCanonical(rows, "T.US"), null);
  });
  it("exact match wins, retired included; a retired shell never captures an alias", () => {
    assert.equal(pickCanonical(rows, "SPCX.TO")?.status, "RETIRED");
    assert.equal(pickCanonical([row("X", "X.TO", "RETIRED")], "X.TO"), null);
  });
});

describe("memberForListing — joining an outside name onto the universe", () => {
  const named = (symbol: string, yahoo: string, name: string): UniverseRow => ({ ...row(symbol, yahoo), name });
  const genomics = named("NEO", "NEO", "NeoGenomics, Inc.");
  const neoPerf = named("NEO.TO", "NEO.TO", "NEO PERFORMANCE MATERIALS INC");
  const play = { symbol: "NEO", yahoo: "NEO.TO", name: "Neo Performance Materials Inc." };

  it("a Canadian play never joins the US company that shares its ticker", () => {
    assert.equal(memberForListing([genomics], play), null);
  });
  it("joins its own listing, whichever order the rows arrive in", () => {
    assert.equal(memberForListing([genomics, neoPerf], play)?.symbol, "NEO.TO");
    assert.equal(memberForListing([neoPerf, genomics], play)?.symbol, "NEO.TO");
  });
  it("a board piece with only a bare ticker is decided by its name", () => {
    const piece = { symbol: "NEO", name: "Neo Performance Materials" };
    assert.equal(memberForListing([genomics, neoPerf], piece)?.symbol, "NEO.TO");
    assert.equal(memberForListing([genomics], piece), null);
  });
  it("still joins a cross-listing named by its other side", () => {
    const shop = named("SHOP", "SHOP.TO", "Shopify Inc.");
    assert.equal(memberForListing([shop], { symbol: "SHOP", yahoo: "SHOP", name: "Shopify Inc" })?.symbol, "SHOP");
  });
  it("joins the share-class spelling, and nameless pieces only on the same side", () => {
    const hps = named("HPS-A", "HPS-A.TO", "Hammond Power Solutions");
    assert.equal(memberForListing([hps], { symbol: "HPS.A", yahoo: "HPS-A.TO", name: "" })?.symbol, "HPS-A");
    assert.equal(memberForListing([genomics], { symbol: "NEO.TO" }), null);
    assert.equal(memberForListing([genomics], { symbol: "NEO" })?.symbol, "NEO");
  });
});
