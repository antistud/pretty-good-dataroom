import { q, q1, run } from "./db";
import { escapeHtml, sendMail, type MailOptions } from "./mail";

export const CATEGORIES = {
  requests: { label: "Questions and requests", who: "all" },
  updates: { label: "Monthly updates", who: "all" },
  documents: { label: "New documents", who: "external" },
  intros: { label: "Introductions", who: "all" },
  access: { label: "Changes to your access", who: "external" },
  people: { label: "People joining", who: "staff" },
  pipeline: { label: "Investor activity and follow-ups", who: "staff" },
  reminders: { label: "Reminders to keep things moving", who: "all" },
} as const;
export type Category = keyof typeof CATEGORIES;

export type Notice = {
  category: Category;
  /** One line, as you would say it to the person. Also the email subject unless emailSubject is set. */
  title: string;
  body?: string;
  /** Path inside the app, e.g. /requests/3 */
  href: string;
  cta?: string;
  emailSubject?: string;
  /** Full email body; defaults to the title and body. */
  emailHtml?: string;
  /** false = in-app only. */
  email?: boolean;
  mail?: MailOptions;
};

function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function wantsEmail(userId: number, category: Category): boolean {
  const user = q1<{ email_opt_out: number; disabled: number }>("SELECT email_opt_out, disabled FROM users WHERE id = ?", userId);
  if (!user || user.disabled || user.email_opt_out) return false;
  const pref = q1<{ email: number }>("SELECT email FROM notification_prefs WHERE user_id = ? AND category = ?", userId, category);
  return pref ? !!pref.email : true;
}

/** Tells people something happened: always in the app, and by email when they want it and mail is on. */
export async function notify(userIds: number[], n: Notice): Promise<void> {
  const seen = new Set<number>();
  for (const id of userIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const user = q1<{ email: string; name: string; disabled: number }>("SELECT email, name, disabled FROM users WHERE id = ?", id);
    if (!user || user.disabled) continue;
    run("INSERT INTO notifications (user_id, category, title, body, href) VALUES (?,?,?,?,?)", id, n.category, n.title.slice(0, 300), n.body?.slice(0, 1000) ?? null, n.href);
    if (n.email === false || !wantsEmail(id, n.category)) continue;
    const html = n.emailHtml ?? `<p>Hi ${escapeHtml(user.name.split(/\s+/)[0])},</p><p>${escapeHtml(n.title)}</p>${n.body ? `<p style="color:#5b5346">${escapeHtml(n.body)}</p>` : ""}`;
    await sendMail(user.email, n.emailSubject ?? n.title, html, { label: n.cta ?? "Open it in the room", url: appUrl() + n.href }, { preview: n.body ?? n.title, ...n.mail });
  }
}

export function staffIds(): number[] {
  return q<{ id: number }>("SELECT id FROM users WHERE role IN ('founder','team') AND disabled = 0").map((u) => u.id);
}
export function founderIds(): number[] {
  return q<{ id: number }>("SELECT id FROM users WHERE role = 'founder' AND disabled = 0").map((u) => u.id);
}
export function orgMemberIds(orgId: number | null, except?: number): number[] {
  if (!orgId) return [];
  return q<{ id: number }>("SELECT id FROM users WHERE org_id = ? AND disabled = 0", orgId).map((u) => u.id).filter((id) => id !== except);
}

export function unreadCount(userId: number): number {
  return q1<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", userId)?.n ?? 0;
}

/** A founder's address for Reply-To, so replies to an email reach a person. */
export function replyToFounder(preferUserId?: number): string | undefined {
  const row =
    (preferUserId ? q1<{ email: string }>("SELECT email FROM users WHERE id = ? AND role IN ('founder','team') AND disabled = 0", preferUserId) : undefined) ??
    q1<{ email: string }>("SELECT email FROM users WHERE role = 'founder' AND disabled = 0 ORDER BY id LIMIT 1");
  return row?.email;
}
