"use server";

import { redirect } from "next/navigation";
import { q1, run, isSetUp, setSetting, getSetting } from "@/lib/db";
import {
  appUrl, clientIp, completeTwofa, createSession, destroySession, hashPassword, hashToken, newToken,
  passwordProblem, pendingTwofaUserId, rateLimited, requireUser, sameSecret, verifyPassword,
} from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";
import { findInvite } from "@/lib/invites";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { afterJoin } from "@/lib/automations";
import { formStr } from "@/lib/format";
import { mailEnabled, sendMail } from "@/lib/mail";

export async function setupAction(form: FormData) {
  if (isSetUp()) redirect("/login");
  const company = formStr(form.get("company"), 120);
  const name = formStr(form.get("name"), 120);
  const email = formStr(form.get("email"), 200).toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!company || !name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) flash("/setup", "Fill in every field with a valid email.", "error");
  const problem = passwordProblem(password);
  if (problem) flash("/setup", problem, "error");
  // If SETUP_TOKEN is set, first-run setup needs it. Stops a stranger claiming a fresh install.
  const required = process.env.SETUP_TOKEN;
  if (required) {
    if (rateLimited(`setup:${await clientIp()}`, 10)) flash("/setup", "Too many attempts. Wait 15 minutes and try again.", "error");
    if (!sameSecret(String(form.get("setup_token") ?? ""), required)) flash("/setup", "That setup token is not correct.", "error");
  }
  setSetting("company_name", company);
  const res = run("INSERT INTO users (email, name, password_hash, role, last_seen_at) VALUES (?,?,?, 'founder', datetime('now'))", email, name, hashPassword(password));
  await createSession(Number(res.lastInsertRowid), false);
  redirect("/home");
}

export async function loginAction(form: FormData) {
  const email = formStr(form.get("email"), 200).toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = await clientIp();
  if (rateLimited(`login:${ip}`, 20) || rateLimited(`login:${email}`, 8)) {
    flash("/login", "Too many attempts. Wait 15 minutes and try again.", "error");
  }
  const user = q1<{ id: number; password_hash: string; totp_enabled: number; disabled: number; org_id: number | null }>(
    "SELECT id, password_hash, totp_enabled, disabled, org_id FROM users WHERE email = ?",
    email,
  );
  // Always run a hash comparison so timing does not reveal whether the email exists.
  const ok = verifyPassword(password, user?.password_hash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==");
  if (!user || !ok || user.disabled) flash("/login", "Email or password is not correct.", "error");
  await createSession(user!.id, !!user!.totp_enabled);
  if (user!.totp_enabled) redirect("/login/2fa");
  run("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?", user!.id);
  logActivity({ id: user!.id, orgId: user!.org_id }, "login");
  redirect("/home");
}

export async function twofaAction(form: FormData) {
  const userId = await pendingTwofaUserId();
  if (!userId) redirect("/login");
  if (rateLimited(`2fa:${userId}`, 8)) flash("/login/2fa", "Too many attempts. Wait 15 minutes.", "error");
  const user = q1<{ totp_secret: string; org_id: number | null }>("SELECT totp_secret, org_id FROM users WHERE id = ?", userId);
  if (!user?.totp_secret || !verifyTotp(user.totp_secret, String(form.get("code") ?? ""))) {
    flash("/login/2fa", "That code is not correct. Try the newest one.", "error");
  }
  await completeTwofa();
  run("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?", userId);
  logActivity({ id: userId!, orgId: user!.org_id }, "login");
  redirect("/home");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function acceptInviteAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  const back = `/invite/${encodeURIComponent(token)}`;
  if (rateLimited(`invite:${await clientIp()}`, 30)) flash(back, "Too many attempts. Wait a few minutes.", "error");
  const invite = findInvite(token);
  if (!invite) redirect(back);
  const name = formStr(form.get("name"), 120);
  const password = String(form.get("password") ?? "");
  if (!name) flash(back, "Tell us your name.", "error");
  const problem = passwordProblem(password);
  if (problem) flash(back, problem, "error");
  if (q1("SELECT 1 FROM users WHERE email = ?", invite!.email)) flash("/login", "You already have an account. Sign in.", "error");
  const res = run(
    "INSERT INTO users (email, name, title, password_hash, role, org_id, last_seen_at) VALUES (?,?,?,?,?,?, datetime('now'))",
    invite!.email,
    name,
    formStr(form.get("title"), 120) || null,
    hashPassword(password),
    invite!.role,
    invite!.org_id,
  );
  run("UPDATE invites SET accepted_at = datetime('now') WHERE id = ?", invite!.id);
  const id = Number(res.lastInsertRowid);
  logActivity({ id, orgId: invite!.org_id }, "invite.accept");
  afterJoin(id);
  await createSession(id, false);
  redirect("/home");
}

export async function acceptNdaAction() {
  const me = await requireUser({ skipNda: true });
  run("UPDATE users SET nda_accepted_at = datetime('now') WHERE id = ?", me.id);
  logActivity(me, "nda.accept", undefined, undefined, getSetting("nda_text").slice(0, 200));
  redirect("/home");
}

export async function forgotAction(form: FormData) {
  const email = formStr(form.get("email"), 200).toLowerCase();
  if (rateLimited(`forgot:${await clientIp()}`, 5)) flash("/forgot", "Too many attempts. Wait 15 minutes.", "error");
  const user = q1<{ id: number }>("SELECT id FROM users WHERE email = ? AND disabled = 0", email);
  if (user && mailEnabled()) {
    const token = newToken();
    run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)", hashToken(token), user.id, new Date(Date.now() + 3600_000).toISOString());
    await sendMail(email, "Reset your data room password", "<p>Someone asked to reset the password for this account. If that was you, use the button below within one hour. If not, ignore this email.</p>", {
      label: "Choose a new password",
      url: `${appUrl()}/reset/${token}`,
    }, { transactional: true });
  }
  // Same message either way, so this page cannot be used to test which emails have accounts.
  flash("/forgot", mailEnabled() ? "If that email has an account, a reset link is on its way." : "Email is not set up on this data room. Ask the founder who invited you for a reset link.");
}

export async function resetAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  const back = `/reset/${encodeURIComponent(token)}`;
  const row = q1<{ user_id: number }>(
    "SELECT user_id FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > ?",
    hashToken(token),
    new Date().toISOString(),
  );
  if (!row) redirect(back);
  const password = String(form.get("password") ?? "");
  const problem = passwordProblem(password);
  if (problem) flash(back, problem, "error");
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(password), row!.user_id);
  run("UPDATE password_resets SET used = 1 WHERE token_hash = ?", hashToken(token));
  run("DELETE FROM sessions WHERE user_id = ?", row!.user_id);
  flash("/login", "Password changed. Sign in with the new one.");
}
