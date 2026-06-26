import { memberKeyForEmail } from "@/lib/users";

// The fund's two members — photos + plain-text career summaries. Kept as
// markdown strings on purpose ("AI-readable"): they're the single source for the
// watchlist "watched by" avatars, the Reports "about us" badges, and anything we
// later feed the agent. The StockWatch table keys watchers by stable EMAIL, so
// personByEmail() is the primary resolver (D-watch); personByName() stays for the
// legacy addedBy/displayName ("Cam"/"Graham") provenance fields.

export type Person = {
  key: "cam" | "graham";
  name: string; // short display name — matches displayName()/addedBy
  fullName: string;
  title: string;
  location: string;
  photo: string; // under /public
  bio: string; // markdown career summary
};

export const PEOPLE: Person[] = [
  {
    key: "cam",
    name: "Cam",
    fullName: "Cam Tora",
    title: "Data & Technology Leader",
    location: "Toronto, Ontario",
    photo: "/people/cam.png",
    bio: `**Cam Tora** — Data & Technology Leader, Toronto. Software engineer by training (BE, Software Engineering — Western), data-and-platforms operator by trade.

- **VP of Technology, Globalfaces Direct** (2024–present) — leads the technology team running the payment & data infrastructure behind face-to-face fundraising across North America, connecting 100+ nonprofit clients with their payment processors in real time.
- **Divisional VP, Data Solutions — Saks Global** (2023–2024), and **Hudson's Bay** as **Divisional VP, Data Solutions & Systems Integration** (2022–2023) and **Director, Data Platforms** (2020–2022) — built data platforms and ran incident response through one of the most turbulent chapters in Canadian retail.
- **Manager, Business Intelligence — Bell** (2017–2020); earlier IT leadership at Kelson.
- **Owner, Student Works Painting** (2014–2015) — ran a door-to-door painting business in Muskoka during university.
- **Hockey Canada referee** for ~16 years — the through-line he credits for staying calm and making hard calls under pressure.

Skills: Microsoft Azure, cloud administration, data engineering. Brings the engineering + operational-excellence half of GRQ.`,
  },
  {
    key: "graham",
    name: "Graham",
    fullName: "Graham Appleby",
    title: "Sales & Business Development",
    location: "Toronto, Ontario",
    photo: "/people/graham.png",
    bio: `**Graham Appleby** — Sales professional turning relationships into results, Toronto. York University grad (BA, Environmental Science & Business, 4.0 GPA).

- **Business Development, The Sales Factory** (2023–present) — B2B business development, CRM-driven outreach (HubSpot, Salesforce); leads in activity and results.
- **Owner, Johnson Appleby Painting** (2017–2022) — founded and operated a residential & commercial painting business, delivering high-end projects across Toronto, Muskoka, and the GTA; managed operations, client relations, and crews.
- **Substitute Teacher, Beaufort-Delta Education Council** (2022–2023) — taught Grade 9 English in Inuvik, a remote Arctic community, and coached the school's travel soccer team — an experience he credits for his adaptability.
- Founded and ran an e-commerce clothing brand; earlier roles in landscaping supervision, video editing, and customer service.

Skills: B2B sales & business development, entrepreneurship, classroom management, adaptability. Brings the relationships + go-to-market half of GRQ.`,
  },
];

const BY_NAME = new Map<string, Person>();
for (const p of PEOPLE) {
  BY_NAME.set(p.name.toLowerCase(), p);
  BY_NAME.set(p.fullName.toLowerCase(), p);
}
// A couple of aliases for how a watcher might be recorded.
BY_NAME.set("cameron", PEOPLE[0]);
BY_NAME.set("cameron tora", PEOPLE[0]);

/** Resolve a recorded watcher name (addedBy / displayName) to a member, or null. */
export function personByName(name: string | null | undefined): Person | null {
  if (!name) return null;
  return BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

const BY_KEY = new Map<string, Person>(PEOPLE.map((p) => [p.key, p]));

/** Resolve a member email (the StockWatch identity) to a member, or null. The
 *  primary watcher resolver — watches are stored by email, not display name. */
export function personByEmail(email: string | null | undefined): Person | null {
  const key = memberKeyForEmail(email);
  return key ? (BY_KEY.get(key) ?? null) : null;
}

export type OwnerKey = "cam" | "graham" | "agent";

/**
 * Bucket a watcher into a watchlist-tab owner. Anything not tagged to a member
 * (legacy/seed adds, hunt finds, the agent's own watches) counts as "agent".
 */
export function ownerKeyFor(addedBy: string | null | undefined): OwnerKey {
  return personByName(addedBy)?.key ?? "agent";
}
