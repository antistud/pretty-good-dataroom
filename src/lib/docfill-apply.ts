import { db, getSetting, q, q1, run, setSetting } from "./db";
import type { Answer } from "./docfill";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What a suggestion would change, given what is already in the room. Used to draw the review screen. */
export function describe(answer: Answer) {
  const current = {
    one_liner: getSetting("tagline"),
    overview_markdown: getSetting("overview_md"),
    stage: getSetting("fact_stage"),
    founded: getSetting("fact_founded"),
    location: getSetting("fact_location"),
    website: getSetting("fact_website"),
  };
  const team = q<{ name: string }>("SELECT name FROM team_members").map((t) => t.name);
  const holders = q<{ name: string }>("SELECT name FROM holders").map((h) => h.name);
  const safes = q<{ investor_name: string; amount: number }>("SELECT investor_name, amount FROM safes");
  const rounds = q<{ name: string }>("SELECT name FROM rounds").map((r) => r.name);
  return {
    current,
    teamExists: (name: string) => team.some((t) => same(t, name)),
    holderExists: (name: string) => holders.some((h) => same(h, name)),
    safeExists: (investor: string, amount: number) => safes.some((s) => same(s.investor_name, investor) && Math.abs(s.amount - amount) < 1),
    roundExists: (name: string) => rounds.some((r) => same(r, name)),
  };
}

export const COMPANY_FIELDS = [
  ["one_liner", "One-line description", "tagline"],
  ["overview_markdown", "Overview", "overview_md"],
  ["stage", "Stage", "fact_stage"],
  ["founded", "Founded", "fact_founded"],
  ["location", "Location", "fact_location"],
  ["website", "Website", "fact_website"],
] as const;

/**
 * Applies the parts of a suggestion the founder ticked. `picked` holds the
 * names of the ticked boxes. Things already in the room are never duplicated.
 */
export function applyAnswer(answer: Answer, picked: Set<string>): string[] {
  const done: string[] = [];
  const d = describe(answer);
  db.transaction(() => {
    if (answer.company) {
      let n = 0;
      for (const [key, , setting] of COMPANY_FIELDS) {
        const value = answer.company[key];
        if (value && picked.has(`c_${key}`)) { setSetting(setting, value); n++; }
      }
      if (n) done.push(`${n} company detail${n === 1 ? "" : "s"}`);
    }
    let pos = q1<{ m: number | null }>("SELECT MAX(position) AS m FROM team_members")?.m ?? -1;
    let team = 0;
    answer.team.forEach((m, i) => {
      if (!picked.has(`t_${i}`) || d.teamExists(m.name)) return;
      run("INSERT INTO team_members (name, title, bio, link, position) VALUES (?,?,?,?,?)", m.name, m.title || null, m.bio || null, m.link || null, ++pos);
      team++;
    });
    if (team) done.push(`${team} team member${team === 1 ? "" : "s"}`);

    let hpos = q1<{ m: number | null }>("SELECT MAX(position) AS m FROM holders")?.m ?? -1;
    let holders = 0;
    answer.holders.forEach((h, i) => {
      if (!picked.has(`h_${i}`) || d.holderExists(h.name)) return;
      run("INSERT INTO holders (name, kind, share_class, shares, position) VALUES (?,?,?,?,?)", h.name, h.kind, h.share_class, h.shares, ++hpos);
      holders++;
    });
    if (holders) done.push(`${holders} shareholder${holders === 1 ? "" : "s"}`);

    if (answer.round && picked.has("r") && !d.roundExists(answer.round.name)) {
      const r = answer.round;
      run(
        "INSERT INTO rounds (name, instrument, target_amount, valuation_cap, discount, pre_money, min_check, terms_md, min_level) VALUES (?,?,?,?,?,?,?,?, (SELECT MIN(level) FROM tiers))",
        r.name, r.instrument, r.target_amount, r.valuation_cap, r.discount_percent ? r.discount_percent / 100 : null, r.pre_money, r.min_check, r.use_of_funds ? `**What this round is for:** ${r.use_of_funds}` : null,
      );
      done.push("a round (in planning)");
    }

    let safes = 0;
    answer.safes.forEach((s, i) => {
      if (!picked.has(`s_${i}`) || d.safeExists(s.investor, s.amount)) return;
      run(
        "INSERT INTO safes (investor_name, amount, kind, valuation_cap, discount, mfn, status, signed_on) VALUES (?,?,?,?,?,?,?,?)",
        s.investor, s.amount, s.type, s.valuation_cap, s.discount_percent ? s.discount_percent / 100 : null, s.mfn ? 1 : 0, s.status, s.signed_on,
      );
      safes++;
    });
    if (safes) done.push(`${safes} SAFE${safes === 1 ? "" : "s"}`);
  })();
  return done;
}
