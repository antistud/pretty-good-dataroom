"use server";

import { q1, run } from "@/lib/db";
import { appUrl, hashToken, newToken, requireFounder, requireStaff } from "@/lib/auth";
import { createInvite } from "@/lib/invites";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { announceAccess } from "@/lib/automations";
import { formStr } from "@/lib/format";

function inviteMessage(res: { url: string; emailed: boolean }) {
  return res.emailed ? `Invitation emailed. Link, in case you need it: ${res.url}` : `Copy this link and send it to them yourself: ${res.url}`;
}

export async function createOrgAction(form: FormData) {
  const me = await requireStaff();
  const name = formStr(form.get("name"), 120);
  const kind = form.get("kind") === "supporter" ? "supporter" : "investor";
  const tier = kind === "supporter" ? 0 : Math.max(1, Number(form.get("tier")) || 1);
  if (!name) flash("/people", "Give the organisation a name.", "error");
  if (!q1("SELECT 1 FROM tiers WHERE level = ?", tier) && tier !== 0) flash("/people", "Unknown access tier.", "error");
  const res = run("INSERT INTO orgs (name, kind, tier) VALUES (?,?,?)", name, kind, tier);
  const orgId = Number(res.lastInsertRowid);
  logActivity(me, "org.create", "org", orgId, name);
  const email = formStr(form.get("email"), 200);
  if (email) {
    const inv = await createInvite(me, { email, name: formStr(form.get("contact"), 120), role: kind, orgId });
    if (!inv.ok) flash("/people", `${name} was created, but the invitation failed: ${inv.error}`, "error");
    else flash("/people", `${name} created. ${inviteMessage(inv)}`);
  }
  flash("/people", `${name} created. Invite someone to it below.`);
}

export async function inviteAction(form: FormData) {
  const me = await requireStaff();
  const roleRaw = String(form.get("role") ?? "");
  let role: "founder" | "team" | "investor" | "supporter";
  let orgId: number | null = null;
  if (roleRaw === "founder" || roleRaw === "team") {
    // Only founders can add people to the company side.
    if (me.role !== "founder") flash("/people", "Only founders can invite founders and team members.", "error");
    role = roleRaw;
  } else {
    orgId = Number(form.get("org_id"));
    const org = q1<{ kind: "investor" | "supporter" }>("SELECT kind FROM orgs WHERE id = ?", orgId);
    if (!org) flash("/people", "Pick an organisation.", "error");
    role = org!.kind;
  }
  const inv = await createInvite(me, { email: formStr(form.get("email"), 200), name: formStr(form.get("name"), 120), role, orgId });
  if (!inv.ok) flash("/people", inv.error, "error");
  else flash("/people", inviteMessage(inv));
}

export async function setOrgTierAction(form: FormData) {
  const me = await requireStaff();
  let announceAccessLater: { orgId: number; old: number; next: number; by: number } | null = null;
  const orgId = Number(form.get("org_id"));
  const raw = String(form.get("tier"));
  const org = q1<{ name: string; tier: number; kind: string }>("SELECT name, tier, kind FROM orgs WHERE id = ?", orgId);
  if (!org) flash("/people", "Organisation not found.", "error");
  if (raw !== "0") announceAccessLater = { orgId, old: org!.kind === "investor" ? org!.tier : 0, next: Number(raw), by: me.id };
  if (raw === "0") {
    run("UPDATE orgs SET kind = 'supporter', tier = 0 WHERE id = ?", orgId);
    run("UPDATE users SET role = 'supporter' WHERE org_id = ?", orgId);
    run("UPDATE invites SET role = 'supporter' WHERE org_id = ? AND accepted_at IS NULL", orgId);
  } else {
    const tier = Number(raw);
    if (!q1("SELECT 1 FROM tiers WHERE level = ?", tier)) flash("/people", "Unknown access tier.", "error");
    run("UPDATE orgs SET kind = 'investor', tier = ? WHERE id = ?", tier, orgId);
    run("UPDATE users SET role = 'investor' WHERE org_id = ?", orgId);
    run("UPDATE invites SET role = 'investor' WHERE org_id = ? AND accepted_at IS NULL", orgId);
  }
  logActivity(me, "org.tier", "org", orgId, `${org!.name} -> ${raw}`);
  if (announceAccessLater) announceAccess(announceAccessLater.orgId, announceAccessLater.old, announceAccessLater.next, announceAccessLater.by);
  flash("/people", `Access for ${org!.name} updated.`);
}

export async function setUserDisabledAction(form: FormData) {
  const me = await requireStaff();
  const userId = Number(form.get("user_id"));
  const disabled = form.get("disabled") === "1" ? 1 : 0;
  const user = q1<{ role: string; email: string }>("SELECT role, email FROM users WHERE id = ?", userId);
  if (!user) flash("/people", "User not found.", "error");
  if (userId === me.id) flash("/people", "You cannot remove your own access.", "error");
  if ((user!.role === "founder" || user!.role === "team") && me.role !== "founder") flash("/people", "Only founders can change company-side accounts.", "error");
  run("UPDATE users SET disabled = ? WHERE id = ?", disabled, userId);
  if (disabled) run("DELETE FROM sessions WHERE user_id = ?", userId);
  logActivity(me, disabled ? "user.disable" : "user.enable", "user", userId, user!.email);
  flash("/people", disabled ? `${user!.email} can no longer sign in.` : `${user!.email} can sign in again.`);
}

export async function revokeInviteAction(form: FormData) {
  const me = await requireStaff();
  run("UPDATE invites SET revoked = 1 WHERE id = ?", Number(form.get("invite_id")));
  logActivity(me, "invite.revoke", "invite", Number(form.get("invite_id")));
  flash("/people", "Invitation cancelled. The link no longer works.");
}

/** Founders can hand someone a reset link when email is not configured. */
export async function resetLinkAction(form: FormData) {
  const me = await requireFounder();
  const userId = Number(form.get("user_id"));
  const user = q1<{ email: string }>("SELECT email FROM users WHERE id = ?", userId);
  if (!user) flash("/people", "User not found.", "error");
  const token = newToken();
  run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)", hashToken(token), userId, new Date(Date.now() + 3600_000).toISOString());
  logActivity(me, "user.reset_link", "user", userId, user!.email);
  flash("/people", `Reset link for ${user!.email}, valid for one hour: ${appUrl()}/reset/${token}`);
}
