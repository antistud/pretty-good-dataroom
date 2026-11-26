/**
 * Filling the room from the founder's own documents, by way of whichever AI
 * assistant they already use. The app hands them a prompt; they attach their
 * deck, formation documents and SAFEs to it; the assistant answers with one
 * block of structured data; they paste it back here.
 *
 * That answer is untrusted text. Everything below treats it as such: it is
 * parsed leniently, then every value is checked, clamped and typed.
 */

export type Company = { name: string; one_liner: string; overview_markdown: string; stage: string; founded: string; location: string; website: string };
export type Member = { name: string; title: string; bio: string; link: string };
/** `shares` is the number granted. It may be missing when the entry only updates someone already on the cap table. */
export type Holder = {
  name: string; kind: "founder" | "employee" | "advisor" | "investor" | "pool" | null; share_class: string; shares: number | null;
  start_date: string | null; end_date: string | null; vest_months: number | null; cliff_months: number | null; notes: string;
  /** What they kept on leaving, when the paperwork gives a number. */
  shares_kept: number | null;
  /** Fields to empty on an existing entry. A missing or null value never clears anything; this does. */
  clear: string[];
};
export type Round = { name: string; instrument: "safe" | "priced" | null; target_amount: number | null; valuation_cap: number | null; discount_percent: number | null; pre_money: number | null; min_check: number | null; use_of_funds: string };
export type Safe = { investor: string; amount: number | null; valuation_cap: number | null; discount_percent: number | null; type: "post" | "pre" | null; mfn: boolean | null; signed_on: string | null; status: "committed" | "signed" | "wired" | null; clear: string[] };
export type Month = { month: string; revenue: number | null; expenses: number | null; cash: number | null; notes: string };
/** `ignored` lists values that were sent but could not be understood, so the founder and the assistant both hear about them. */
export type Answer = { company: Company | null; team: Member[]; holders: Holder[]; round: Round | null; safes: Safe[]; financials: Month[]; unsure: string[]; ignored: string[] };

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
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const iso = (y: number, m: number, d: number): string | null => {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
};
/**
 * Reads a date however an assistant wrote it: 2026-03-01, 2026/3/1, "March 1, 2026", "1 Mar 2026", or an ISO
 * timestamp. Numeric dates with slashes are read as month/day/year unless the first number is over 12.
 * Returns YYYY-MM-DD, or null if it is not a real date.
 */
export function parseDate(v: unknown): string | null {
  const s = str(v, 40).toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[t ].*)?$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return +m[1] > 12 ? iso(+m[3], +m[2], +m[1]) : iso(+m[3], +m[1], +m[2]);
  m = s.match(/^([a-z]{3,9})\.? (\d{1,2}) (\d{4})$/);
  if (m && MONTHS.includes(m[1].slice(0, 3))) return iso(+m[3], MONTHS.indexOf(m[1].slice(0, 3)) + 1, +m[2]);
  m = s.match(/^(\d{1,2}) ([a-z]{3,9})\.? (\d{4})$/);
  if (m && MONTHS.includes(m[2].slice(0, 3))) return iso(+m[3], MONTHS.indexOf(m[2].slice(0, 3)) + 1, +m[1]);
  return null;
}
/** Reads a month: 2026-10, 2026-10-31, "Oct 2026", "October 2026", 10/2026. Returns YYYY-MM or null. */
export function parseMonth(v: unknown): string | null {
  const s = str(v, 40).toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], 1)?.slice(0, 7) ?? null;
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return iso(+m[2], +m[1], 1)?.slice(0, 7) ?? null;
  m = s.match(/^([a-z]{3,9})\.? (\d{4})$/);
  if (m && MONTHS.includes(m[1].slice(0, 3))) return iso(+m[2], MONTHS.indexOf(m[1].slice(0, 3)) + 1, 1)!.slice(0, 7);
  return parseDate(v)?.slice(0, 7) ?? null;
}
/** A whole number of months from 12, "12", "12 months", "4 years" or "1 year". */
export function months(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 && v <= 240 ? v : null;
  const m = str(v, 30).toLowerCase().match(/^(\d+(?:\.\d+)?) ?(months?|mos?|years?|yrs?)?$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2]?.startsWith("y") ? 12 : 1);
  return Number.isInteger(n) && n >= 0 && n <= 240 ? n : null;
}
/** Zero or more, for money that can legitimately be nothing (revenue in a pre-revenue month). */
const amount0 = (v: unknown): number | null => (v === 0 || v === "0" ? 0 : amount(v));
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

/** The field names in a "clear" list that are allowed for that kind of entry. */
const cleared = (v: unknown, allowed: string[]): string[] => [...new Set(list(v, 10).map((x) => str(x, 40)).filter((x) => allowed.includes(x)))];

/** Turns whatever was pasted into a checked, bounded Answer, or null if it is not usable at all. */
export function parseAnswer(text: string): Answer | null {
  const raw = obj(typeof text === "string" ? extractJson(text.slice(0, 200_000)) : null);
  if (!raw) return null;
  const ignored: string[] = Array.isArray(raw.ignored) ? list(raw.ignored, 40).map((u) => str(u, 300)).filter(Boolean) : [];
  const given = (v: unknown) => v !== null && v !== undefined && v !== "";
  /** Runs a reader over a value; if something was sent but could not be read, says so instead of dropping it silently. */
  const read = <T,>(v: unknown, reader: (v: unknown) => T | null, what: string, expects: string): T | null => {
    const out = reader(v);
    if (out === null && given(v) && ignored.length < 40) ignored.push(`${what}: could not read "${str(v, 60)}". ${expects}`);
    return out;
  };
  const DATE = "Use YYYY-MM-DD.";
  const MONEY = "Use a plain number of US dollars.";

  const c = obj(raw.company);
  const company: Company | null = c
    ? {
        name: str(c.name, 120),
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
    .filter((h): h is Record<string, unknown> => !!h && !!str(h.name, 120))
    .map((h) => {
      const who = str(h.name, 120);
      const kind = str(h.kind, 20).toLowerCase();
      const shares = read(h.shares, amount, `${who}, shares`, "Use a whole number.");
      return {
        name: who,
        kind: (KINDS as readonly string[]).includes(kind) ? (kind as Holder["kind"]) : null,
        share_class: str(h.share_class, 60),
        shares: shares == null ? null : Math.round(shares),
        start_date: read(h.start_date ?? h.vesting_start, parseDate, `${who}, start date`, DATE),
        end_date: read(h.end_date ?? h.left_on, parseDate, `${who}, leaving date`, DATE),
        vest_months: read(h.vest_months ?? h.vesting_months, months, `${who}, vesting period`, "Use a whole number of months, for example 48."),
        cliff_months: read(h.cliff_months, months, `${who}, cliff`, "Use a whole number of months, for example 12."),
        notes: str(h.notes, 500),
        shares_kept: read(h.shares_kept, amount0, `${who}, shares kept`, "Use a whole number."),
        clear: cleared(h.clear, ["start_date", "end_date", "vest_months", "cliff_months", "shares_kept", "notes"]),
      };
    })
    .filter((h) => h.clear.length > 0 || h.shares_kept != null || h.shares != null || h.kind || h.share_class || h.start_date || h.end_date || h.vest_months != null || h.cliff_months != null || h.notes);

  const r = obj(raw.round);
  const rname = r ? str(r.name, 120) : "";
  const instrument = r ? str(r.instrument, 20).toLowerCase() : "";
  const round: Round | null = r
    ? {
        name: rname || "Pre-seed",
        instrument: instrument === "priced" ? "priced" : instrument === "safe" ? "safe" : null,
        target_amount: read(r.target_amount, amount, "Round, target amount", MONEY),
        valuation_cap: read(r.valuation_cap, amount, "Round, valuation cap", MONEY),
        discount_percent: read(r.discount_percent, percent, "Round, discount", "Use a number such as 20 for 20%."),
        pre_money: read(r.pre_money, amount, "Round, pre-money valuation", MONEY),
        min_check: read(r.min_check, amount, "Round, minimum cheque", MONEY),
        use_of_funds: str(r.use_of_funds, 2000),
      }
    : null;
  const roundUseful = !!round && (round.target_amount != null || round.valuation_cap != null || round.discount_percent != null || round.pre_money != null || round.min_check != null || !!round.use_of_funds);

  const safes: Safe[] = list(raw.safes, 200)
    .map(obj)
    .filter((s): s is Record<string, unknown> => !!s && !!str(s.investor, 120))
    .map((s) => {
      const who = `SAFE with ${str(s.investor, 120)}`;
      const type = str(s.type, 10).toLowerCase();
      const status = str(s.status, 12).toLowerCase();
      return {
        investor: str(s.investor, 120),
        amount: read(s.amount, amount, `${who}, amount`, MONEY),
        valuation_cap: read(s.valuation_cap, amount, `${who}, valuation cap`, MONEY),
        discount_percent: read(s.discount_percent, percent, `${who}, discount`, "Use a number such as 20 for 20%."),
        type: type === "pre" ? "pre" : type === "post" ? "post" : null,
        mfn: typeof s.mfn === "boolean" ? s.mfn : null,
        signed_on: read(s.signed_on, parseDate, `${who}, date signed`, DATE),
        status: status === "wired" || status === "signed" || status === "committed" ? status : null,
        clear: cleared(s.clear, ["valuation_cap", "discount_percent", "signed_on"]),
      } as Safe;
    })
    .filter((s) => s.clear.length > 0 || s.amount != null || s.valuation_cap != null || s.discount_percent != null || s.type || s.mfn != null || s.signed_on || s.status);

  const seen = new Set<string>();
  const financials: Month[] = list(raw.financials, 60)
    .map(obj)
    .filter((m): m is Record<string, unknown> => !!m)
    .map((m) => ({
      month: read(m.month, parseMonth, "Financials, month", "Use YYYY-MM.") ?? "",
      revenue: read(m.revenue, amount0, `Financials ${str(m.month, 20)}, revenue`, MONEY),
      expenses: read(m.expenses, amount0, `Financials ${str(m.month, 20)}, expenses`, MONEY),
      cash: read(m.cash ?? m.cash_at_month_end, amount0, `Financials ${str(m.month, 20)}, cash`, MONEY),
      notes: str(m.notes, 500),
    }))
    .filter((m) => m.month && !seen.has(m.month) && (seen.add(m.month), m.revenue != null || m.expenses != null || m.cash != null || !!m.notes));

  const unsure = list(raw.unsure, 30).map((u) => str(u, 400)).filter(Boolean);
  const companyUseful = !!company && Object.values(company).some(Boolean);
  if (!companyUseful && !team.length && !holders.length && !roundUseful && !safes.length && !financials.length) return null;
  return { company: companyUseful ? company : null, team, holders, round: roundUseful ? round : null, safes, financials, unsure, ignored: ignored.slice(0, 40) };
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
    { "name": "person or entity holding shares, or 'Option pool' for unissued reserved shares", "kind": "founder | employee | advisor | investor | pool", "share_class": "Common", "shares": 0, "start_date": "YYYY-MM-DD vesting start, or null", "vest_months": null, "cliff_months": null, "end_date": "YYYY-MM-DD if they have left, else null", "shares_kept": "the number kept on leaving if the separation paperwork states one, else null" }
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
  "financials": [
    { "month": "YYYY-MM", "revenue": 0, "expenses": 0, "cash": 0, "notes": null }
  ],
  "unsure": ["anything missing, unclear, unsigned or contradictory that I should check, one item per line"]
}
\`\`\`

Notes on specific fields:
- "holders": "shares" is the number originally granted or bought. If the shares vest, give the start date, the vesting period and the cliff in months; if the person has left, give the date. Leave those null when the documents do not say.
- "financials" is one entry per month, only if a document gives monthly figures; "cash" is the bank balance at month end. Leave the list empty otherwise.
- "holders" means issued shares and the reserved option pool only. Do not list SAFE investors there; they go under "safes". Authorised but unissued shares that are not an option pool are not a holder.
- "round" is the raise the pitch deck is asking for. Use null for the whole object if the documents do not describe one.
- For a SAFE, "type" is "post" for a post-money SAFE and "pre" for a pre-money one; say so under "unsure" if the document does not make it clear.`;
}
