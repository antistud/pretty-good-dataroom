"use server";

import { redirect } from "next/navigation";
import { db, q1, run } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { formLevel, formStr, monthLabel } from "@/lib/format";
import { allSections, createDraft, getUpdate, sendUpdateEmails, tierLevels } from "@/lib/updates";

export async function createUpdateAction(form: FormData) {
  const me = await requireStaff();
  const period = formStr(form.get("period"), 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) flash("/updates", "Pick a month.", "error");
  const existing = q1<{ id: number }>("SELECT id FROM updates WHERE period = ?", period);
  if (existing) redirect(`/updates/${existing.id}`);
  const id = createDraft(period, me.id);
  logActivity(me, "update.create", "update", id, period);
  flash(`/updates/${id}`, `Draft for ${monthLabel(period)} created. Fill in each section, then publish.`);
}

function draftOrFlash(id: number) {
  const update = getUpdate(id);
  if (!update) flash("/updates", "That update does not exist.", "error");
  return update!;
}

export async function saveTitleAction(form: FormData) {
  await requireStaff();
  const id = Number(form.get("update_id"));
  draftOrFlash(id);
  const title = formStr(form.get("title"), 200);
  if (!title) flash(`/updates/${id}`, "The update needs a title.", "error");
  run("UPDATE updates SET title = ? WHERE id = ?", title, id);
  flash(`/updates/${id}`, "Title saved.");
}

function sectionOf(form: FormData) {
  const sectionId = Number(form.get("section_id"));
  const s = q1<{ id: number; update_id: number; heading: string }>("SELECT id, update_id, heading FROM update_sections WHERE id = ?", sectionId);
  if (!s) flash("/updates", "That section does not exist.", "error");
  return s!;
}

export async function saveSectionAction(form: FormData) {
  await requireStaff();
  const s = sectionOf(form);
  const heading = formStr(form.get("heading"), 200);
  if (!heading) flash(`/updates/${s.update_id}`, "Give the section a heading.", "error");
  run(
    "UPDATE update_sections SET heading = ?, body_md = ?, min_level = ? WHERE id = ?",
    heading,
    formStr(form.get("body_md"), 20000),
    formLevel(form.get("min_level"), tierLevels().highest),
    s.id,
  );
  flash(`/updates/${s.update_id}`, `"${heading}" saved.`);
}

export async function deleteSectionAction(form: FormData) {
  const me = await requireStaff();
  const s = sectionOf(form);
  run("DELETE FROM update_sections WHERE id = ?", s.id);
  logActivity(me, "update.section_delete", "update", s.update_id, s.heading);
  flash(`/updates/${s.update_id}`, `"${s.heading}" removed.`);
}

async function move(form: FormData, dir: -1 | 1) {
  await requireStaff();
  const s = sectionOf(form);
  const ids = allSections(s.update_id).map((x) => x.id);
  const i = ids.indexOf(s.id);
  const j = i + dir;
  if (j >= 0 && j < ids.length) {
    [ids[i], ids[j]] = [ids[j], ids[i]];
    db.transaction(() => ids.forEach((id, pos) => run("UPDATE update_sections SET position = ? WHERE id = ?", pos, id)))();
  }
  redirect(`/updates/${s.update_id}`);
}
export async function moveSectionUpAction(form: FormData) {
  await move(form, -1);
}
export async function moveSectionDownAction(form: FormData) {
  await move(form, 1);
}

export async function addSectionAction(form: FormData) {
  await requireStaff();
  const id = Number(form.get("update_id"));
  draftOrFlash(id);
  const heading = formStr(form.get("heading"), 200);
  if (!heading) flash(`/updates/${id}`, "Give the new section a heading.", "error");
  const pos = q1<{ p: number | null }>("SELECT MAX(position) AS p FROM update_sections WHERE update_id = ?", id)?.p ?? -1;
  // New sections start at the most restricted investor tier, so a forgotten tag hides rather than leaks.
  run(
    "INSERT INTO update_sections (update_id, heading, body_md, min_level, position) VALUES (?,?,?,?,?)",
    id,
    heading,
    "",
    formLevel(form.get("min_level"), tierLevels().highest),
    pos + 1,
  );
  flash(`/updates/${id}`, `"${heading}" added.`);
}

function sendMessage(res: { sent: number; failed: number; mailOn: boolean }): string {
  if (!res.mailOn) return "Emails were not sent because email (SMTP) is not set up. Readers will see it when they sign in.";
  if (res.failed) return `${res.sent} email${res.sent === 1 ? "" : "s"} sent, ${res.failed} failed. Use "Send to anyone missed" to retry.`;
  return `${res.sent} email${res.sent === 1 ? "" : "s"} sent, each with only the sections that reader may see.`;
}

export async function publishUpdateAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("update_id"));
  const update = draftOrFlash(id);
  if (update.status === "published") flash(`/updates/${id}`, "This update is already published.", "error");
  if (!allSections(id).some((s) => s.body_md.trim())) flash(`/updates/${id}`, "Every section is empty. Write something before publishing.", "error");
  // Empty sections are dropped on publish so nobody receives a bare heading.
  run("DELETE FROM update_sections WHERE update_id = ? AND TRIM(body_md) = ''", id);
  run("UPDATE updates SET status = 'published', published_at = datetime('now') WHERE id = ?", id);
  logActivity(me, "update.publish", "update", id, update.period);
  const res = await sendUpdateEmails(id);
  flash(`/updates/${id}`, `Published. ${sendMessage(res)}`, "ok", "published");
}

export async function resendUpdateAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("update_id"));
  const update = draftOrFlash(id);
  if (update.status !== "published") flash(`/updates/${id}`, "Publish the update first.", "error");
  const res = await sendUpdateEmails(id);
  logActivity(me, "update.resend", "update", id, `${res.sent} sent`);
  flash(`/updates/${id}`, res.mailOn && !res.sent && !res.failed ? "Everyone who should get this already has it." : sendMessage(res));
}

export async function unpublishUpdateAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("update_id"));
  draftOrFlash(id);
  run("UPDATE updates SET status = 'draft', published_at = NULL WHERE id = ?", id);
  logActivity(me, "update.unpublish", "update", id);
  flash(`/updates/${id}`, "Back to draft. Readers can no longer open it. Emails already sent cannot be recalled; when you publish again, only people who did not get it are emailed.");
}

export async function deleteUpdateAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("update_id"));
  const update = draftOrFlash(id);
  if (update.status === "published") flash(`/updates/${id}`, "Unpublish it first, then delete.", "error");
  run("DELETE FROM updates WHERE id = ?", id);
  logActivity(me, "update.delete", "update", id, update.period);
  flash("/updates", `${update.title} deleted.`);
}
