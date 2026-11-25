import { db, getSetting, q1, run, setSetting } from "./db";
import { periodOf } from "./updates";

type Ids = Record<string, (number | string)[]>;

/** True when nothing real has been entered yet, so sample data cannot mix with real data. */
export function roomIsEmpty(): boolean {
  const n = (t: string) => q1<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)?.n ?? 0;
  return n("leads") + n("holders") + n("rounds") + n("safes") + n("financials") + n("team_members") + n("intro_asks") === 0;
}
export function sampleLoaded(): boolean {
  return getSetting("sample_ids").length > 2;
}

/** Fills an empty room with a fictional company so a founder can look around. Every row is remembered so it can be removed exactly. */
export function loadSample(now = new Date()) {
  if (!roomIsEmpty() || sampleLoaded()) return false;
  const ids: Ids = { holders: [], rounds: [], leads: [], safes: [], financials: [], team_members: [], intro_asks: [] };
  const ins = (table: string, sql: string, ...p: unknown[]) => {
    const id = Number(run(sql, ...p).lastInsertRowid);
    ids[table].push(id);
    return id;
  };
  db.transaction(() => {
    for (const [name, kind, shares] of [["Sample Founder A", "founder", 4_500_000], ["Sample Founder B", "founder", 4_500_000], ["Option pool", "pool", 1_000_000]] as const) {
      ins("holders", "INSERT INTO holders (name, kind, shares) VALUES (?,?,?)", name, kind, shares);
    }
    const round = ins(
      "rounds",
      "INSERT INTO rounds (name, instrument, status, target_amount, valuation_cap, min_check, terms_md, min_level, opened_at) VALUES ('Pre-seed (sample)', 'safe', 'open', 750000, 6000000, 10000, ?, 100, datetime('now', '-21 days'))",
      "Raising $750K on post-money SAFEs to reach 20 paying customers and a repeatable sales motion.",
    );
    const day = (offset: number) => new Date(now.getTime() + offset * 86400_000).toISOString().slice(0, 10);
    const leads: [string, string, string, number, string | null, number | null][] = [
      ["Maple Ventures", "Morgan Lee", "wired", 150000, null, null],
      ["Juniper Angels", "Sam Ortiz", "signed", 50000, "Send wire instructions", 0],
      ["Cedar Seed Fund", "Priya Nair", "committed", 100000, "Send the SAFE for signature", -1],
      ["Willow Capital", "Alex Chen", "diligence", 200000, "Answer their churn question", 1],
      ["Aspen Partners", "Jordan Blake", "meeting", 100000, "Follow up with customer references", 2],
      ["Rowan Collective", "Taylor Kim", "interested", 25000, "Book the first call", 3],
      ["Hazel & Co", "Robin Park", "contacted", 50000, "Nudge once", 4],
      ["Birchwood Family Office", "Casey Morgan", "lead", 250000, "Ask Morgan for a warm intro", 5],
      ["Elm Street Angels", "Jamie Fox", "lead", 25000, null, null],
    ];
    for (const [org, contact, stage, cheque, action, due] of leads) {
      const lead = ins(
        "leads",
        "INSERT INTO leads (round_id, org_name, contact_name, contact_email, stage, check_size, source, next_action, next_action_due) VALUES (?,?,?,?,?,?,?,?,?)",
        round, org, contact, null, stage, cheque, "Sample data", action, due == null ? null : day(due),
      );
      run("INSERT INTO lead_notes (lead_id, body) VALUES (?, ?)", lead, "Sample note: first call went well; they liked the early customer traction.");
      if (["committed", "signed", "wired"].includes(stage)) {
        ins("safes", "INSERT INTO safes (round_id, investor_name, amount, kind, valuation_cap, status, signed_on) VALUES (?,?,?, 'post', 6000000, ?, ?)", round, org, cheque, stage, stage === "committed" ? null : day(-5));
      }
    }
    let cash = 310000;
    for (let back = 6; back >= 1; back--) {
      const month = periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)));
      const revenue = 2000 + (6 - back) * 1800;
      const expenses = 34000 + (6 - back) * 1500;
      cash -= expenses - revenue;
      run("INSERT INTO financials (month, revenue, expenses, cash, notes) VALUES (?,?,?,?, 'Sample data')", month, revenue, expenses, cash);
      ids.financials.push(month);
    }
    ins("team_members", "INSERT INTO team_members (name, title, bio, position) VALUES ('Sample Founder A', 'CEO', 'Ten years building products in this market. Previously led product at a company you have heard of.', 0)");
    ins("team_members", "INSERT INTO team_members (name, title, bio, position) VALUES ('Sample Founder B', 'CTO', 'Built and ran the platform team at a fast-growing startup.', 1)");
    ins("intro_asks", "INSERT INTO intro_asks (title, detail, blurb, min_level) VALUES (?,?,?,100)", "Heads of operations at mid-size clinics", "We are looking for three more design partners.", "Meet the founders of a company helping clinics cut admin time. They are looking for design partners and would value 20 minutes.");
    ins("intro_asks", "INSERT INTO intro_asks (title, detail, blurb, min_level) VALUES (?,?,?,100)", "A fractional CFO who knows early-stage SaaS", "A few hours a month.", "An early-stage founder is looking for a fractional CFO for a few hours a month.");
  })();
  setSetting("sample_ids", JSON.stringify(ids));
  return true;
}

/** Removes exactly the rows loadSample created, and nothing else. */
export function clearSample() {
  let ids: Ids;
  try {
    ids = JSON.parse(getSetting("sample_ids") || "{}");
  } catch {
    ids = {};
  }
  db.transaction(() => {
    for (const table of ["safes", "leads", "rounds", "holders", "team_members", "intro_asks"]) {
      for (const id of ids[table] ?? []) run(`DELETE FROM ${table} WHERE id = ?`, id);
    }
    for (const month of ids.financials ?? []) run("DELETE FROM financials WHERE month = ? AND notes = 'Sample data'", month);
  })();
  setSetting("sample_ids", "");
}
