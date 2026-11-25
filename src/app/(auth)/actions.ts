"use server";

import { redirect } from "next/navigation";
import { q1, run, isSetUp, setSetting, getSetting } from "@/lib/db";
import {
  checkLoginCode, clearPendingEmail, clientIp, completeTwofa, createSession, destroySession, issueLoginCode,
  pendingEmail, pendingTwofaUserId, rateLimited, requireUser, sameSecret, setPendingEmail, signInPaused,
} from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";
import { findInvite } from "@/lib/invites";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { afterJoin } from "@/lib/automations";
import { formStr } from "@/lib/format";
import { escapeHtml, mailEnabled, sendMail } from "@/lib/mail";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Where the "cannot sign in" instructions live. Forks can point this at their own copy. */
const HELP_URL = process.env.HELP_URL || "https://github.com/antistud/pretty-good-dataroom/blob/main/docs/locked-out.md";

export async function setupAction(form: FormData) {
  if (!mailEnabled()) redirect("/email-needed");
  if (isSetUp()) redirect("/login");
  const company = formStr(form.get("company"), 120);
  const name = formStr(form.get("name"), 120);
  const email = formStr(form.get("email"), 200).toLowerCase();
  if (!company || !name || !EMAIL.test(email)) flash("/setup", "Fill in every field with a valid email.", "error");
  // If SETUP_TOKEN is set, first-run setup needs it. Stops a stranger claiming a fresh install.
  const required = process.env.SETUP_TOKEN;
  if (required) {
    if (rateLimited(`setup:${await clientIp()}`, 10)) flash("/setup", "Too many attempts. Wait 15 minutes and try again.", "error");
    if (!sameSecret(String(form.get("setup_token") ?? ""), required)) flash("/setup", "That setup token is not correct.", "error");
  }
  setSetting("company_name", company);
  const res = run("INSERT INTO users (email, name, role, last_seen_at) VALUES (?,?, 'founder', datetime('now'))", email, name);
  await createSession(Number(res.lastInsertRowid), false);
  redirect("/home");
}

/** Step one of signing in: ask for a code. The answer is the same whether or not the email has access. */
export async function requestCodeAction(form: FormData) {
  if (!mailEnabled()) redirect("/email-needed");
  const email = formStr(form.get("email"), 200).toLowerCase();
  if (!EMAIL.test(email)) flash("/login", "That email address doesn't look right.", "error");
  if (rateLimited(`code:ip:${await clientIp()}`, 20) || rateLimited(`code:${email}`, 5)) {
    flash("/login", "Too many codes requested. Wait 15 minutes and try again.", "error");
  }
  const user = q1<{ id: number; name: string; disabled: number }>("SELECT id, name, disabled FROM users WHERE email = ?", email);
  if (user && !user.disabled && !signInPaused(user.id)) {
    const code = issueLoginCode(user.id);
    const company = getSetting("company_name");
    // Deliberately not awaited: waiting for the mail server here would make the page slower for
    // real accounts than for unknown addresses, which would reveal who has access.
    void sendMail(
      email,
      `${code} is your ${company} sign-in code`,
      `<p>Hi ${escapeHtml(user.name.split(/\s+/)[0])},</p><p>Your sign-in code is</p><p style="font:600 30px/1.2 ui-monospace,Menlo,monospace;letter-spacing:0.18em;margin:6px 0 14px">${code}</p><p>It works once and expires in ten minutes. If you did not ask for it, you can ignore this email; nobody can sign in without the code.</p>`,
      undefined,
      { transactional: true, preview: `Your sign-in code is ${code}` },
    );
  }
  await setPendingEmail(email);
  redirect("/login/code");
}

/** Step two: the code. */
export async function verifyCodeAction(form: FormData) {
  const email = await pendingEmail();
  if (!email) flash("/login", "That took too long. Enter your email again for a new code.", "error");
  if (rateLimited(`verify:${email}`, 12) || rateLimited(`verify:ip:${await clientIp()}`, 40)) {
    flash("/login", "Too many attempts. Wait 15 minutes and try again.", "error");
  }
  const user = q1<{ id: number; totp_enabled: number; disabled: number; org_id: number | null }>("SELECT id, totp_enabled, disabled, org_id FROM users WHERE email = ?", email);
  const outcome = user && !user.disabled ? checkLoginCode(user.id, String(form.get("code") ?? "")) : "wrong";
  if (outcome === "paused") {
    // Tell the real owner, by email, that someone has been guessing. The screen itself says nothing different.
    const who = q1<{ name: string }>("SELECT name FROM users WHERE id = ?", user!.id);
    logActivity({ id: user!.id, orgId: user!.org_id }, "login.paused", undefined, undefined, "too many wrong sign-in codes");
    void sendMail(
      email!,
      `Sign-in to ${getSetting("company_name")} is paused for 24 hours`,
      `<p>Hi ${escapeHtml((who?.name ?? "").split(/\s+/)[0])},</p><p>Someone entered the wrong sign-in code for your account 15 times today, so sign-in for this email is paused for 24 hours. Nobody got in, and nothing has been lost.</p><p><strong>If that was you:</strong> it will work again tomorrow. To get in sooner, ask the person who runs this data room to lift the pause; it takes them one command.</p><p><strong>If it was not you:</strong> there is nothing you need to do. Nobody can sign in without the code that is sent to this inbox.</p><p style="color:#6d6b65">If you run this data room, the command and the full explanation are here: <a href="${HELP_URL}" style="color:#1f5c45">${HELP_URL}</a></p>`,
      undefined,
      { transactional: true },
    );
  }
  if (outcome !== "ok") {
    flash("/login/code", "That code is not right, or it has expired. Check the newest email, or ask for a new code.", "error");
  }
  await clearPendingEmail();
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

/** The invitation link itself proves the person owns the email, so accepting it signs them in. */
export async function acceptInviteAction(form: FormData) {
  if (!mailEnabled()) redirect("/email-needed");
  const token = String(form.get("token") ?? "");
  const back = `/invite/${encodeURIComponent(token)}`;
  if (rateLimited(`invite:${await clientIp()}`, 30)) flash(back, "Too many attempts. Wait a few minutes.", "error");
  const invite = findInvite(token);
  if (!invite) redirect(back);
  const name = formStr(form.get("name"), 120);
  if (!name) flash(back, "Tell us your name.", "error");
  if (q1("SELECT 1 FROM users WHERE email = ?", invite!.email)) flash("/login", "You already have access. Sign in with your email.", "error");
  const res = run(
    "INSERT INTO users (email, name, title, role, org_id, last_seen_at) VALUES (?,?,?,?,?, datetime('now'))",
    invite!.email,
    name,
    formStr(form.get("title"), 120) || null,
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
