"use server";

import { q1, run } from "@/lib/db";
import { hashPassword, passwordProblem, requireUser, signOutOtherSessions, verifyPassword } from "@/lib/auth";
import { newTotpSecret, verifyTotp } from "@/lib/totp";
import { createInvite } from "@/lib/invites";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { CATEGORIES } from "@/lib/notify";
import { formStr } from "@/lib/format";

export async function changePasswordAction(form: FormData) {
  const me = await requireUser();
  const row = q1<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", me.id)!;
  if (!verifyPassword(String(form.get("current") ?? ""), row.password_hash)) flash("/account", "Your current password is not correct.", "error");
  const next = String(form.get("next") ?? "");
  const problem = passwordProblem(next);
  if (problem) flash("/account", problem, "error");
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(next), me.id);
  // Anyone else signed in as this person (a lost laptop, a shared computer) is signed out.
  await signOutOtherSessions(me.id);
  logActivity(me, "account.password");
  flash("/account", "Password changed. Any other device signed in as you has been signed out.");
}

export async function startTotpAction() {
  const me = await requireUser();
  if (me.totpEnabled) flash("/account", "Two-step sign-in is already on.", "error");
  run("UPDATE users SET totp_secret = ? WHERE id = ?", newTotpSecret(), me.id);
  flash("/account", "Scan the code below, then type the 6-digit code to finish.");
}

export async function confirmTotpAction(form: FormData) {
  const me = await requireUser();
  const row = q1<{ totp_secret: string | null }>("SELECT totp_secret FROM users WHERE id = ?", me.id);
  if (!row?.totp_secret || !verifyTotp(row.totp_secret, String(form.get("code") ?? ""))) flash("/account", "That code is not correct. Try the newest one.", "error");
  run("UPDATE users SET totp_enabled = 1 WHERE id = ?", me.id);
  await signOutOtherSessions(me.id);
  logActivity(me, "account.2fa_on");
  flash("/account", "Two-step sign-in is on.");
}

export async function disableTotpAction(form: FormData) {
  const me = await requireUser();
  const row = q1<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", me.id)!;
  if (!verifyPassword(String(form.get("current") ?? ""), row.password_hash)) flash("/account", "Your password is not correct.", "error");
  run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", me.id);
  logActivity(me, "account.2fa_off");
  flash("/account", "Two-step sign-in is off.");
}

export async function emailPrefAction(form: FormData) {
  const me = await requireUser();
  const all = form.get("emails") === "on";
  run("UPDATE users SET email_opt_out = ? WHERE id = ?", all ? 0 : 1, me.id);
  for (const category of Object.keys(CATEGORIES)) {
    run(
      "INSERT INTO notification_prefs (user_id, category, email) VALUES (?,?,?) ON CONFLICT(user_id, category) DO UPDATE SET email = excluded.email",
      me.id,
      category,
      form.get(`cat_${category}`) === "on" ? 1 : 0,
    );
  }
  flash("/account#email", all ? "Saved. You will get the emails you ticked." : "Saved. You will not get any emails; everything still appears under What's new.");
}

/** Investors and supporters can bring colleagues into their own organisation, at the same access. */
export async function inviteColleagueAction(form: FormData) {
  const me = await requireUser();
  if (me.isStaff || !me.orgId) flash("/account", "Use People & access to invite people.", "error");
  const inv = await createInvite(me, {
    email: formStr(form.get("email"), 200),
    name: formStr(form.get("name"), 120),
    role: me.role,
    orgId: me.orgId,
  });
  if (!inv.ok) flash("/account", inv.error, "error");
  else flash("/account", inv.emailed ? "Invitation sent." : `Copy this link and send it to your colleague: ${inv.url}`);
}
