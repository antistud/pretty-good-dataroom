"use server";

import { q, q1, run } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { formStr } from "@/lib/format";

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
  logActivity(me, "team.add", "team_member", Number(res.lastInsertRowid), m.name);
  flash("/team", `${m.name} added.`);
}

export async function updateMemberAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("id"));
  const m = read(form);
  run("UPDATE team_members SET name = ?, title = ?, bio = ?, link = ? WHERE id = ?", m.name, m.title, m.bio, m.link, id);
  logActivity(me, "team.update", "team_member", id, m.name);
  flash("/team", `${m.name} saved.`);
}

export async function deleteMemberAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("id"));
  run("DELETE FROM team_members WHERE id = ?", id);
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
