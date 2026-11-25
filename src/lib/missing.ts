/**
 * "The room says this exists, so where is the paper?"
 *
 * Looks at what has been entered (shareholders, SAFEs, the option pool, the
 * team, an open round) and lists the documents an investor would expect to
 * find behind each fact but which nobody has uploaded yet. It matches on
 * document and file names, so it is a prompt for the founder, never a verdict;
 * every item can be marked "not needed".
 */
export type MissingInput = {
  /** Name, description and file name of every document, joined. */
  docs: string[];
  /** Folder names that already contain at least one document. */
  filledFolders: string[];
  holders: { name: string; kind: string; shares: number }[];
  team: { name: string }[];
  safes: { id: number; investor: string; amount: number; status: string; signed_on: string | null; hasDocument: boolean }[];
  rounds: { name: string; status: string; instrument: string }[];
  dismissed: string[];
};
export type MissingDoc = {
  key: string;
  /** What to upload. */
  title: string;
  /** The fact in the room that makes it expected. */
  why: string;
  /** Which of the standard folders it belongs in (matched loosely against the room's folders). */
  folder: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9()]+/g, " ").replace(/\s+/g, " ").trim();
const KIND = {
  certificate: /certificate of (incorporation|formation)|articles of (incorporation|organi[sz]ation|association)|\bcharter\b|\bcoi\b/,
  bylaws: /by ?laws|operating agreement/,
  consent: /board (consent|resolution|approval|minutes)|written consent|resolutions? of the board|\bminutes\b/,
  stock: /stock purchase|share purchase|restricted stock|\brspa\b|\bspa\b|subscription agreement|founder (stock|share)/,
  election: /83 ?\(? ?b ?\)?/,
  ip: /\bip assign|invention|\bpiia\b|\bciia+\b|proprietary information|intellectual property|assignment of (ip|invention|intellectual)|technology assignment/,
  advisor: /advisor|advisory|\bfast\b/,
  plan: /equity incentive|incentive plan|stock plan|option plan|share plan|\besop\b|\bemi\b/,
  safe: /\bsafe\b|simple agreement for future equity/,
  deck: /\bdeck\b|pitch|presentation|one pager/,
} as const;
const SUFFIXES = new Set(["inc", "llc", "ltd", "lp", "llp", "the", "and", "fund", "capital", "ventures", "partners", "holdings", "group", "trust", "family", "office"]);
/** The words in a name worth looking for in a file name. */
const nameWords = (name: string) => norm(name).split(" ").filter((w) => w.length >= 3 && !SUFFIXES.has(w));
const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const money = (n: number) => (n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `$${+(n / 1000).toFixed(1)}K` : `$${n}`);
const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

export function findMissing(input: MissingInput): MissingDoc[] {
  const docs = input.docs.map(norm);
  const ofKind = (kind: keyof typeof KIND) => docs.filter((d) => KIND[kind].test(d));
  const mentions = (pool: string[], name: string) => {
    const words = nameWords(name);
    return words.length > 0 && pool.some((d) => words.some((w) => new RegExp(`\\b${w}\\b`).test(d)));
  };
  /** People without a document of this kind. If there are as many such documents as people, the names simply are not in the file names. */
  const uncovered = (kind: keyof typeof KIND, people: string[]) => {
    const pool = ofKind(kind);
    return pool.length >= people.length ? [] : people.filter((p) => !mentions(pool, p));
  };
  const out: MissingDoc[] = [];
  const add = (key: string, title: string, why: string, folder: string) => out.push({ key, title, why, folder });
  const perPerson = (kind: keyof typeof KIND, key: string, what: string, people: string[], why: (names: string[]) => string, folder: string) => {
    const missing = uncovered(kind, people);
    if (missing.length === 0) return;
    if (missing.length > 3) add(key, `${what}s for ${missing.length} people`, `${why(missing)} Still to add: ${list(missing)}.`, folder);
    else for (const p of missing) add(`${key}:${norm(p)}`, `${what} for ${p}`, why([p]), folder);
  };

  const founders = input.holders.filter((h) => h.kind === "founder" && h.shares > 0).map((h) => h.name);
  const employees = input.holders.filter((h) => h.kind === "employee").map((h) => h.name);
  const advisors = input.holders.filter((h) => h.kind === "advisor").map((h) => h.name);
  const pool = input.holders.find((h) => h.kind === "pool" && h.shares > 0);
  const issued = input.holders.some((h) => h.kind !== "pool" && h.shares > 0);
  const signedSafes = input.safes.filter((s) => s.status !== "committed");

  // The company itself.
  if (issued || signedSafes.length > 0) {
    const because = issued ? "The cap table lists shareholders, so investors will want to see the company that issued those shares." : "A signed SAFE is recorded, so investors will want to see the company that signed it.";
    if (ofKind("certificate").length === 0) add("certificate", "Certificate of incorporation", because, "Company");
    if (ofKind("bylaws").length === 0) add("bylaws", "Bylaws", "They go with the certificate of incorporation and are asked for in every diligence.", "Company");
  }
  if (issued && ofKind("consent").length === 0) add("consent", "Board consent approving the share issuances", "Shares on the cap table were issued by a board decision. Investors ask for the signed consent.", "Company");

  // Founders' shares.
  perPerson("stock", "stock", "Stock purchase agreement", founders, (n) => `${list(n)} ${n.length === 1 ? "holds" : "hold"} founder shares on the cap table.`, "Cap table");
  if (founders.length > 0 && ofKind("election").length === 0) add("83b", "83(b) election filings", "Founders hold shares. If any of them vest, US investors ask for proof the election was filed within 30 days. Mark this not needed if no shares vest or you are outside the US.", "Cap table");

  // Everyone who built something.
  const builders = [...new Map([...founders, ...employees, ...input.team.map((t) => t.name)].map((n) => [norm(n), n])).values()].filter((n) => !advisors.some((a) => norm(a) === norm(n)));
  perPerson("ip", "ip", "IP assignment agreement", builders, (n) => `${list(n)} ${n.length === 1 ? "is" : "are"} on the team or the cap table. Investors check that everything ${n.length === 1 ? first(n[0]) : "they"} built belongs to the company.`, "IP");
  perPerson("advisor", "advisor", "Advisor agreement", advisors, (n) => `${list(n)} ${n.length === 1 ? "is" : "are"} on the cap table as ${n.length === 1 ? "an advisor" : "advisors"}.`, "Team");

  // The option pool.
  if (pool && ofKind("plan").length === 0) add("plan", "Equity incentive plan", `The cap table reserves an option pool of ${Math.round(pool.shares).toLocaleString("en-US")} shares. The plan, and the board approval that created it, belong in the room.`, "Company");

  // SAFEs.
  const safeDocs = ofKind("safe");
  for (const s of signedSafes) {
    if (s.hasDocument || mentions(safeDocs, s.investor)) continue;
    add(`safe:${s.id}`, `Signed SAFE with ${s.investor}`, `${money(s.amount)} is recorded on the cap table as ${s.status === "wired" ? "signed and wired" : "signed"}${s.signed_on ? ` on ${s.signed_on}` : ""}. Upload the signed copy, then attach it to the SAFE on the cap table page.`, "Cap table");
  }

  // A round investors can see.
  const live = input.rounds.find((r) => r.status === "open" || r.status === "closing");
  if (live) {
    if (ofKind("deck").length === 0 && !input.filledFolders.some((f) => /pitch/i.test(f))) add("deck", "Pitch deck", `${live.name} is ${live.status === "open" ? "open" : "closing"}, and the deck is the first thing an investor opens.`, "Pitch");
    if (live.instrument === "safe" && safeDocs.length === 0) add("safe-form", "The SAFE you are offering", `${live.name} is raised on SAFEs. Investors want to read the exact terms before they commit, so add the unsigned form.`, "Closing");
  }

  return out.filter((m) => !input.dismissed.includes(m.key));
}
