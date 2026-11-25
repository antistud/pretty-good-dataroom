import { q1, getSetting, q, run, db } from "./db";
import { appUrl } from "./auth";
import { escapeHtml, mailEnabled, sendMail } from "./mail";
import { renderMarkdown } from "./md";
import { money, monthLabel } from "./format";

export function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The monthly update covers the previous calendar month and is due on the
 * configured day of the current month.
 */
export function updateDue(now = new Date()) {
  const dueDay = Math.min(28, Math.max(1, Number(getSetting("update_due_day")) || 5));
  const period = periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dueDay));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysUntilDue = Math.round((dueDate.getTime() - today) / 86400_000);
  const update = q1<{ id: number; status: string }>("SELECT id, status FROM updates WHERE period = ?", period);
  // A room created this month owes no update for last month. Its first one is due next month.
  const born = q1<{ at: string | null }>("SELECT MIN(created_at) AS at FROM users")?.at;
  const monthStart = `${periodOf(now)}-01`;
  if (!update && born && born.slice(0, 10) >= monthStart) {
    return { period, dueDate, daysUntilDue: 99, published: false, draftId: null, overdue: false, graceMonth: true };
  }
  return {
    graceMonth: false,
    period,
    dueDate,
    daysUntilDue,
    published: update?.status === "published",
    draftId: update?.id ?? null,
    overdue: update?.status !== "published" && daysUntilDue < 0,
  };
}

// ---------------------------------------------------------------------------
// Drafting, audiences and sending
// ---------------------------------------------------------------------------

export type UpdateRow = { id: number; period: string; title: string; status: "draft" | "published"; published_at: string | null; created_at: string };
export type SectionRow = { id: number; update_id: number; heading: string; body_md: string; min_level: number; position: number };
export type AskRow = { id: number; title: string; detail: string | null; min_level: number };
export type Recipient = { id: number; email: string; name: string; level: number; email_opt_out: number };

/** Investor tier levels from the tiers table: lowest, middle and most restricted. */
export function tierLevels() {
  const levels = q<{ level: number }>("SELECT level FROM tiers ORDER BY level").map((t) => t.level);
  if (!levels.length) return { lowest: 1, middle: 1, highest: 1 };
  return { lowest: levels[0], middle: levels[Math.floor((levels.length - 1) / 2 + 0.5)] ?? levels[0], highest: levels[levels.length - 1] };
}

export function getUpdate(id: number): UpdateRow | undefined {
  return q1<UpdateRow>("SELECT id, period, title, status, published_at, created_at FROM updates WHERE id = ?", id);
}
export function allSections(updateId: number): SectionRow[] {
  return q<SectionRow>("SELECT * FROM update_sections WHERE update_id = ? ORDER BY position, id", updateId);
}
/** Exactly what a reader at this level gets. */
export function sectionsFor(updateId: number, level: number): SectionRow[] {
  return allSections(updateId).filter((s) => s.min_level <= level);
}
export function visibleAsks(level: number): AskRow[] {
  const introLevel = Number(getSetting("level_intros"));
  if (introLevel >= 999 || level < introLevel) return [];
  return q<AskRow>("SELECT id, title, detail, min_level FROM intro_asks WHERE status = 'open' AND min_level <= ? ORDER BY created_at DESC", level);
}

function prevPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return periodOf(new Date(Date.UTC(y, m - 2, 1)));
}

function change(now: number, before: number | undefined): string {
  if (before == null || before === 0) return "";
  const diff = (now - before) / Math.abs(before);
  return ` (${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(0)}% vs last month)`;
}

function cashMarkdown(period: string): string {
  type F = { revenue: number; expenses: number; cash: number };
  const f = q1<F>("SELECT revenue, expenses, cash FROM financials WHERE month = ?", period);
  if (!f) return `_No financials entered for ${monthLabel(period)} yet. Fill in the Financials page, or type the numbers here._\n\n- Revenue: \n- Expenses: \n- Net burn: \n- Cash in bank: \n- Runway: `;
  const p = q1<F>("SELECT revenue, expenses, cash FROM financials WHERE month = ?", prevPeriod(period));
  const burn = f.expenses - f.revenue;
  const pBurn = p ? p.expenses - p.revenue : undefined;
  const runway = burn > 0 ? `${(f.cash / burn).toFixed(1)} months at this burn` : "not burning cash this month";
  return [
    `- Revenue: **${money(f.revenue)}**${change(f.revenue, p?.revenue)}`,
    `- Expenses: **${money(f.expenses)}**${change(f.expenses, p?.expenses)}`,
    `- Net burn: **${money(burn)}**${burn > 0 ? change(burn, pBurn && pBurn > 0 ? pBurn : undefined) : ""}`,
    `- Cash in bank: **${money(f.cash)}**${change(f.cash, p?.cash)}`,
    `- Runway: **${runway}**`,
  ].join("\n");
}

/** Creates a draft for a period from the standard template. Returns the new id, or the existing one. */
export function createDraft(period: string, userId: number): number {
  const existing = q1<{ id: number }>("SELECT id FROM updates WHERE period = ?", period);
  if (existing) return existing.id;
  const t = tierLevels();
  const asks = q<{ title: string }>("SELECT title FROM intro_asks WHERE status = 'open' ORDER BY created_at DESC");
  const thanks = q<{ name: string | null; contact_name: string }>(
    `SELECT u.name, o.contact_name FROM intro_offers o LEFT JOIN users u ON u.id = o.user_id
      WHERE o.status IN ('intro_made','met') AND substr(o.created_at, 1, 7) = ?`,
    period,
  );
  const thankNames = [...new Set(thanks.map((x) => x.name).filter(Boolean))] as string[];
  const template: [string, string, number][] = [
    ["Highlights", "", 0],
    ["Lowlights", "", t.lowest],
    ["Key metrics", "", t.lowest],
    ["Cash & runway", cashMarkdown(period), t.middle],
    ["Asks", asks.length ? "Can you introduce us to:\n\n" + asks.map((a) => `- ${a.title}`).join("\n") : "", 0],
    ["Thank-yous", thankNames.length ? "Thank you for the introductions this month:\n\n" + thankNames.map((n) => `- ${n}`).join("\n") : "", 0],
  ];
  const create = db.transaction(() => {
    const res = run("INSERT INTO updates (period, title, created_by) VALUES (?,?,?)", period, `${monthLabel(period)} update`, userId);
    const id = Number(res.lastInsertRowid);
    template.forEach(([heading, body, lvl], i) =>
      run("INSERT INTO update_sections (update_id, heading, body_md, min_level, position) VALUES (?,?,?,?,?)", id, heading, body, lvl, i),
    );
    return id;
  });
  return create();
}

/** Active investors and supporters with their access level. */
export function externalRecipients(): Recipient[] {
  return q<Recipient>(
    `SELECT u.id, u.email, u.name, u.email_opt_out,
            CASE WHEN u.role = 'investor' THEN MAX(1, IFNULL(o.tier, 1)) ELSE 0 END AS level
       FROM users u LEFT JOIN orgs o ON o.id = u.org_id
      WHERE u.role IN ('investor','supporter') AND u.disabled = 0 ORDER BY u.name`,
  );
}
export function staffRecipients(): Recipient[] {
  return q<Recipient>(
    "SELECT id, email, name, email_opt_out, 100 AS level FROM users WHERE role IN ('founder','team') AND disabled = 0 ORDER BY name",
  );
}

export function wasSent(key: string): boolean {
  return !!q1("SELECT 1 FROM sent_log WHERE key = ?", key);
}
export function markSent(key: string) {
  run("INSERT OR IGNORE INTO sent_log (key) VALUES (?)", key);
}

export function recipientsSummary(updateId: number) {
  const sections = allSections(updateId);
  const people = externalRecipients();
  const byLevel = new Map<number, number>();
  let canRead = 0;
  let willEmail = 0;
  let alreadySent = 0;
  let optedOut = 0;
  for (const p of people) {
    byLevel.set(p.level, (byLevel.get(p.level) ?? 0) + 1);
    if (!sections.some((s) => s.min_level <= p.level)) continue;
    canRead++;
    if (p.email_opt_out) optedOut++;
    else if (wasSent(`update:${updateId}:user:${p.id}`)) alreadySent++;
    else willEmail++;
  }
  return {
    total: people.length,
    byLevel: [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, count]) => ({ level, count })),
    canRead,
    willEmail,
    alreadySent,
    optedOut,
    mailOn: mailEnabled(),
  };
}

export function updateEmailHtml(update: UpdateRow, sections: SectionRow[], asks: AskRow[], greeting: string): string {
  const parts = [`<p>${escapeHtml(greeting)}</p>`, `<h2 style="margin:16px 0 8px">${escapeHtml(update.title)}</h2>`];
  for (const s of sections) {
    if (!s.body_md.trim()) continue;
    parts.push(`<h3 style="margin:18px 0 6px">${escapeHtml(s.heading)}</h3>`, renderMarkdown(s.body_md));
  }
  if (asks.length) {
    parts.push(
      `<div style="background:#eef2ff;border-radius:8px;padding:12px 16px;margin-top:22px"><strong>Can you intro us to…</strong><ul style="margin:8px 0 8px;padding-left:20px">` +
        asks.map((a) => `<li>${escapeHtml(a.title)}${a.detail ? ` <span style="color:#667085">— ${escapeHtml(a.detail)}</span>` : ""}</li>`).join("") +
        `</ul><a href="${escapeHtml(appUrl())}/intros">Yes, I can make an intro</a></div>`,
    );
  }
  return parts.join("\n");
}

/**
 * Emails each reader their own version of a published update. Safe to call
 * again: anyone already sent to is skipped.
 */
export async function sendUpdateEmails(updateId: number): Promise<{ sent: number; failed: number; mailOn: boolean }> {
  const update = getUpdate(updateId);
  if (!update || update.status !== "published" || !mailEnabled()) return { sent: 0, failed: 0, mailOn: mailEnabled() };
  const all = allSections(updateId);
  const company = getSetting("company_name");
  const url = `${appUrl()}/updates/${updateId}`;
  const replyTo = q1<{ email: string }>("SELECT email FROM users WHERE role = 'founder' AND disabled = 0 ORDER BY id LIMIT 1");
  let sent = 0;
  let failed = 0;
  for (const p of [...externalRecipients(), ...staffRecipients()]) {
    if (p.email_opt_out) continue;
    const key = `update:${updateId}:user:${p.id}`;
    if (wasSent(key)) continue;
    const sections = all.filter((s) => s.min_level <= p.level);
    if (!sections.length) continue;
    const isStaff = p.level >= 100;
    const html = updateEmailHtml(
      update,
      sections,
      isStaff ? [] : visibleAsks(p.level),
      isStaff ? `Hi ${p.name}, this is your copy of the full update that just went out. Each reader got only the sections their access allows.` : `Hi ${p.name},`,
    );
    const ok = await sendMail(p.email, `${company}: ${update.title}`, html, { label: "Read it and reply", url }, { replyTo: replyTo?.email, preview: sections[0]?.body_md.replace(/[#*_`>\[\]]/g, "").slice(0, 140) });
    if (ok) {
      markSent(key);
      sent++;
    } else failed++;
  }
  return { sent, failed, mailOn: true };
}
