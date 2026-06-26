// Read-only GitHub access for the daily change report (D-dailyreport). Fetches the
// commits in a time window via the GitHub REST API, using a fine-grained PAT
// (GITHUB_TOKEN, Contents: Read-only) so the agent container needs no git binary and
// no host coupling. No-ops gracefully (ok:false) when the token is unset, so the
// feature stays dark until the secret lands instead of throwing.

const REPO = process.env.GITHUB_REPO || "camtora/grq";
// The branch the work lives on. The commits API defaults to the repo's DEFAULT branch
// (main), but active development happens on a feature branch — so this must point at it
// (e.g. GITHUB_BRANCH=feat/the-race) or the diary comes up empty. Update it when the
// long-lived working branch changes.
const BRANCH = process.env.GITHUB_BRANCH || "main";
const API = "https://api.github.com";
const MAX_DETAIL = 60; // per-commit file/stat lookups are 1 API call each — cap them

export type CommitInfo = {
  sha: string;
  subject: string; // first line of the commit message
  body: string; // the rest of the message (may be empty)
  author: string;
  date: string; // ISO committer date
  files: string[]; // changed file paths (empty if detail wasn't fetched)
  additions: number;
  deletions: number;
};

export type CommitsResult =
  | { ok: true; repo: string; commits: CommitInfo[]; truncated: boolean }
  | { ok: false; reason: string };

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "grq-daily-report",
  };
}

/** Commits with committer date in [since, until). Enriches up to MAX_DETAIL of them
 *  with their changed-file list + line stats (for grouping). Best-effort per commit. */
export async function commitsInWindow(since: Date, until: Date): Promise<CommitsResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, reason: "GITHUB_TOKEN not set" };

  const url = `${API}/repos/${REPO}/commits?sha=${encodeURIComponent(BRANCH)}&since=${since.toISOString()}&until=${until.toISOString()}&per_page=100`;
  let list: any[];
  try {
    const r = await fetch(url, { headers: headers(token), cache: "no-store" });
    if (!r.ok) return { ok: false, reason: `commits list HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
    list = await r.json();
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  if (!Array.isArray(list)) return { ok: false, reason: "unexpected commits payload" };

  const truncated = list.length >= 100;
  const commits: CommitInfo[] = list.map((c) => {
    const msg: string = c?.commit?.message ?? "";
    const nl = msg.indexOf("\n");
    return {
      sha: c?.sha ?? "",
      subject: (nl === -1 ? msg : msg.slice(0, nl)).trim(),
      body: (nl === -1 ? "" : msg.slice(nl + 1)).trim(),
      author: c?.commit?.author?.name ?? c?.author?.login ?? "unknown",
      date: c?.commit?.committer?.date ?? c?.commit?.author?.date ?? "",
      files: [],
      additions: 0,
      deletions: 0,
    };
  });

  // Enrich (capped) with files + stats. Each is one call; tolerate per-commit failure.
  await Promise.all(
    commits.slice(0, MAX_DETAIL).map(async (ci) => {
      try {
        const r = await fetch(`${API}/repos/${REPO}/commits/${ci.sha}`, { headers: headers(token), cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        ci.files = Array.isArray(d?.files) ? d.files.map((f: any) => f.filename).filter(Boolean) : [];
        ci.additions = d?.stats?.additions ?? 0;
        ci.deletions = d?.stats?.deletions ?? 0;
      } catch {
        /* keep the message-only row */
      }
    }),
  );

  return { ok: true, repo: REPO, commits, truncated };
}
