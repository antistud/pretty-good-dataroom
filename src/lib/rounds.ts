import { getSetting, q, q1 } from "./db";
import { standing, type HolderInput, type SafeInput, type Standing } from "./captable";

/** discount and new_pool_pct are stored as fractions (0.2 = 20%). */
export type RoundRow = {
  id: number;
  name: string;
  instrument: "safe" | "priced";
  status: "planning" | "open" | "closing" | "closed";
  target_amount: number;
  valuation_cap: number | null;
  discount: number | null;
  pre_money: number | null;
  new_pool_pct: number | null;
  min_check: number | null;
  terms_md: string | null;
  min_level: number;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
};
export type SafeRow = {
  id: number;
  round_id: number | null;
  org_id: number | null;
  investor_name: string;
  amount: number;
  kind: "post" | "pre";
  valuation_cap: number | null;
  discount: number | null;
  mfn: number;
  status: "committed" | "signed" | "wired";
  signed_on: string | null;
  document_id: number | null;
  notes: string | null;
};
export type HolderRow = {
  id: number; name: string; kind: HolderInput["kind"]; share_class: string; notes: string | null; position: number;
  /** Shares that count on the cap table today: everything granted, or only what had vested if the person has left. */
  shares: number;
  start_date: string | null; end_date: string | null; vest_months: number | null; cliff_months: number | null;
} & Standing;

/** Every holder with their dates applied. Use this, not the table, wherever shares are counted. */
export function listHolders(today = new Date().toISOString().slice(0, 10)): HolderRow[] {
  return q<Omit<HolderRow, keyof Standing>>("SELECT * FROM holders ORDER BY position, id").map((h) => {
    const st = standing({ shares: h.shares, start: h.start_date, end: h.end_date, vestMonths: h.vest_months, cliffMonths: h.cliff_months }, today);
    return { ...h, ...st, shares: st.held };
  });
}

export const ROUND_STATUSES = ["planning", "open", "closing", "closed"] as const;
export const STATUS_LABEL: Record<RoundRow["status"], string> = { planning: "Planning", open: "Open", closing: "Closing", closed: "Closed" };

export function getRound(id: number): RoundRow | undefined {
  return q1<RoundRow>("SELECT * FROM rounds WHERE id = ?", id);
}

/** Money on SAFEs in a round, split by where each one has got to. Buckets do not overlap. */
export function roundTotals(roundId: number): { committed: number; signed: number; wired: number; total: number } {
  const out = { committed: 0, signed: 0, wired: 0, total: 0 };
  for (const r of q<{ status: SafeRow["status"]; amt: number }>("SELECT status, SUM(amount) AS amt FROM safes WHERE round_id = ? GROUP BY status", roundId)) {
    out[r.status] = r.amt;
    out.total += r.amt;
  }
  return out;
}

/** The round being raised now: open or closing first, otherwise the newest one still in planning. */
export function currentRound(): RoundRow | undefined {
  return (
    q1<RoundRow>("SELECT * FROM rounds WHERE status IN ('open','closing') ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, id DESC LIMIT 1") ??
    q1<RoundRow>("SELECT * FROM rounds WHERE status = 'planning' ORDER BY id DESC LIMIT 1")
  );
}

export function holderInputs(): HolderInput[] {
  return listHolders().filter((h) => h.shares > 0).map((h) => ({ name: h.name, kind: h.kind, shareClass: h.share_class, shares: h.shares }));
}
export function safeInputs(where = "", ...params: unknown[]): SafeInput[] {
  return q<SafeRow>(`SELECT * FROM safes ${where} ORDER BY signed_on, id`, ...params).map((s) => ({
    name: s.investor_name, amount: s.amount, kind: s.kind, cap: s.valuation_cap, discount: s.discount, mfn: !!s.mfn,
  }));
}

export type CheckItem = { key: string; title: string; help: string; href: string; done: boolean; auto: boolean };

type Def = Omit<CheckItem, "done" | "auto"> & { auto?: boolean };

const count = (sql: string, ...p: unknown[]) => q1<{ n: number }>(sql, ...p)?.n ?? 0;
const docsInFolder = (like: string) =>
  count("SELECT COUNT(*) AS n FROM documents d JOIN folders f ON f.id = d.folder_id WHERE f.name LIKE ? AND d.current_version_id IS NOT NULL", like);

export const READY_MANUAL = ["lawyer", "bank"];
export const CLOSING_MANUAL = ["board", "captable", "filings", "update", "thanks", "access"];

function build(scope: string, defs: Def[], autoDone: Record<string, boolean>): CheckItem[] {
  const ticked = new Set(q<{ key: string }>("SELECT key FROM checks WHERE scope = ?", scope).map((r) => r.key));
  return defs.map((d) => {
    const auto = d.key in autoDone;
    return { ...d, auto, done: auto ? autoDone[d.key] : ticked.has(d.key) };
  });
}

/** What should be in place before a round opens. Auto items are detected from the room itself. */
export function readyChecklist(roundId: number): CheckItem[] {
  const r = getRound(roundId);
  if (!r) return [];
  const here = `/rounds/${roundId}`;
  return build(
    `round:${roundId}:ready`,
    [
      { key: "deck", title: "Upload your pitch deck", help: "Investors open this first. Put it in the Pitch folder.", href: "/documents" },
      { key: "overview", title: "Write the company overview", help: "Two or three paragraphs: what you do, for whom, and why now.", href: "/overview" },
      { key: "team", title: "Fill in the team page", help: "At pre-seed, investors are mostly backing the people.", href: "/team" },
      { key: "holders", title: "Enter your cap table", help: "List every shareholder and the option pool so ownership is clear.", href: "/captable" },
      { key: "orgdocs", title: "Upload your incorporation documents", help: "Certificate of incorporation, bylaws and board consents go in Company & org docs.", href: "/documents" },
      { key: "financials", title: "Enter cash, revenue and spend", help: "Even three months of numbers shows your burn and runway.", href: "/financials" },
      { key: "target", title: "Set how much you are raising", help: "A target amount lets the progress bar and pipeline add up.", href: here },
      { key: "terms", title: "Set the headline terms", help: r.instrument === "safe" ? "A valuation cap, a discount, or both." : "The pre-money valuation.", href: here },
      { key: "termsmd", title: "Write a short terms summary for investors", help: "What they are buying, the minimum cheque and your timeline, in plain words.", href: here },
      { key: "leads", title: "Add your first target investors to the pipeline", help: "Aim for a list of at least 30 before you start conversations.", href: "/pipeline" },
      { key: "lawyer", title: "Have a lawyer look over the documents you will send", help: "Even a standard SAFE deserves a quick review. This app is not legal advice.", href: here },
      { key: "bank", title: "Have wire instructions ready", help: "Confirm the bank account that will receive funds and keep the details in the Closing folder.", href: "/documents" },
    ],
    {
      deck: docsInFolder("Pitch%") > 0,
      overview: getSetting("overview_md").trim().length > 0,
      team: count("SELECT COUNT(*) AS n FROM team_members") > 0,
      holders: count("SELECT COUNT(*) AS n FROM holders WHERE kind != 'pool' AND shares > 0") > 0,
      orgdocs: docsInFolder("Company%") > 0,
      financials: count("SELECT COUNT(*) AS n FROM financials") > 0,
      target: r.target_amount > 0,
      terms: r.instrument === "safe" ? !!(r.valuation_cap || r.discount) : !!r.pre_money,
      termsmd: !!r.terms_md?.trim(),
      leads: count("SELECT COUNT(*) AS n FROM leads WHERE round_id = ?", roundId) > 0,
    },
  );
}

/** What to finish as money comes in and after the last wire. */
export function closingChecklist(roundId: number): CheckItem[] {
  if (!getRound(roundId)) return [];
  const n = count("SELECT COUNT(*) AS n FROM safes WHERE round_id = ?", roundId);
  return build(
    `round:${roundId}:closing`,
    [
      { key: "recorded", title: "Record every investment in this round", help: "Each SAFE or cheque should appear on the cap table page, linked to this round.", href: "/captable" },
      { key: "signed", title: "File a signed copy for every investment", help: "Upload the countersigned PDF and attach it to its SAFE.", href: "/captable" },
      { key: "wired", title: "Confirm every wire has arrived", help: "Check the bank, then mark each SAFE as wired.", href: "/captable" },
      { key: "board", title: "Board consent approving the round", help: "Your board (often just the founders) should approve the financing in writing. File it under Company & org docs.", href: "/documents" },
      { key: "captable", title: "Check the cap table is up to date", help: "New holders, option grants and SAFE terms should all match the signed documents.", href: "/captable" },
      { key: "filings", title: "Talk to your lawyer about securities filings", help: "In the US this usually means a Form D and state notices shortly after the first sale. Your lawyer files these.", href: `/rounds/${roundId}` },
      { key: "update", title: "Schedule the first investor update", help: "New investors should hear from you within a month of wiring.", href: "/updates" },
      { key: "thanks", title: "Thank everyone who invested or helped", help: "Including the people who made introductions.", href: "/intros" },
      { key: "access", title: "Tidy up access", help: "Investors who passed can become supporters so they keep getting updates.", href: "/people" },
    ],
    {
      recorded: n > 0,
      signed: n > 0 && count("SELECT COUNT(*) AS n FROM safes WHERE round_id = ? AND document_id IS NULL", roundId) === 0,
      wired: n > 0 && count("SELECT COUNT(*) AS n FROM safes WHERE round_id = ? AND status != 'wired'", roundId) === 0,
    },
  );
}
