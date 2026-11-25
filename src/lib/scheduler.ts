import { q, run, getSetting, isSetUp } from "./db";
import { appUrl, hashToken, newToken } from "./auth";
import { escapeHtml, mailEnabled, sendMail } from "./mail";
import { visibleDocuments } from "./docs";
import { runAutomations } from "./automations";
import { monthLabel } from "./format";
import { externalRecipients, markSent, updateDue, wasSent } from "./updates";

const INTERVAL_MS = 15 * 60_000;
const INVITE_DAYS = 14;
/** Hour (UTC) after which the once-a-day digests go out. */
const DIGEST_HOUR_UTC = 14;

declare global {
  // eslint-disable-next-line no-var
  var __pgd_scheduler: boolean | undefined;
}

/** SQLite's datetime('now') format, for comparing against created_at columns. */
function sqlTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function activeFounders() {
  return q<{ id: number; email: string; name: string }>(
    "SELECT id, email, name FROM users WHERE role = 'founder' AND disabled = 0 AND email_opt_out = 0",
  );
}
function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** 1. Nag founders about the monthly update: 3 days before, on the day, then every 3 days overdue. */
async function founderUpdateNags(now: Date) {
  const due = updateDue(now);
  if (due.published) return;
  let slot: string | null = null;
  let subject = "";
  let lead = "";
  const month = monthLabel(due.period);
  if (due.daysUntilDue > 0 && due.daysUntilDue <= 3) {
    slot = "pre";
    subject = `The ${month} investor update is due in ${plural(due.daysUntilDue, "day")}`;
    lead = `Your ${month} investor update is due in ${plural(due.daysUntilDue, "day")}.`;
  } else if (due.daysUntilDue === 0) {
    slot = "due";
    subject = `The ${month} investor update is due today`;
    lead = `Your ${month} investor update is due today.`;
  } else if (due.daysUntilDue <= -3) {
    slot = `over${Math.floor(-due.daysUntilDue / 3)}`;
    subject = `The ${month} investor update is ${-due.daysUntilDue} days overdue`;
    lead = `Your ${month} investor update is now ${-due.daysUntilDue} days overdue. Investors notice when updates stop.`;
  }
  if (!slot) return;
  const url = due.draftId ? `${appUrl()}/updates/${due.draftId}` : `${appUrl()}/updates`;
  const steps = due.draftId
    ? "<ol><li>Open the draft with the button below.</li><li>Write two or three bullet points in each section.</li><li>Preview it as a supporter and as an investor.</li><li>Press “Publish and send”.</li></ol>"
    : "<ol><li>Open the updates page with the button below and press “Start the update”. Cash and runway are filled in for you.</li><li>Write two or three bullet points in each section.</li><li>Preview it, then press “Publish and send”.</li></ol>";
  for (const f of activeFounders()) {
    const key = `nag:update:${due.period}:${slot}:user:${f.id}`;
    if (wasSent(key)) continue;
    const ok = await sendMail(
      f.email,
      subject,
      `<p>Hi ${escapeHtml(f.name)},</p><p>${escapeHtml(lead)} It takes about 15 minutes:</p>${steps}<p>A short, honest update on time is better than a polished one late. These reminders stop as soon as it is published.</p>`,
      { label: due.draftId ? "Finish the draft" : "Write the update", url },
    );
    if (ok) markSent(key);
  }
}

/** 2. One reminder for invitations nobody has accepted after 4 days. The link is rotated because only its hash is stored. */
async function inviteNudges(now: Date) {
  const stale = q<{ id: number; email: string; name: string | null; inviter: string | null }>(
    `SELECT i.id, i.email, i.name, u.name AS inviter FROM invites i LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.accepted_at IS NULL AND i.revoked = 0 AND i.last_nudged_at IS NULL AND i.expires_at > ? AND i.created_at < ?
        AND NOT EXISTS (SELECT 1 FROM users x WHERE x.email = i.email)`,
    now.toISOString(),
    sqlTime(new Date(now.getTime() - 4 * 86400_000)),
  );
  const company = getSetting("company_name");
  for (const inv of stale) {
    const token = newToken();
    run(
      "UPDATE invites SET token_hash = ?, expires_at = ?, last_nudged_at = ? WHERE id = ?",
      hashToken(token),
      new Date(now.getTime() + INVITE_DAYS * 86400_000).toISOString(),
      sqlTime(now),
      inv.id,
    );
    await sendMail(
      inv.email,
      `Reminder: your invitation to the ${company} data room`,
      `<p>Hi${inv.name ? " " + escapeHtml(inv.name) : ""},</p><p>${escapeHtml(inv.inviter ?? "The team")} invited you to ${escapeHtml(company)}'s data room a few days ago. The link below is a fresh one, in case the first went astray. No hurry.</p><p>This is a fresh link; the earlier one no longer works. It expires in ${INVITE_DAYS} days. We will not remind you again.</p>`,
      { label: "Accept invitation", url: `${appUrl()}/invite/${token}` },
    );
  }
}

/** 3. Once a day, tell investors and supporters about documents added since the last digest. */
async function newDocumentDigest(now: Date) {
  if (now.getUTCHours() < DIGEST_HOUR_UTC) return;
  const docsLevel = Number(getSetting("level_documents"));
  if (docsLevel >= 999) return;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DIGEST_HOUR_UTC));
  const from = sqlTime(new Date(end.getTime() - 86400_000));
  const to = sqlTime(end);
  const company = getSetting("company_name");
  const byLevel = new Map<number, ReturnType<typeof visibleDocuments>>();
  for (const p of externalRecipients()) {
    if (p.email_opt_out || p.level < docsLevel) continue;
    const key = `docs:${dayKey(now)}:user:${p.id}`;
    if (wasSent(key)) continue;
    if (!byLevel.has(p.level)) {
      byLevel.set(p.level, visibleDocuments(p.level).filter((d) => d.current_version_id && d.created_at >= from && d.created_at < to));
    }
    const docs = byLevel.get(p.level)!;
    if (!docs.length) continue;
    const list = docs.map((d) => `<li><a href="${escapeHtml(appUrl())}/documents/${d.id}">${escapeHtml(d.name)}</a></li>`).join("");
    const ok = await sendMail(
      p.email,
      `${company}: ${plural(docs.length, "new document")} in the data room`,
      `<p>Hi ${escapeHtml(p.name)},</p><p>${docs.length === 1 ? "A new document was" : "New documents were"} added to the ${escapeHtml(company)} data room:</p><ul>${list}</ul>`,
      { label: "Open the data room", url: `${appUrl()}/documents` },
    );
    if (ok) markSent(key);
  }
}

/** 4. Once a day, tell founders what needs them: follow-ups due, requests waiting, new intro offers. */
async function staffDigest(now: Date) {
  if (now.getUTCHours() < DIGEST_HOUR_UTC - 1) return;
  const today = dayKey(now);
  const followUps = q<{ id: number; org_name: string; next_action: string | null; next_action_due: string }>(
    `SELECT id, org_name, next_action, next_action_due FROM leads
      WHERE next_action_due IS NOT NULL AND next_action_due != '' AND substr(next_action_due, 1, 10) <= ? AND stage NOT IN ('passed','wired')
      ORDER BY next_action_due`,
    today,
  );
  const waiting = q<{ id: number; title: string; org: string | null }>(
    `SELECT r.id, r.title, o.name AS org FROM requests r LEFT JOIN orgs o ON o.id = r.org_id
      WHERE r.status IN ('open','in_progress') AND r.created_at < ? ORDER BY r.created_at`,
    sqlTime(new Date(now.getTime() - 3 * 86400_000)),
  );
  const offers = q<{ contact_name: string; who: string | null }>(
    `SELECT o.contact_name, u.name AS who FROM intro_offers o LEFT JOIN users u ON u.id = o.user_id
      WHERE o.status = 'offered' AND o.created_at >= ? ORDER BY o.created_at`,
    sqlTime(new Date(now.getTime() - 86400_000)),
  );
  if (!followUps.length && !waiting.length && !offers.length) return;
  const base = escapeHtml(appUrl());
  const parts: string[] = [];
  if (followUps.length) {
    parts.push(
      `<p><strong>${plural(followUps.length, "investor follow-up")} due</strong></p><ul>` +
        followUps
          .map((l) => `<li><a href="${base}/pipeline/${l.id}">${escapeHtml(l.org_name)}</a>: ${escapeHtml(l.next_action || "follow up")}${l.next_action_due.slice(0, 10) < today ? ` <em>(was due ${escapeHtml(l.next_action_due.slice(0, 10))})</em>` : ""}</li>`)
          .join("") +
        "</ul>",
    );
  }
  if (waiting.length) {
    parts.push(
      `<p><strong>${plural(waiting.length, "request")} waiting more than 3 days</strong></p><ul>` +
        waiting.map((r) => `<li><a href="${base}/requests/${r.id}">${escapeHtml(r.title)}</a>${r.org ? ` from ${escapeHtml(r.org)}` : ""}</li>`).join("") +
        "</ul>",
    );
  }
  if (offers.length) {
    parts.push(
      `<p><strong>${plural(offers.length, "new intro offer")}</strong></p><ul>` +
        offers.map((o) => `<li>${escapeHtml(o.who ?? "Someone")} can introduce you to ${escapeHtml(o.contact_name)}</li>`).join("") +
        `</ul><p><a href="${base}/intros">Reply to them while it is fresh.</a></p>`,
    );
  }
  for (const f of activeFounders()) {
    const key = `staffdigest:${today}:user:${f.id}`;
    if (wasSent(key)) continue;
    const ok = await sendMail(f.email, "Today in your raise: what needs you", `<p>Hi ${escapeHtml(f.name)}, here is what to do today.</p>${parts.join("")}`, {
      label: "Open Today",
      url: `${appUrl()}/home`,
    });
    if (ok) markSent(key);
  }
}

/** 5. Remove expired sessions, spent reset links and old de-duplication rows. */
function housekeeping(now: Date) {
  run("DELETE FROM sessions WHERE expires_at <= ?", now.toISOString());
  run("DELETE FROM login_codes WHERE expires_at <= ?", now.toISOString());
  // Daily digest keys are only needed for the day they cover.
  run("DELETE FROM sent_log WHERE (key LIKE 'docs:%' OR key LIKE 'staffdigest:%') AND sent_at < ?", sqlTime(new Date(now.getTime() - 7 * 86400_000)));
}

export async function runScheduledJobs(now = new Date()) {
  if (!isSetUp()) return;
  const guarded = async (name: string, job: () => unknown) => {
    try {
      await job();
    } catch (err) {
      console.error(`[scheduler] ${name} failed:`, (err as Error).message);
    }
  };
  await guarded("housekeeping", () => housekeeping(now));
  // In-app notices work without email, so automations run either way.
  await guarded("automations", () => runAutomations(now));
  // Everything below only sends email. Without SMTP the app shows in-app banners instead.
  if (!mailEnabled()) return;
  await guarded("founder update nags", () => founderUpdateNags(now));
  await guarded("invite nudges", () => inviteNudges(now));
  await guarded("new document digest", () => newDocumentDigest(now));
  await guarded("staff digest", () => staffDigest(now));
}

export function startScheduler() {
  if (globalThis.__pgd_scheduler) return;
  globalThis.__pgd_scheduler = true;
  if (!mailEnabled()) console.log("[scheduler] SMTP is not configured: reminder emails are off, in-app banners still work.");
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runScheduledJobs();
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 30_000).unref();
  setInterval(tick, INTERVAL_MS).unref();
}
