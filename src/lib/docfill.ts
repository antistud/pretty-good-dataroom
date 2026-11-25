/**
 * Filling the room from the founder's own documents, by way of whichever AI
 * assistant they already use. The app hands them a prompt; they attach their
 * deck, formation documents and SAFEs to it; the assistant answers with one
 * block of structured data; they paste it back here.
 *
 * That answer is untrusted text. Everything below treats it as such: it is
 * parsed leniently, then every value is checked, clamped and typed.
 */

export type Company = { one_liner: string; overview_markdown: string; stage: string; founded: string; location: string; website: string };
export type Member = { name: string; title: string; bio: string; link: string };
export type Holder = { name: string; kind: "founder" | "employee" | "advisor" | "investor" | "pool"; share_class: string; shares: number };
export type Round = { name: string; instrument: "safe" | "priced"; target_amount: number; valuation_cap: number | null; discount_percent: number | null; pre_money: number | null; min_check: number | null; use_of_funds: string };
export type Safe = { investor: string; amount: number; valuation_cap: number | null; discount_percent: number | null; type: "post" | "pre"; mfn: boolean; signed_on: string | null; status: "signed" | "wired" };
export type Answer = { company: Company | null; team: Member[]; holders: Holder[]; round: Round | null; safes: Safe[]; unsure: string[] };

const str = (v: unknown, max: number): string => (typeof v === "string" || typeof v === "number" ? String(v).replace(/\u0000/g, "").trim().slice(0, max) : "");
/** A positive amount below ten trillion, or null. Accepts 1200000, "1,200,000" and "$1.2M". */
export function amount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 && v < 1e13 ? v : null;
  if (typeof v !== "string") return null;
  const m = v.toLowerCase().replace(/[, $]/g, "").match(/^(\d+(?:\.\d+)?)(k|m|mm|b)?$/);
  if (!m) return null;
  const n = Number(m[1]) * ({ k: 1e3, m: 1e6, mm: 1e6, b: 1e9 }[m[2] as "k"] ?? 1);
  return n > 0 && n < 1e13 ? n : null;
}
const percent = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[%\s]/g, "")) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return null;
  // "0.2" almost certainly means 20%.
  return n < 1 ? Math.round(n * 1000) / 10 : n;
};
const isoDate = (v: unknown): string | null => {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
};
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const httpLink = (v: unknown): string => {
  const s = str(v, 300);
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : "";
};

/** Finds the JSON object in an assistant's reply, whether or not it is wrapped in a code block or surrounded by chatter. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      // Assistants sometimes use typographic quotes; put straight ones back before parsing.
      return JSON.parse(c.slice(start, end + 1).replace(/[“”]/g, '"'));
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/** Turns whatever was pasted into a checked, bounded Answer, or null if it is not usable at all. */
export function parseAnswer(text: string): Answer | null {
  const raw = obj(typeof text === "string" ? extractJson(text.slice(0, 200_000)) : null);
  if (!raw) return null;

  const c = obj(raw.company);
  const company: Company | null = c
    ? {
        one_liner: str(c.one_liner, 200),
        overview_markdown: str(c.overview_markdown, 8000),
        stage: str(c.stage, 80),
        founded: str(c.founded, 40),
        location: str(c.location, 120),
        website: httpLink(c.website),
      }
    : null;

  const team: Member[] = list(raw.team, 30)
    .map(obj)
    .filter((m): m is Record<string, unknown> => !!m && !!str(m.name, 120))
    .map((m) => ({ name: str(m.name, 120), title: str(m.title, 120), bio: str(m.bio, 1500), link: httpLink(m.link) }));

  const KINDS = ["founder", "employee", "advisor", "investor", "pool"] as const;
  const holders: Holder[] = list(raw.holders, 200)
    .map(obj)
    .filter((h): h is Record<string, unknown> => !!h && !!str(h.name, 120) && amount(h.shares) != null)
    .map((h) => ({
      name: str(h.name, 120),
      kind: (KINDS as readonly string[]).includes(str(h.kind, 20).toLowerCase()) ? (str(h.kind, 20).toLowerCase() as Holder["kind"]) : "investor",
      share_class: str(h.share_class, 60) || "Common",
      shares: Math.round(amount(h.shares)!),
    }));

  const r = obj(raw.round);
  const target = r ? amount(r.target_amount) : null;
  const round: Round | null =
    r && target
      ? {
          name: str(r.name, 120) || "Pre-seed",
          instrument: str(r.instrument, 20).toLowerCase() === "priced" ? "priced" : "safe",
          target_amount: target,
          valuation_cap: amount(r.valuation_cap),
          discount_percent: percent(r.discount_percent),
          pre_money: amount(r.pre_money),
          min_check: amount(r.min_check),
          use_of_funds: str(r.use_of_funds, 2000),
        }
      : null;

  const safes: Safe[] = list(raw.safes, 200)
    .map(obj)
    .filter((s): s is Record<string, unknown> => !!s && !!str(s.investor, 120) && amount(s.amount) != null)
    .map((s) => ({
      investor: str(s.investor, 120),
      amount: amount(s.amount)!,
      valuation_cap: amount(s.valuation_cap),
      discount_percent: percent(s.discount_percent),
      type: str(s.type, 10).toLowerCase() === "pre" ? "pre" : "post",
      mfn: s.mfn === true,
      signed_on: isoDate(s.signed_on),
      status: str(s.status, 10).toLowerCase() === "wired" ? "wired" : "signed",
    }));

  const unsure = list(raw.unsure, 30).map((u) => str(u, 400)).filter(Boolean);
  const empty = !company && !team.length && !holders.length && !round && !safes.length;
  if (company && !Object.values(company).some(Boolean) && empty) return null;
  return empty ? null : { company, team, holders, round, safes, unsure };
}

/** The prompt the founder pastes into their AI assistant, together with their documents. */
export function documentsPrompt(companyName: string): string {
  return `I am a startup founder setting up an investor data room for my company, ${companyName}. I am attaching documents to this message. They may include a pitch deck, formation documents (certificate of incorporation, bylaws, board consents), stock purchase agreements, a cap table, and signed SAFEs.

Read every attached document and pull out the facts below. This will be loaded into software and shown to investors, so accuracy matters more than completeness.

Rules:
- Use only what the documents actually say. Never guess, estimate or fill a gap with something plausible. If a fact is not there, use null (or leave the list empty).
- If two documents disagree, use the most recent signed document and mention the conflict under "unsure".
- If no documents are attached, or you cannot read one, say so and stop. Do not answer from general knowledge.
- Amounts are plain numbers in US dollars with no symbols or commas (1500000, not "$1.5M"). Share counts are plain whole numbers. Percentages are numbers (20 for 20%). Dates are YYYY-MM-DD.
- If something essential is ambiguous, ask me before answering. Otherwise answer straight away.

Reply with ONE code block containing JSON in exactly this shape, and nothing after it:

\`\`\`json
{
  "company": {
    "one_liner": "who it is for and what it does, under 15 words, plain English, no slogan",
    "overview_markdown": "250 to 400 words for an investor, using only these headings each on its own line: '## The problem', '## What we do', '## Why now', '## Traction', '## Team', '## The ask'. Plain paragraphs, '- ' for short lists, '**bold**' for an occasional key number. Leave out any section the documents do not support.",
    "stage": "for example Pre-seed",
    "founded": "year or date of incorporation",
    "location": "city and state or country",
    "website": "https://… or null"
  },
  "team": [
    { "name": "", "title": "", "bio": "two or three sentences from the deck", "link": "LinkedIn or personal URL if shown, else null" }
  ],
  "holders": [
    { "name": "person or entity holding shares, or 'Option pool' for unissued reserved shares", "kind": "founder | employee | advisor | investor | pool", "share_class": "Common", "shares": 0 }
  ],
  "round": {
    "name": "for example Pre-seed",
    "instrument": "safe | priced",
    "target_amount": 0,
    "valuation_cap": null,
    "discount_percent": null,
    "pre_money": null,
    "min_check": null,
    "use_of_funds": "one or two sentences on what the money achieves"
  },
  "safes": [
    { "investor": "", "amount": 0, "valuation_cap": null, "discount_percent": null, "type": "post | pre", "mfn": false, "signed_on": "YYYY-MM-DD or null", "status": "signed" }
  ],
  "unsure": ["anything missing, unclear, unsigned or contradictory that I should check, one item per line"]
}
\`\`\`

Notes on specific fields:
- "holders" means issued shares and the reserved option pool only. Do not list SAFE investors there; they go under "safes". Authorised but unissued shares that are not an option pool are not a holder.
- "round" is the raise the pitch deck is asking for. Use null for the whole object if the documents do not describe one.
- For a SAFE, "type" is "post" for a post-money SAFE and "pre" for a pre-money one; say so under "unsure" if the document does not make it clear.`;
}
