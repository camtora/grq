// A market quote or stock joke for the GRQ Daily masthead. Deterministic per
// day (same pattern as greetings.ts) so it's stable through the day and turns
// over each morning. Part of the "a page you want to come back to" remit —
// and the financial-literacy through-line: the quotes teach, the jokes disarm.

const ITEMS: string[] = [
  "“The stock market is a device for transferring money from the impatient to the patient.” — Warren Buffett",
  "“In the short run the market is a voting machine; in the long run it is a weighing machine.” — Benjamin Graham",
  "“Be fearful when others are greedy, and greedy when others are fearful.” — Warren Buffett",
  "“The four most dangerous words in investing are: ‘this time it’s different.’” — John Templeton",
  "“Know what you own, and know why you own it.” — Peter Lynch",
  "“Risk comes from not knowing what you’re doing.” — Warren Buffett",
  "“The investor’s chief problem — and even his worst enemy — is likely to be himself.” — Benjamin Graham",
  "Time in the market beats timing the market. The robot keeps a sticky note to that effect.",
  "Diversification: the art of being wrong in several places at once, comfortably.",
  "A bull market is when your stocks go up; a bear market is when you discover humility.",
  "Why did the trader bring a ladder to work? To buy on the dips.",
  "My portfolio is like my coffee — I like it green, and I get nervous when it isn’t.",
  "“The big money is not in the buying and the selling, but in the waiting.” — Charlie Munger",
  "Compound interest: the eighth wonder of the world, and the only one you can own shares of.",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function dailyQuote(d = new Date()): string {
  const day = d.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  return ITEMS[hash(day) % ITEMS.length];
}
