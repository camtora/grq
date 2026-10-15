import { TERMS_VERSION } from "./terms";

// The words (D136). Plain English, GRQ's voice where it can be, and never funny about money.
// Kept as data so a test can pin the sentences that carry the legal weight, and so the page
// and any future export (the app, a PDF) read from one place. Change these → bump
// TERMS_VERSION in lib/terms.ts, and every user is asked again.

/** The sentence that follows every call a non-member sees (NI 31-103 s.8.25: say you have an interest). */
export const INTEREST_LINE =
  "The fund behind these calls may own or trade any name it rates, before or after a call appears, and does not say which.";

/** The short version — what a person must take in before the button. */
export const TERMS_SHORT: readonly string[] = [
  "GRQ is a private fund run by two people with their own money. You cannot invest in it, and nobody here will ever ask you for money.",
  "Nothing on this site is advice for you. It is general information, written mostly by an AI, and nobody at GRQ is registered to advise anyone.",
  INTEREST_LINE,
  "You could lose money acting on anything you read here. That is yours to carry.",
  "Your visits are logged by name.",
];

export type TermsSection = { title: string; body: readonly string[] };

export const TERMS_SECTIONS: readonly TermsSection[] = [
  {
    title: "What GRQ is",
    body: [
      "GRQ stands for Get Rich Quick. The name is a joke between Cam and Graham, the two people whose money this is, and the tagline finishes it: get rich quick, slowly, with receipts. Nothing on this site will get you rich quick, and nobody here is claiming it will.",
      "GRQ is a private, invitation-only website that shows how one small fund researches and trades, and teaches how markets work along the way.",
    ],
  },
  {
    title: "Whose money this is",
    body: [
      "The fund is Cam's and Graham's own money, in their own brokerage account. It is not open to investment. You cannot put money in, buy a share of it, or trade through it, and nothing on this site is an offer or an invitation to do any of those things.",
      "If anyone ever asks you for money in GRQ's name, it is not GRQ.",
    ],
  },
  {
    title: "Not advice",
    body: [
      "Everything you see here, the ratings, the calls, the dossiers, the write-ups, the lessons and the sandboxes, is general information published for everyone who can sign in. None of it is written for you, and none of it takes your situation, goals or finances into account.",
      "Nobody at GRQ is registered with any securities regulator as an adviser, dealer or portfolio manager, and nothing here should be read as a recommendation that you personally buy, sell or hold anything. Before you act on anything you read here, do your own research or talk to a registered adviser.",
    ],
  },
  {
    title: "Alfred is a machine",
    body: [
      "The calls, the ratings and most of the writing are produced by an AI model, which GRQ calls Alfred, running on a schedule. No person reads each one before it appears. It can be wrong, confidently, in detail, and about facts that are easy to check. Treat everything it says as one fallible opinion among many.",
    ],
  },
  {
    title: "The fund has skin in the game",
    body: [
      "The fund behind these calls may own, buy or sell any name it rates, before or after a call appears, and this site does not tell you which names it holds. Read every call knowing that the people and the machine behind it may have a position in it.",
    ],
  },
  {
    title: "The data",
    body: [
      "Prices, financials, filings, news and sentiment come from third parties and may be delayed, incomplete or wrong. Quotes are delayed unless marked live. The figures in the labs and sandboxes are modelled, not real trades. GRQ does not check any of it for you.",
    ],
  },
  {
    title: "Your visits are logged",
    body: [
      "GRQ records who you are (the address you sign in with), which pages and data you open, when, and from which network address and browser. The log is kept for 180 days and is seen by the people who run the site. GRQ does not sell it or share it.",
    ],
  },
  {
    title: "Your access",
    body: [
      "Access is by invitation and can be changed or removed at any time, without notice or reason. Keep your sign-in to yourself. Do not copy, scrape or redistribute what you see here, the market data in particular, which GRQ licenses for its own use.",
    ],
  },
  {
    title: "No warranty, no liability",
    body: [
      "GRQ is provided as it is, with no promise that it is accurate, complete, available or fit for any purpose. To the fullest extent the law allows, Cam, Graham and GRQ are not liable for any loss or damage arising from your use of the site or your reliance on anything in it, including money you lose on a trade you make after reading something here.",
    ],
  },
  {
    title: "The law, and changes",
    body: [
      `These terms are governed by the laws of Ontario and Canada. If they change in a way that matters, you will be asked to agree again before the site opens. Version ${TERMS_VERSION}.`,
    ],
  },
];
