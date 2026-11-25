"use server";

import { q1, run } from "@/lib/db";
import { canSeeSection, requireSection } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { formStr } from "@/lib/format";
import { escapeHtml } from "@/lib/mail";
import { notify, staffIds } from "@/lib/notify";
import { allSections, getUpdate } from "@/lib/updates";

const KINDS: Record<string, string> = { thanks: "says thanks for the update", help: "can help with one of your asks", talk: "would like to talk" };

/** A reader may respond only to a published update they can actually see. */
async function readable(id: number) {
  const me = await requireSection("updates");
  const update = getUpdate(id);
  const visible = update?.status === "published" && allSections(id).some((s) => s.min_level <= me.level && s.body_md.trim());
  if (me.isStaff || !update || !visible) flash("/updates", "That update was not found.", "error");
  return { me, update: update! };
}

export async function reactUpdateAction(form: FormData) {
  const id = Number(form.get("update_id"));
  const kind = String(form.get("kind") ?? "");
  const { me, update } = await readable(id);
  if (!KINDS[kind]) flash(`/updates/${id}`, "Unknown response.", "error");
  const before = q1<{ kind: string }>("SELECT kind FROM update_reactions WHERE update_id = ? AND user_id = ?", id, me.id);
  run("INSERT INTO update_reactions (update_id, user_id, kind) VALUES (?,?,?) ON CONFLICT(update_id, user_id) DO UPDATE SET kind = excluded.kind, created_at = datetime('now')", id, me.id, kind);
  logActivity(me, "update.react", "update", id, kind);
  if (before?.kind !== kind) {
    await notify(staffIds(), {
      category: "updates",
      title: `${me.name}${me.orgName ? ` (${me.orgName})` : ""} ${KINDS[kind]}`,
      body: `In response to ${update.title}.`,
      href: `/updates/${id}`,
      email: kind !== "thanks",
      mail: { replyTo: me.email },
    });
  }
  flash(`/updates/${id}`, kind === "thanks" ? "Passed on. Thank you for reading." : "The founders have been told and will be in touch.");
}

/** A written reply to an update becomes a conversation thread with the founders. */
export async function replyUpdateAction(form: FormData) {
  const id = Number(form.get("update_id"));
  const { me, update } = await readable(id);
  const body = formStr(form.get("body"), 5000);
  if (!body) flash(`/updates/${id}`, "Write your reply first.", "error");
  if (!me.orgId) flash(`/updates/${id}`, "Your account is not linked to an organisation yet. Ask the founders to fix that.", "error");
  const res = run("INSERT INTO requests (org_id, user_id, kind, title, body) VALUES (?,?, 'question', ?, ?)", me.orgId, me.id, `Re: ${update.title}`.slice(0, 200), body);
  const requestId = Number(res.lastInsertRowid);
  logActivity(me, "request.create", "request", requestId, `question: Re: ${update.title}`);
  await notify(staffIds(), {
    category: "updates",
    title: `${me.name}${me.orgName ? ` (${me.orgName})` : ""} replied to ${update.title}`,
    body: body.slice(0, 240),
    href: `/requests/${requestId}`,
    cta: "Read and reply",
    emailHtml: `<p><strong>${escapeHtml(me.name)}</strong> replied to your update:</p><p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>`,
    mail: { replyTo: me.email },
  });
  // Supporters cannot open the requests section, so they stay on the update.
  flash(canSeeSection(me, "requests") ? `/requests/${requestId}` : `/updates/${id}`, "Sent to the founders. Their reply will reach you here and by email.");
}
