"use server";

import { q, q1, run, getSetting } from "@/lib/db";
import { appUrl, canSeeSection, requireSection, requireStaff, requireUser, type Viewer } from "@/lib/auth";
import { getDocument } from "@/lib/docs";
import { logActivity } from "@/lib/activity";
import { escapeHtml, sendMail } from "@/lib/mail";
import { flash } from "@/lib/flash";
import { formStr } from "@/lib/format";

const KINDS = ["question", "document", "data", "call"];
const STATUSES = ["open", "in_progress", "fulfilled", "declined"];
const STATUS_LABEL: Record<string, string> = { open: "open", in_progress: "in progress", fulfilled: "fulfilled", declined: "declined" };

type Req = { id: number; org_id: number | null; title: string; status: string };

async function mailStaff(subject: string, html: string, url: string) {
  const staff = q<{ email: string }>("SELECT email FROM users WHERE role IN ('founder','team') AND disabled = 0 AND email_opt_out = 0");
  for (const s of staff) await sendMail(s.email, subject, html, { label: "Open the request", url });
}
async function mailOrg(orgId: number | null, exceptUserId: number, subject: string, html: string, url: string) {
  if (!orgId) return;
  const members = q<{ email: string }>("SELECT email FROM users WHERE org_id = ? AND disabled = 0 AND email_opt_out = 0 AND id != ?", orgId, exceptUserId);
  for (const m of members) await sendMail(m.email, subject, html, { label: "See the reply", url });
}

/** Loads a request only if this viewer is allowed to touch it. */
function loadFor(me: Viewer, id: number): Req | undefined {
  const r = q1<Req>("SELECT id, org_id, title, status FROM requests WHERE id = ?", id);
  if (!r) return undefined;
  if (me.isStaff) return r;
  if (!me.orgId || r.org_id !== me.orgId || !canSeeSection(me, "requests")) return undefined;
  return r;
}

export async function createRequestAction(form: FormData) {
  const me = await requireSection("requests");
  if (me.isStaff || !me.orgId) flash("/requests", "Requests are created by investors. You answer them here.", "error");
  const kind = String(form.get("kind") ?? "");
  const title = formStr(form.get("title"), 200);
  const body = formStr(form.get("body"), 5000);
  if (!KINDS.includes(kind)) flash("/requests", "Choose what kind of request this is.", "error");
  if (!title) flash("/requests", "Give your request a short title.", "error");
  const res = run("INSERT INTO requests (org_id, user_id, kind, title, body) VALUES (?,?,?,?,?)", me.orgId, me.id, kind, title, body || null);
  const id = Number(res.lastInsertRowid);
  logActivity(me, "request.create", "request", id, `${kind}: ${title}`);
  await mailStaff(
    `New ${kind} request from ${me.orgName ?? me.name}: ${title}`,
    `<p><strong>${escapeHtml(me.name)}</strong>${me.orgName ? ` (${escapeHtml(me.orgName)})` : ""} sent a request in the ${escapeHtml(getSetting("company_name"))} data room.</p><p><strong>${escapeHtml(title)}</strong></p>${body ? `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>` : ""}`,
    `${appUrl()}/requests/${id}`,
  );
  flash(`/requests/${id}`, "Sent. The founders have been told, and their reply will appear here.");
}

export async function replyAction(form: FormData) {
  const me = await requireUser();
  const id = Number(form.get("request_id"));
  const req = loadFor(me, id);
  if (!req) flash("/requests", "That request was not found.", "error");
  const back = `/requests/${id}`;
  const body = formStr(form.get("body"), 5000);
  let documentId: number | null = null;
  let newStatus: string | null = null;
  if (me.isStaff) {
    const d = Number(form.get("document_id"));
    if (d) {
      if (!getDocument(d)) flash(back, "That document no longer exists.", "error");
      documentId = d;
    }
    const s = String(form.get("status") ?? "");
    if (s && STATUSES.includes(s) && s !== req!.status) newStatus = s;
  }
  if (!body && !documentId && !newStatus) flash(back, "Write a reply first.", "error");
  if (body || documentId) {
    run("INSERT INTO request_messages (request_id, user_id, body, document_id) VALUES (?,?,?,?)", id, me.id, body || "Attached a document.", documentId);
  }
  if (newStatus) run("UPDATE requests SET status = ? WHERE id = ?", newStatus, id);
  // An investor replying to a closed request re-opens it so it is not missed.
  if (!me.isStaff && (req!.status === "fulfilled" || req!.status === "declined")) {
    run("UPDATE requests SET status = 'open' WHERE id = ?", id);
  }
  run("UPDATE requests SET updated_at = datetime('now') WHERE id = ?", id);
  logActivity(me, newStatus ? "request.status" : "request.reply", "request", id, newStatus ?? undefined);
  const url = `${appUrl()}${back}`;
  if (me.isStaff) {
    await mailOrg(
      req!.org_id,
      me.id,
      newStatus ? `Your request is now ${STATUS_LABEL[newStatus]}: ${req!.title}` : `Reply to your request: ${req!.title}`,
      `<p>${escapeHtml(me.name)} ${newStatus ? `marked your request as <strong>${STATUS_LABEL[newStatus]}</strong>` : "replied to your request"}: <strong>${escapeHtml(req!.title)}</strong></p>${body ? `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>` : ""}`,
      url,
    );
  } else {
    await mailStaff(
      `${me.orgName ?? me.name} replied: ${req!.title}`,
      `<p><strong>${escapeHtml(me.name)}</strong> replied on <strong>${escapeHtml(req!.title)}</strong>.</p><p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>`,
      url,
    );
  }
  flash(back, newStatus ? `Saved. Status is now ${STATUS_LABEL[newStatus]}.` : "Reply posted.");
}

export async function setRequestStatusAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("request_id"));
  const status = String(form.get("status") ?? "");
  const back = String(form.get("back") ?? "") === "inbox" ? "/requests" : `/requests/${id}`;
  const req = q1<Req>("SELECT id, org_id, title, status FROM requests WHERE id = ?", id);
  if (!req) flash("/requests", "That request was not found.", "error");
  if (!STATUSES.includes(status)) flash(back, "Unknown status.", "error");
  if (status === req!.status) flash(back, "Nothing changed.");
  run("UPDATE requests SET status = ?, updated_at = datetime('now') WHERE id = ?", status, id);
  logActivity(me, "request.status", "request", id, status);
  await mailOrg(
    req!.org_id,
    me.id,
    `Your request is now ${STATUS_LABEL[status]}: ${req!.title}`,
    `<p>${escapeHtml(me.name)} marked your request <strong>${escapeHtml(req!.title)}</strong> as <strong>${STATUS_LABEL[status]}</strong>.</p>`,
    `${appUrl()}/requests/${id}`,
  );
  flash(back, `Marked ${STATUS_LABEL[status]}.`);
}
