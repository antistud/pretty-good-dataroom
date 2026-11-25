import { getSetting, q, q1, run } from "./db";
import { escapeHtml } from "./mail";
import { founderIds, notify, orgMemberIds, replyToFounder, staffIds } from "./notify";
import { money, monthLabel } from "./format";
import { periodOf, updateDue } from "./updates";

/** The things the app does on its own. Each can be switched off in Settings. */
export const AUTOMATIONS = [
  { key: "next_action", title: "Set the next step for me", help: "When an investor moves stage, set a sensible follow-up and date if you have not set one yourself." },
  { key: "welcome", title: "Welcome new people", help: "Email a short welcome when someone accepts their invitation, and tell you they have joined." },
  { key: "wire_thanks", title: "Thank investors when the wire lands", help: "Send a thank-you when you confirm a wire, and tell them what happens next." },
  { key: "engagement_alerts", title: "Tell me when investors lean in", help: "A note when a firm opens the deck for the first time, keeps returning to the financials, or downloads something." },
  { key: "onboarding_nudge", title: "Nudge people who have not started", help: "One gentle email to anyone who joined three days ago and has not opened anything." },
  { key: "financials_reminder", title: "Remind me about the numbers", help: "Early each month, a reminder to add last month's cash and spend, and a warning when runway drops under six months." },
  { key: "weekly_summary", title: "Monday summary", help: "A short email each Monday: what moved last week and what is due this week." },
] as const;
export type AutomationKey = (typeof AUTOMATIONS)[number]["key"];

export function automationOn(key: AutomationKey): boolean {
  return getSetting(`auto_${key}`) === "1";
}

const wasSent = (key: string) => !!q1("SELECT 1 FROM sent_log WHERE key = ?", key);
const markSent = (key: string) => run("INSERT OR IGNORE INTO sent_log (key) VALUES (?)", key);
const company = () => getSetting("company_name");
const first = (name: string) => name.split(/\s+/)[0];
const fire = (p: Promise<unknown>) => void p.catch((e) => console.error("[automation]", (e as Error).message));

const SECTION_NAMES: Record<string, string> = { documents: "documents", round: "the round terms", requests: "questions and requests", captable: "the cap table and SAFEs", financials: "the financials" };

/** Tells a firm what they can now see after their access goes up. */
export function announceAccess(orgId: number, oldLevel: number, newLevel: number, byUserId?: number) {
  if (newLevel <= oldLevel) return;
  const opened = Object.entries(SECTION_NAMES)
    .filter(([key]) => {
      const lvl = Number(getSetting(`level_${key}`));
      return lvl > oldLevel && lvl <= newLevel;
    })
    .map(([, label]) => label);
  const folders = q<{ name: string }>("SELECT name FROM folders WHERE parent_id IS NULL AND min_level > ? AND min_level <= ? ORDER BY position", oldLevel, newLevel).map((f) => f.name);
  const what = [...opened, ...(folders.length ? [`the ${folders.join(", ")} folder${folders.length === 1 ? "" : "s"}`] : [])];
  if (!what.length) return;
  const list = what.length === 1 ? what[0] : `${what.slice(0, -1).join(", ")} and ${what[what.length - 1]}`;
  fire(
    notify(orgMemberIds(orgId), {
      category: "access",
      title: `You can now see more of the ${company()} room`,
      body: `Newly open to you: ${list}.`,
      href: "/home",
      cta: "Take a look",
      mail: { replyTo: replyToFounder(byUserId) },
    }),
  );
}

type LeadLite = { id: number; org_id: number | null; org_name: string; next_action: string | null; next_action_due: string | null; check_size: number | null };

const NEXT: Record<string, [string, number] | null> = {
  contacted: ["Follow up if there is no reply", 5],
  interested: ["Book the first call", 2],
  meeting: ["Send a follow-up and ask what they need to decide", 2],
  diligence: ["Check in on diligence", 4],
  committed: ["Send the SAFE for signature", 0],
  signed: ["Check the wire has arrived", 3],
};

/** Runs after a lead changes stage. */
export function afterStageChange(byUserId: number, lead: LeadLite, to: string, oldLevel: number | null, newLevel: number | null) {
  if (automationOn("next_action")) {
    const today = new Date().toISOString().slice(0, 10);
    if (to === "wired" || to === "passed") {
      run("UPDATE leads SET next_action = NULL, next_action_due = NULL WHERE id = ?", lead.id);
    } else if (NEXT[to] && (!lead.next_action || !lead.next_action_due || lead.next_action_due < today)) {
      const [text, days] = NEXT[to]!;
      run("UPDATE leads SET next_action = ?, next_action_due = date('now', ?) WHERE id = ?", text, `+${days} days`, lead.id);
    }
  }
  if (lead.org_id && oldLevel != null && newLevel != null) announceAccess(lead.org_id, oldLevel, newLevel, byUserId);
  if (to === "wired" && lead.org_id && automationOn("wire_thanks")) {
    const by = q1<{ name: string }>("SELECT name FROM users WHERE id = ?", byUserId);
    fire(
      notify(orgMemberIds(lead.org_id), {
        category: "access",
        title: `Your investment in ${company()} has arrived. Thank you.`,
        body: "You will hear from us every month, with the good and the bad, and a short list of ways you can help.",
        href: "/home",
        cta: "Open the room",
        emailHtml: `<p>The wire${lead.check_size ? ` for ${money(lead.check_size)}` : ""} has arrived. Thank you for backing ${escapeHtml(company())} this early; it matters a great deal.</p><p>From here you will get an update every month, with the good and the bad, and a short list of ways you can help. Signed documents stay in the room whenever you need them.</p><p>${escapeHtml(by?.name ?? "")}</p>`,
        mail: { replyTo: replyToFounder(byUserId) },
      }),
    );
  }
}

/** Runs when someone accepts an invitation. */
export function afterJoin(userId: number) {
  const u = q1<{ name: string; email: string; role: string; org_id: number | null; org: string | null }>(
    "SELECT u.name, u.email, u.role, u.org_id, o.name AS org FROM users u LEFT JOIN orgs o ON o.id = u.org_id WHERE u.id = ?",
    userId,
  );
  if (!u || !automationOn("welcome")) return;
  const external = u.role === "investor" || u.role === "supporter";
  fire(
    notify(staffIds().filter((id) => id !== userId), {
      category: "people",
      title: `${u.name}${u.org ? ` (${u.org})` : ""} has joined the room`,
      body: external ? "A good moment to say hello." : undefined,
      href: "/people",
      cta: "See who is here",
    }),
  );
  if (!external) return;
  fire(
    notify([userId], {
      category: "access",
      title: `Welcome to the ${company()} room`,
      body: u.role === "supporter" ? "You will get our update once a month. Nothing to review, nothing to sign." : "The first page shows you what to read, in order. It takes about twenty minutes.",
      href: "/home",
      cta: u.role === "supporter" ? "Have a look" : "Start here",
      mail: { replyTo: replyToFounder(), transactional: true },
    }),
  );
}

// ----- scheduled automations -----

async function engagementAlerts() {
  if (!automationOn("engagement_alerts")) return;
  const orgs = q<{ id: number; name: string }>("SELECT id, name FROM orgs WHERE kind = 'investor'");
  for (const org of orgs) {
    const lead = q1<{ id: number }>("SELECT id FROM leads WHERE org_id = ? ORDER BY id DESC LIMIT 1", org.id);
    const href = lead ? `/pipeline/${lead.id}` : "/activity";
    const deck = q1<{ who: string }>(
      `SELECT u.name AS who FROM activity a JOIN users u ON u.id = a.user_id JOIN documents d ON d.id = a.target_id JOIN folders f ON f.id = d.folder_id
        WHERE a.org_id = ? AND a.action = 'doc.view' AND f.name LIKE '%pitch%' ORDER BY a.id LIMIT 1`,
      org.id,
    );
    if (deck && !wasSent(`eng:deck:${org.id}`)) {
      markSent(`eng:deck:${org.id}`);
      await notify(staffIds(), { category: "pipeline", title: `${deck.who} at ${org.name} has opened the deck`, body: "A short note today lands better than one next week.", href, cta: "Open their card" });
    }
    const fin = q1<{ n: number }>("SELECT COUNT(*) AS n FROM activity WHERE org_id = ? AND action = 'section.view' AND detail = 'financials'", org.id)?.n ?? 0;
    if (fin >= 2 && !wasSent(`eng:fin:${org.id}`)) {
      markSent(`eng:fin:${org.id}`);
      await notify(staffIds(), { category: "pipeline", title: `${org.name} keeps coming back to the financials`, body: "That usually means real interest. Ask if they have questions about the numbers.", href, cta: "Open their card" });
    }
    const day = new Date().toISOString().slice(0, 10);
    const dl = q<{ name: string }>(
      "SELECT DISTINCT d.name FROM activity a JOIN documents d ON d.id = a.target_id WHERE a.org_id = ? AND a.action = 'doc.download' AND a.created_at > datetime('now', '-1 day')",
      org.id,
    );
    if (dl.length && !wasSent(`eng:dl:${org.id}:${day}`)) {
      markSent(`eng:dl:${org.id}:${day}`);
      await notify(staffIds(), { category: "pipeline", title: `${org.name} downloaded ${dl.length === 1 ? dl[0].name : `${dl.length} documents`}`, href, email: false });
    }
  }
}

async function onboardingNudges() {
  if (!automationOn("onboarding_nudge")) return;
  const people = q<{ id: number; name: string; role: string }>(
    `SELECT u.id, u.name, u.role FROM users u
      WHERE u.role IN ('investor','supporter') AND u.disabled = 0
        AND u.created_at < datetime('now', '-3 days') AND u.created_at > datetime('now', '-12 days')
        AND NOT EXISTS (SELECT 1 FROM activity a WHERE a.user_id = u.id AND a.action IN ('doc.view','section.view','update.view'))`,
  );
  for (const p of people) {
    const key = `nudge:onboard:${p.id}`;
    if (wasSent(key)) continue;
    markSent(key);
    await notify([p.id], {
      category: "reminders",
      title: `${first(p.name)}, the ${company()} room is ready when you are`,
      body: p.role === "supporter" ? "The latest update is waiting, and takes two minutes to read." : "The overview takes two minutes, and the first page tells you what to read after that.",
      href: "/home",
      cta: "Pick up where you left off",
      mail: { replyTo: replyToFounder() },
    });
  }
}

async function financialsReminders(now: Date) {
  if (!automationOn("financials_reminder")) return;
  const last = periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const born = q1<{ at: string | null }>("SELECT MIN(created_at) AS at FROM users")?.at ?? "";
  if (now.getUTCDate() <= 10 && born.slice(0, 7) < periodOf(now) && !q1("SELECT 1 FROM financials WHERE month = ?", last) && !wasSent(`fin:${last}`)) {
    markSent(`fin:${last}`);
    await notify(founderIds(), { category: "reminders", title: `Add ${monthLabel(last)}'s numbers`, body: "Cash, revenue and spend. Two minutes, and it fills in the cash section of your update for you.", href: "/financials", cta: "Add the numbers" });
  }
  const rows = q<{ month: string; revenue: number; expenses: number; cash: number }>("SELECT month, revenue, expenses, cash FROM financials ORDER BY month DESC LIMIT 3");
  if (rows.length) {
    const burn = rows.reduce((a, r) => a + (r.expenses - r.revenue), 0) / rows.length;
    const runway = burn > 0 ? rows[0].cash / burn : Infinity;
    const key = `runway:${periodOf(now)}`;
    if (runway < 6 && !wasSent(key)) {
      markSent(key);
      await notify(founderIds(), {
        category: "reminders",
        title: `Runway is about ${Math.max(0, Math.round(runway))} months`,
        body: "Under six months is the point to start the next raise or cut spend. Your founder guide has a section on this.",
        href: "/financials",
        cta: "Look at the numbers",
      });
    }
  }
}

async function weeklySummary(now: Date) {
  if (!automationOn("weekly_summary") || now.getUTCDay() !== 1 || now.getUTCHours() < 13) return;
  const week = now.toISOString().slice(0, 10);
  const n = (sql: string, ...p: unknown[]) => q1<{ n: number }>(sql, ...p)?.n ?? 0;
  const moved = n("SELECT COUNT(*) AS n FROM activity WHERE action = 'lead.stage' AND created_at > datetime('now', '-7 days')");
  const newLeads = n("SELECT COUNT(*) AS n FROM leads WHERE created_at > datetime('now', '-7 days')");
  const visitors = n("SELECT COUNT(DISTINCT a.user_id) AS n FROM activity a JOIN users u ON u.id = a.user_id WHERE u.role IN ('investor','supporter') AND a.created_at > datetime('now', '-7 days')");
  const open = n("SELECT COUNT(*) AS n FROM requests WHERE status IN ('open','in_progress')");
  const dueThisWeek = q<{ org_name: string; next_action: string | null }>("SELECT org_name, next_action FROM leads WHERE stage NOT IN ('wired','passed') AND next_action_due IS NOT NULL AND next_action_due <= date('now', '+6 days') ORDER BY next_action_due LIMIT 8");
  const wired = q1<{ amt: number | null }>("SELECT SUM(amount) AS amt FROM safes WHERE status = 'wired'")?.amt ?? 0;
  const committed = q1<{ amt: number | null }>("SELECT SUM(amount) AS amt FROM safes WHERE status IN ('committed','signed')")?.amt ?? 0;
  if (moved + newLeads + visitors + open + dueThisWeek.length === 0) return;
  const due = updateDue(now);
  const lines = [
    `${newLeads} new investor${newLeads === 1 ? "" : "s"} added and ${moved} step${moved === 1 ? "" : "s"} forward in the pipeline.`,
    `${visitors} ${visitors === 1 ? "person" : "people"} visited the room.`,
    wired + committed > 0 ? `${money(wired)} in the bank, ${money(committed)} committed and still to arrive.` : "",
    open ? `${open} request${open === 1 ? " is" : "s are"} waiting for an answer.` : "",
    !due.published && due.daysUntilDue <= 7 ? `The ${monthLabel(due.period)} update is ${due.daysUntilDue < 0 ? "overdue" : `due in ${due.daysUntilDue} day${due.daysUntilDue === 1 ? "" : "s"}`}.` : "",
  ].filter(Boolean);
  for (const id of founderIds()) {
    const key = `weekly:${week}:${id}`;
    if (wasSent(key)) continue;
    markSent(key);
    const user = q1<{ name: string }>("SELECT name FROM users WHERE id = ?", id);
    await notify([id], {
      category: "reminders",
      title: "Your week in the raise",
      body: lines[0],
      href: "/home",
      cta: "Open today's list",
      emailSubject: `${company()}: your week in the raise`,
      emailHtml: `<p>Good morning ${escapeHtml(first(user?.name ?? ""))},</p><p>Last week:</p><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>${
        dueThisWeek.length ? `<p>This week:</p><ul>${dueThisWeek.map((d) => `<li><strong>${escapeHtml(d.org_name)}</strong>: ${escapeHtml(d.next_action ?? "follow up")}</li>`).join("")}</ul>` : ""
      }<p>One conversation at a time.</p>`,
    });
  }
}

export async function runAutomations(now = new Date()) {
  for (const job of [engagementAlerts, onboardingNudges, () => financialsReminders(now), () => weeklySummary(now)]) {
    try {
      await job();
    } catch (e) {
      console.error("[automation]", (e as Error).message);
    }
  }
  run("DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < datetime('now', '-90 days')");
  run("DELETE FROM email_log WHERE created_at < datetime('now', '-90 days')");
}
