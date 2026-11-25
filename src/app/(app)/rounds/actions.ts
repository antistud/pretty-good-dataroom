"use server";

import { redirect } from "next/navigation";
import { q1, run } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { formLevel, formNum, formStr } from "@/lib/format";
import { CLOSING_MANUAL, READY_MANUAL, ROUND_STATUSES, getRound } from "@/lib/rounds";

function fields(form: FormData, back: string) {
  const name = formStr(form.get("name"), 120);
  if (!name) flash(back, "Give the round a name, like Pre-seed.", "error");
  const discount = formNum(form.get("discount"));
  const pool = formNum(form.get("new_pool_pct"));
  if (discount != null && (discount < 0 || discount >= 100)) flash(back, "Enter the discount as a percentage between 0 and 99.", "error");
  if (pool != null && (pool < 0 || pool >= 100)) flash(back, "Enter the option pool as a percentage between 0 and 99.", "error");
  const pos = (v: number | null) => (v != null && v > 0 ? v : null);
  return [
    name,
    form.get("instrument") === "priced" ? "priced" : "safe",
    Math.max(0, formNum(form.get("target_amount")) ?? 0),
    pos(formNum(form.get("valuation_cap"))),
    discount ? discount / 100 : null,
    pos(formNum(form.get("pre_money"))),
    pool ? pool / 100 : null,
    pos(formNum(form.get("min_check"))),
    formStr(form.get("terms_md"), 10000) || null,
    formLevel(form.get("min_level"), 1),
  ];
}

export async function createRoundAction(form: FormData) {
  const me = await requireStaff();
  const vals = fields(form, "/rounds");
  const res = run(
    "INSERT INTO rounds (name, instrument, target_amount, valuation_cap, discount, pre_money, new_pool_pct, min_check, terms_md, min_level) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ...vals,
  );
  const id = Number(res.lastInsertRowid);
  logActivity(me, "round.create", "round", id, String(vals[0]));
  flash(`/rounds/${id}`, "Round created. Work through the checklist below before you open it.");
}

export async function updateRoundAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("id"));
  if (!getRound(id)) flash("/rounds", "Round not found.", "error");
  const vals = fields(form, `/rounds/${id}`);
  run(
    "UPDATE rounds SET name = ?, instrument = ?, target_amount = ?, valuation_cap = ?, discount = ?, pre_money = ?, new_pool_pct = ?, min_check = ?, terms_md = ?, min_level = ? WHERE id = ?",
    ...vals, id,
  );
  logActivity(me, "round.update", "round", id, String(vals[0]));
  flash(`/rounds/${id}`, "Round saved.");
}

export async function setRoundStatusAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("id"));
  const status = String(form.get("status")) as (typeof ROUND_STATUSES)[number];
  const round = getRound(id);
  if (!round) flash("/rounds", "Round not found.", "error");
  if (!ROUND_STATUSES.includes(status)) flash(`/rounds/${id}`, "Unknown status.", "error");
  run("UPDATE rounds SET status = ? WHERE id = ?", status, id);
  if (status === "open" && !round!.opened_at) run("UPDATE rounds SET opened_at = datetime('now') WHERE id = ?", id);
  if (status === "closed") run("UPDATE rounds SET closed_at = datetime('now') WHERE id = ?", id);
  else run("UPDATE rounds SET closed_at = NULL WHERE id = ?", id);
  if (status === "planning") run("UPDATE rounds SET opened_at = NULL WHERE id = ?", id);
  logActivity(me, "round.status", "round", id, `${round!.name}: ${round!.status} -> ${status}`);
  const msg = {
    planning: "Moved back to planning. Investors no longer see this round.",
    open: "The round is open. Investors with access now see the terms on The round page.",
    closing: "Closing started. Work through the closing checklist as money arrives.",
    closed: "Round closed. Finish anything left on the closing checklist.",
  }[status];
  flash(`/rounds/${id}`, msg, "ok", status === "closed" ? "closed" : undefined);
}

export async function deleteRoundAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("id"));
  const round = getRound(id);
  if (!round) flash("/rounds", "Round not found.", "error");
  if (round!.status !== "planning") flash(`/rounds/${id}`, "Only a round that is still in planning can be deleted.", "error");
  if (q1("SELECT 1 FROM safes WHERE round_id = ?", id)) flash(`/rounds/${id}`, "This round has SAFEs recorded against it. Move or remove them first.", "error");
  run("DELETE FROM checks WHERE scope LIKE ?", `round:${id}:%`);
  run("DELETE FROM rounds WHERE id = ?", id);
  logActivity(me, "round.delete", "round", id, round!.name);
  flash("/rounds", `${round!.name} deleted.`);
}

/** Ticks or unticks a manual checklist item. Auto-detected items cannot be toggled. */
export async function toggleCheckAction(form: FormData) {
  await requireStaff();
  const id = Number(form.get("id"));
  const list = form.get("list") === "closing" ? "closing" : "ready";
  const key = String(form.get("key"));
  if (!getRound(id)) flash("/rounds", "Round not found.", "error");
  if (!(list === "ready" ? READY_MANUAL : CLOSING_MANUAL).includes(key)) flash(`/rounds/${id}`, "That item is ticked automatically.", "error");
  const scope = `round:${id}:${list}`;
  if (q1("SELECT 1 FROM checks WHERE scope = ? AND key = ?", scope, key)) run("DELETE FROM checks WHERE scope = ? AND key = ?", scope, key);
  else run("INSERT INTO checks (scope, key) VALUES (?, ?)", scope, key);
  redirect(`/rounds/${id}#checklist`);
}
