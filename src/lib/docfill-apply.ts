import { db, getSetting, q, q1, run, setSetting } from "./db";
import type { Answer } from "./docfill";

/**
 * Turning an assistant's suggestion into changes to the room.
 *
 * Every entry is compared with what is already there and becomes one of:
 *   new      nothing by that name exists, and there is enough to create it
 *   update   it exists, and one or more fields would change
 *   same     it exists and already says this
 *   invalid  it cannot be applied, with the reason
 * The founder sees exactly that on the review screen and ticks what to apply.
 */
export type Change = { label: string; from: string; to: string };
export type Plan = { kind: "new" | "update" | "same" | "invalid"; title: string; summary: string; changes: Change[]; why?: string };
type Work = Plan & { id?: number; sets: Record<string, string | number | null> };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));
const usd = (v: number | null | undefined) => (v == null ? "—" : `$${Math.round(v).toLocaleString("en-US")}`);
const txt = (v: string | number | null | undefined) => (v == null || v === "" ? "—" : String(v));
const cut = (s: string | null | undefined) => (!s ? "—" : s.length > 70 ? `${s.slice(0, 67)}…` : s);

/** Collects the fields of one entry that differ from what is stored. */
function differ(existing: Record<string, unknown> | undefined) {
  const sets: Work["sets"] = {};
  const changes: Change[] = [];
  return {
    sets,
    changes,
    /** Proposes `value` for `column` unless nothing was given or it already says that. */
    put(column: string, label: string, value: string | number | null, show: (v: never) => string = txt as never, close = false) {
      if (value == null || value === "") return;
      const now = existing?.[column];
      const equal = typeof value === "number" && typeof now === "number" ? Math.abs(now - value) < (close ? 1e-6 : 0.5) : typeof now === "string" && typeof value === "string" ? now.trim() === value.trim() : now === value;
      if (existing && equal) return;
      sets[column] = value;
      changes.push({ label, from: existing ? (show as (v: unknown) => string)(now) : "", to: (show as (v: unknown) => string)(value) });
    },
  };
}
const outcome = (existing: unknown, changes: Change[]): Plan["kind"] => (!existing ? "new" : changes.length ? "update" : "same");

export const COMPANY_FIELDS = [
  ["name", "Company name", "company_name"],
  ["one_liner", "One-line description", "tagline"],
  ["overview_markdown", "Overview", "overview_md"],
  ["stage", "Stage", "fact_stage"],
  ["founded", "Founded", "fact_founded"],
  ["location", "Location", "fact_location"],
  ["website", "Website", "fact_website"],
] as const;

function work(answer: Answer) {
  const team = q<{ id: number; name: string; title: string | null; bio: string | null; link: string | null }>("SELECT id, name, title, bio, link FROM team_members");
  const teamPlans: Work[] = answer.team.map((m) => {
    const ex = team.find((t) => same(t.name, m.name));
    const d = differ(ex);
    d.put("title", "Title", m.title);
    d.put("bio", "Bio", m.bio, cut as never);
    d.put("link", "Link", m.link);
    return { kind: outcome(ex, d.changes), id: ex?.id, title: m.name, summary: [m.title, m.bio].filter(Boolean).join(". "), changes: d.changes, sets: d.sets };
  });

  type H = { id: number; name: string; kind: string; share_class: string; shares: number; notes: string | null; start_date: string | null; end_date: string | null; vest_months: number | null; cliff_months: number | null };
  const holders = q<H>("SELECT * FROM holders");
  const holderPlans: Work[] = answer.holders.map((h) => {
    const ex = holders.find((x) => same(x.name, h.name));
    const d = differ(ex);
    d.put("kind", "Type", h.kind);
    d.put("share_class", "Class", h.share_class);
    d.put("shares", "Shares granted", h.shares, n0 as never);
    d.put("start_date", "Started", h.start_date);
    d.put("vest_months", "Vests over (months)", h.vest_months);
    d.put("cliff_months", "Cliff (months)", h.cliff_months);
    d.put("end_date", "Left on", h.end_date);
    d.put("notes", "Notes", h.notes, cut as never);
    const after = { ...ex, ...d.sets } as Partial<H>;
    const base = { id: ex?.id, title: h.name, summary: h.shares != null ? `${n0(h.shares)} ${h.share_class || "Common"} shares` : "", changes: d.changes, sets: d.sets };
    const bad = (why: string): Work => ({ ...base, kind: "invalid", why });
    if (!ex && h.shares == null) return bad("Not on the cap table yet, and no share count was given.");
    if (after.start_date && after.end_date && after.end_date < after.start_date) return bad("The leaving date is before the start date.");
    if (after.vest_months && !after.start_date) return bad("A vesting period needs a start date.");
    if (after.cliff_months != null && after.vest_months != null && after.cliff_months > after.vest_months) return bad("The cliff is longer than the vesting period.");
    if ((ex?.kind ?? h.kind) === "pool" && (after.start_date || after.end_date || after.vest_months)) return bad("The option pool cannot have dates or vesting.");
    return { ...base, kind: outcome(ex, d.changes) };
  });

  type S = { id: number; investor_name: string; amount: number; kind: string; valuation_cap: number | null; discount: number | null; mfn: number; status: string; signed_on: string | null };
  const safes = q<S>("SELECT * FROM safes");
  const safePlans: Work[] = answer.safes.map((s) => {
    const mine = safes.filter((x) => same(x.investor_name, s.investor));
    const exact = s.amount != null ? mine.find((x) => Math.abs(x.amount - s.amount!) < 1) : undefined;
    const ex = exact ?? (mine.length === 1 ? mine[0] : undefined);
    const d = differ(ex);
    d.put("amount", "Amount", s.amount, usd as never);
    d.put("valuation_cap", "Valuation cap", s.valuation_cap, usd as never);
    d.put("discount", "Discount", s.discount_percent != null ? s.discount_percent / 100 : null, ((v: number | null) => (v == null ? "—" : `${+(v * 100).toFixed(2)}%`)) as never, true);
    d.put("kind", "Type", s.type, ((v: string) => (v === "pre" ? "pre-money" : v === "post" ? "post-money" : "—")) as never);
    d.put("mfn", "MFN", s.mfn == null ? null : s.mfn ? 1 : 0, ((v: number | null) => (v == null ? "—" : v ? "yes" : "no")) as never);
    d.put("signed_on", "Date signed", s.signed_on);
    d.put("status", "Status", s.status);
    const base = { id: ex?.id, title: s.investor, summary: s.amount != null ? `${usd(s.amount)}${s.valuation_cap ? ` at a ${usd(s.valuation_cap)} cap` : ""}` : "", changes: d.changes, sets: d.sets };
    if (!ex && mine.length > 1) return { ...base, kind: "invalid" as const, why: `There are ${mine.length} SAFEs with this investor. Include the amount so the right one is updated.` };
    if (!ex && s.amount == null) return { ...base, kind: "invalid" as const, why: "No SAFE with this investor yet, and no amount was given." };
    return { ...base, kind: outcome(ex, d.changes) };
  });

  type R = { id: number; name: string; instrument: string; target_amount: number; valuation_cap: number | null; discount: number | null; pre_money: number | null; min_check: number | null; terms_md: string | null };
  let roundPlan: Work | null = null;
  if (answer.round) {
    const r = answer.round;
    const ex = q<R>("SELECT * FROM rounds").find((x) => same(x.name, r.name));
    const d = differ(ex);
    d.put("instrument", "Instrument", r.instrument);
    d.put("target_amount", "Target", r.target_amount, usd as never);
    d.put("valuation_cap", "Valuation cap", r.valuation_cap, usd as never);
    d.put("discount", "Discount", r.discount_percent != null ? r.discount_percent / 100 : null, ((v: number | null) => (v == null ? "—" : `${+(v * 100).toFixed(2)}%`)) as never, true);
    d.put("pre_money", "Pre-money valuation", r.pre_money, usd as never);
    d.put("min_check", "Minimum cheque", r.min_check, usd as never);
    // The founder's own description of the round is never overwritten; it is only filled in when empty.
    if (r.use_of_funds && !ex?.terms_md) d.put("terms_md", "What it is for", `**What this round is for:** ${r.use_of_funds}`, cut as never);
    const base = { id: ex?.id, title: r.name, summary: r.target_amount != null ? `raising ${usd(r.target_amount)}${r.valuation_cap ? ` at a ${usd(r.valuation_cap)} cap` : ""}` : "", changes: d.changes, sets: d.sets };
    roundPlan = !ex && r.target_amount == null ? { ...base, kind: "invalid", why: "No round by this name yet, and no target amount was given." } : { ...base, kind: outcome(ex, d.changes) };
  }

  type M = { month: string; revenue: number; expenses: number; cash: number; notes: string | null };
  const monthsNow = q<M>("SELECT * FROM financials");
  const monthPlans: Work[] = answer.financials.map((m) => {
    const ex = monthsNow.find((x) => x.month === m.month);
    const d = differ(ex);
    d.put("revenue", "Revenue", m.revenue, usd as never);
    d.put("expenses", "Expenses", m.expenses, usd as never);
    d.put("cash", "Cash at month end", m.cash, usd as never);
    d.put("notes", "Notes", m.notes, cut as never);
    const base = { title: m.month, summary: [m.revenue != null && `revenue ${usd(m.revenue)}`, m.expenses != null && `expenses ${usd(m.expenses)}`, m.cash != null && `cash ${usd(m.cash)}`].filter(Boolean).join(", "), changes: d.changes, sets: d.sets };
    if (!ex && m.cash == null) return { ...base, kind: "invalid" as const, why: "A new month needs the cash balance at month end." };
    return { ...base, kind: outcome(ex, d.changes) };
  });

  return { teamPlans, holderPlans, safePlans, roundPlan, monthPlans };
}

/** What a suggestion would change, given what is already in the room. Used to draw the review screen. */
export function describe(answer: Answer) {
  const w = work(answer);
  const company = COMPANY_FIELDS.filter(([key]) => answer.company?.[key]).map(([key, label, setting]) => {
    const value = answer.company![key];
    const now = getSetting(setting);
    const untouched = !now || (key === "name" && now === "Your Company");
    return { key, label, value, now, kind: (untouched ? "new" : now.trim() === value.trim() ? "same" : "update") as Plan["kind"] };
  });
  const strip = (p: Work): Plan => ({ kind: p.kind, title: p.title, summary: p.summary, changes: p.changes, why: p.why });
  return { company, team: w.teamPlans.map(strip), holders: w.holderPlans.map(strip), safes: w.safePlans.map(strip), round: w.roundPlan ? strip(w.roundPlan) : null, financials: w.monthPlans.map(strip) };
}

/** How many entries of each outcome a suggestion holds, for telling the assistant what the room made of it. */
export function tally(answer: Answer): Record<Plan["kind"], number> {
  const d = describe(answer);
  const all = [...d.company, ...d.team, ...d.holders, ...d.safes, ...(d.round ? [d.round] : []), ...d.financials];
  return { new: all.filter((p) => p.kind === "new").length, update: all.filter((p) => p.kind === "update").length, same: all.filter((p) => p.kind === "same").length, invalid: all.filter((p) => p.kind === "invalid").length };
}

const HOLDER_COLS = ["kind", "share_class", "shares", "start_date", "end_date", "vest_months", "cliff_months", "notes"];
const TEAM_COLS = ["title", "bio", "link"];
const SAFE_COLS = ["amount", "kind", "valuation_cap", "discount", "mfn", "status", "signed_on"];
const ROUND_COLS = ["instrument", "target_amount", "valuation_cap", "discount", "pre_money", "min_check", "terms_md"];
const MONTH_COLS = ["revenue", "expenses", "cash", "notes"];
/** Column names come from the fixed lists above, never from the suggestion. */
function update(table: string, allowed: string[], sets: Work["sets"], where: string, key: string | number) {
  const cols = Object.keys(sets).filter((c) => allowed.includes(c));
  if (cols.length) run(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE ${where} = ?`, ...cols.map((c) => sets[c]), key);
}

/**
 * Applies the parts of a suggestion the founder ticked. `picked` holds the
 * names of the ticked boxes. Existing entries are updated in place; nothing is
 * duplicated, and anything marked invalid or unchanged is left alone.
 */
export function applyAnswer(answer: Answer, picked: Set<string>): string[] {
  const done: string[] = [];
  const count = (n: number, added: string, changed: number, noun: string) => {
    const parts = [n ? `${n} ${noun}${n === 1 ? "" : "s"} ${added}` : "", changed ? `${changed} ${noun}${changed === 1 ? "" : "s"} updated` : ""].filter(Boolean);
    if (parts.length) done.push(parts.join(", "));
  };
  db.transaction(() => {
    const w = work(answer);
    if (answer.company) {
      let n = 0;
      for (const [key, , setting] of COMPANY_FIELDS) {
        const value = answer.company[key];
        if (value && picked.has(`c_${key}`)) { setSetting(setting, value); n++; }
      }
      if (n) done.push(`${n} company detail${n === 1 ? "" : "s"}`);
    }

    let pos = q1<{ m: number | null }>("SELECT MAX(position) AS m FROM team_members")?.m ?? -1;
    let added = 0, changed = 0;
    w.teamPlans.forEach((p, i) => {
      if (!picked.has(`t_${i}`)) return;
      const m = answer.team[i];
      if (p.kind === "new") { run("INSERT INTO team_members (name, title, bio, link, position) VALUES (?,?,?,?,?)", m.name, m.title || null, m.bio || null, m.link || null, ++pos); added++; }
      else if (p.kind === "update") { update("team_members", TEAM_COLS, p.sets, "id", p.id!); changed++; }
    });
    count(added, "added", changed, "team member");

    let hpos = q1<{ m: number | null }>("SELECT MAX(position) AS m FROM holders")?.m ?? -1;
    added = changed = 0;
    w.holderPlans.forEach((p, i) => {
      if (!picked.has(`h_${i}`)) return;
      const h = answer.holders[i];
      if (p.kind === "new") {
        const person = (h.kind ?? "investor") !== "pool";
        run(
          "INSERT INTO holders (name, kind, share_class, shares, notes, position, start_date, end_date, vest_months, cliff_months) VALUES (?,?,?,?,?,?,?,?,?,?)",
          h.name, h.kind ?? "investor", h.share_class || "Common", h.shares, h.notes || null, ++hpos,
          person ? h.start_date : null, person ? h.end_date : null, person ? h.vest_months || null : null, person && h.vest_months ? h.cliff_months ?? 0 : null,
        );
        added++;
      } else if (p.kind === "update") { update("holders", HOLDER_COLS, p.sets, "id", p.id!); changed++; }
    });
    count(added, "added", changed, "shareholder");

    if (w.roundPlan && picked.has("r") && answer.round) {
      const r = answer.round;
      if (w.roundPlan.kind === "new") {
        run(
          "INSERT INTO rounds (name, instrument, target_amount, valuation_cap, discount, pre_money, min_check, terms_md, min_level) VALUES (?,?,?,?,?,?,?,?, (SELECT MIN(level) FROM tiers))",
          r.name, r.instrument ?? "safe", r.target_amount, r.valuation_cap, r.discount_percent ? r.discount_percent / 100 : null, r.pre_money, r.min_check, r.use_of_funds ? `**What this round is for:** ${r.use_of_funds}` : null,
        );
        done.push("a round (in planning)");
      } else if (w.roundPlan.kind === "update") { update("rounds", ROUND_COLS, w.roundPlan.sets, "id", w.roundPlan.id!); done.push("the round updated"); }
    }

    added = changed = 0;
    w.safePlans.forEach((p, i) => {
      if (!picked.has(`s_${i}`)) return;
      const s = answer.safes[i];
      if (p.kind === "new") {
        run(
          "INSERT INTO safes (investor_name, amount, kind, valuation_cap, discount, mfn, status, signed_on) VALUES (?,?,?,?,?,?,?,?)",
          s.investor, s.amount, s.type ?? "post", s.valuation_cap, s.discount_percent ? s.discount_percent / 100 : null, s.mfn ? 1 : 0, s.status ?? "signed", s.signed_on,
        );
        added++;
      } else if (p.kind === "update") { update("safes", SAFE_COLS, p.sets, "id", p.id!); changed++; }
    });
    count(added, "added", changed, "SAFE");

    added = changed = 0;
    w.monthPlans.forEach((p, i) => {
      if (!picked.has(`f_${i}`)) return;
      const m = answer.financials[i];
      if (p.kind === "new") { run("INSERT INTO financials (month, revenue, expenses, cash, notes) VALUES (?,?,?,?,?)", m.month, m.revenue ?? 0, m.expenses ?? 0, m.cash ?? 0, m.notes || null); added++; }
      else if (p.kind === "update") { update("financials", MONTH_COLS, p.sets, "month", m.month); changed++; }
    });
    count(added, "added", changed, "month");
  })();
  return done;
}
