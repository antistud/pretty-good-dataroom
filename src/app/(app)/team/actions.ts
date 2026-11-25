"use server";

import { q, q1, run } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { formStr } from "@/lib/format";
import { deleteFile, saveFile } from "@/lib/storage";
import { imageType } from "@/lib/images";

/** Stores an uploaded photo for a team member, replacing any earlier one. Does nothing when no file was chosen. */
async function savePhoto(form: FormData, id: number) {
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > 3 * 1024 * 1024) flash("/team", "That photo is larger than 3 MB. Use a smaller one.", "error");
  const data = Buffer.from(await file.arrayBuffer());
  const mime = imageType(data);
  if (!mime) flash("/team", "Use a JPEG, PNG or WebP photo.", "error");
  const old = q1<{ photo_key: string | null }>("SELECT photo_key FROM team_members WHERE id = ?", id)?.photo_key;
  run("UPDATE team_members SET photo_key = ?, photo_mime = ? WHERE id = ?", await saveFile(data), mime, id);
  if (old) await deleteFile(old).catch(() => {});
}

function read(form: FormData) {
  const name = formStr(form.get("name"), 120);
  const link = formStr(form.get("link"), 300);
  if (!name) flash("/team", "Give the person a name.", "error");
  if (link && !/^https?:\/\//i.test(link)) flash("/team", "The link must start with https:// or http://.", "error");
  return { name, title: formStr(form.get("title"), 120) || null, bio: formStr(form.get("bio"), 2000) || null, link: link || null };
}

export async function addMemberAction(form: FormData) {
  const me = await requireStaff();
  const m = read(form);
  const pos = q1<{ p: number }>("SELECT IFNULL(MAX(position), -1) + 1 AS p FROM team_members")!.p;
  const res = run("INSERT INTO team_members (name, title, bio, link, position) VALUES (?,?,?,?,?)", m.name, m.title, m.bio, m.link, pos);
  await savePhoto(form, Number(res.lastInsertRowid));
  logActivity(me, "team.add", "team_member", Number(res.lastInsertRowid), m.name);
  flash("/team", `${m.name} added.`);
}

export async function updateMemberAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("id"));
  const m = read(form);
  run("UPDATE team_members SET name = ?, title = ?, bio = ?, link = ? WHERE id = ?", m.name, m.title, m.bio, m.link, id);
  if (form.get("remove_photo") === "on") {
    const key = q1<{ photo_key: string | null }>("SELECT photo_key FROM team_members WHERE id = ?", id)?.photo_key;
    run("UPDATE team_members SET photo_key = NULL, photo_mime = NULL WHERE id = ?", id);
    if (key) await deleteFile(key).catch(() => {});
  } else await savePhoto(form, id);
  logActivity(me, "team.update", "team_member", id, m.name);
  flash("/team", `${m.name} saved.`);
}

export async function deleteMemberAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("id"));
  const key = q1<{ photo_key: string | null }>("SELECT photo_key FROM team_members WHERE id = ?", id)?.photo_key;
  run("DELETE FROM team_members WHERE id = ?", id);
  if (key) await deleteFile(key).catch(() => {});
  logActivity(me, "team.delete", "team_member", id);
  flash("/team", "Removed from the team page.");
}

export async function moveMemberAction(form: FormData) {
  await requireStaff();
  const id = Number(form.get("id"));
  const dir = form.get("dir") === "up" ? -1 : 1;
  const ids = q<{ id: number }>("SELECT id FROM team_members ORDER BY position, id").map((r) => r.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i >= 0 && j >= 0 && j < ids.length) {
    [ids[i], ids[j]] = [ids[j], ids[i]];
    ids.forEach((mid, pos) => run("UPDATE team_members SET position = ? WHERE id = ?", pos, mid));
  }
  flash("/team", "Order updated.");
}
