import { q1, run, getSetting } from "./db";
import { appUrl, hashToken, newToken, type Role, type Viewer } from "./auth";
import { escapeHtml, sendMail } from "./mail";
import { logActivity } from "./activity";

const INVITE_DAYS = 14;

export type InviteResult = { ok: true; url: string; emailed: boolean } | { ok: false; error: string };

/**
 * Creates a single-use invite link. The link is always returned so it can be
 * copied by hand; it is also emailed when SMTP is configured.
 */
export async function createInvite(
  by: Viewer,
  input: { email: string; name?: string; role: Role; orgId: number | null },
): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "That email address doesn't look right." };
  if (q1("SELECT 1 FROM users WHERE email = ?", email)) return { ok: false, error: "Someone with that email already has an account." };
  if ((input.role === "investor" || input.role === "supporter") && !input.orgId) return { ok: false, error: "Pick an organisation first." };

  run("UPDATE invites SET revoked = 1 WHERE email = ? AND accepted_at IS NULL", email);
  const token = newToken();
  const expires = new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString();
  run(
    "INSERT INTO invites (token_hash, email, name, role, org_id, invited_by, expires_at) VALUES (?,?,?,?,?,?,?)",
    hashToken(token),
    email,
    input.name?.trim() || null,
    input.role,
    input.orgId,
    by.id,
    expires,
  );
  logActivity(by, "invite.create", "invite", null, `${email} as ${input.role}`);
  const url = `${appUrl()}/invite/${token}`;
  const company = getSetting("company_name");
  const emailed = await sendMail(
    email,
    `${by.name} invited you to the ${company} data room`,
    `<p>Hi${input.name ? " " + escapeHtml(input.name) : ""},</p><p>${escapeHtml(by.name)} has invited you to ${escapeHtml(company)}'s data room. Click below to open it. Everything is there for you to look at in your own time, and you can ask us for anything you need. There is no password: when you come back, you sign in with a code we email you.</p><p>This link works once and expires in ${INVITE_DAYS} days.</p>`,
    { label: "Accept invitation", url },
  );
  return { ok: true, url, emailed };
}

export function findInvite(token: string) {
  return q1<{ id: number; email: string; name: string | null; role: Role; org_id: number | null; org_name: string | null }>(
    `SELECT i.id, i.email, i.name, i.role, i.org_id, o.name AS org_name
       FROM invites i LEFT JOIN orgs o ON o.id = i.org_id
      WHERE i.token_hash = ? AND i.revoked = 0 AND i.accepted_at IS NULL AND i.expires_at > ?`,
    hashToken(token),
    new Date().toISOString(),
  );
}
