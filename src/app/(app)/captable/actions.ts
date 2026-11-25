"use server";

import { q1, run } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { formNum, formStr } from "@/lib/format";
import { standing } from "@/lib/captable";

const HOLDER_KINDS = ["founder", "employee", "advisor", "investor", "pool"];
const SAFE_STATUSES = ["committed", "signed", "wired"];

export async function saveHolderAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("id")) || null;
  const kind = String(form.get("kind"));
  const name = formStr(form.get("name"), 120) || (kind === "pool" ? "Unissued option pool" : "");
  const shares = formNum(form.get("shares"));
  if (!HOLDER_KINDS.includes(kind)) flash("/captable", "Pick a holder type.", "error");
  if (!name) flash("/captable", "Give the holder a name.", "error");
  if (shares == null || shares < 0) flash("/captable", "Enter the number of shares.", "error");
  const cls = formStr(form.get("share_class"), 60) || "Common";
  const notes = formStr(form.get("notes"), 500) || null;
  // Dates and vesting. The pool is not a person, so it has none.
  const date = (key: string) => {
    const v = String(form.get(key) ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
  };
  const person = kind !== "pool";
  const start = person ? date("start_date") : null;
  const end = person ? date("end_date") : null;
  const vest = person ? formNum(form.get("vest_months")) : null;
  const cliff = person ? formNum(form.get("cliff_months")) : null;
  if (start && end && end < start) flash("/captable", "The leaving date is before the start date.", "error");
  if (vest != null && (vest < 0 || vest > 240 || !Number.isInteger(vest))) flash("/captable", "Enter the vesting period as a whole number of months, for example 48.", "error");
  if (cliff != null && (cliff < 0 || !Number.isInteger(cliff) || (vest != null && cliff > vest))) flash("/captable", "The cliff must be a whole number of months, no longer than the vesting period.", "error");
  if (vest && !start) flash("/captable", "Add the start date, so vesting can be worked out.", "error");
  const dates = [start, end, vest || null, vest ? cliff || 0 : null];
  if (id) {
    run("UPDATE holders SET name = ?, kind = ?, share_class = ?, shares = ?, notes = ?, start_date = ?, end_date = ?, vest_months = ?, cliff_months = ? WHERE id = ?", name, kind, cls, shares, notes, ...dates, id);
    logActivity(me, "holder.update", "holder", id, name);
  } else {
    const pos = q1<{ p: number }>("SELECT IFNULL(MAX(position), 0) + 1 AS p FROM holders")!.p;
    const res = run("INSERT INTO holders (name, kind, share_class, shares, notes, position, start_date, end_date, vest_months, cliff_months) VALUES (?,?,?,?,?,?,?,?,?,?)", name, kind, cls, shares, notes, pos, ...dates);
    logActivity(me, "holder.create", "holder", Number(res.lastInsertRowid), name);
  }
  const st = standing({ shares: shares!, start, end, vestMonths: vest, cliffMonths: cliff }, new Date().toISOString().slice(0, 10));
  if (st.left && st.forfeited > 0) flash("/captable", `${name} saved. They keep ${Math.round(st.held).toLocaleString("en-US")} vested shares; the other ${Math.round(st.forfeited).toLocaleString("en-US")} no longer count.`);
  flash("/captable", `${name} saved.`);
}

export async function deleteHolderAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("id"));
  const row = q1<{ name: string }>("SELECT name FROM holders WHERE id = ?", id);
  if (!row) flash("/captable", "Holder not found.", "error");
  run("DELETE FROM holders WHERE id = ?", id);
  logActivity(me, "holder.delete", "holder", id, row!.name);
  flash("/captable", `${row!.name} removed from the cap table.`);
}

export async function saveSafeAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("id")) || null;
  const investor = formStr(form.get("investor_name"), 120);
  const amount = formNum(form.get("amount"));
  const cap = formNum(form.get("valuation_cap"));
  const discountPct = formNum(form.get("discount"));
  const status = String(form.get("status"));
  if (!investor) flash("/captable", "Who is the investor?", "error");
  if (amount == null || amount <= 0) flash("/captable", "Enter the investment amount.", "error");
  if (cap != null && cap <= 0) flash("/captable", "The valuation cap must be above zero, or left blank for none.", "error");
  if (cap != null && amount! >= cap) flash("/captable", "The amount cannot be as large as the valuation cap.", "error");
  if (discountPct != null && (discountPct < 0 || discountPct >= 100)) flash("/captable", "Enter the discount as a percentage between 0 and 99.", "error");
  if (!SAFE_STATUSES.includes(status)) flash("/captable", "Pick a status.", "error");
  const roundId = Number(form.get("round_id")) || null;
  const orgId = Number(form.get("org_id")) || null;
  const docId = Number(form.get("document_id")) || null;
  if (roundId && !q1("SELECT 1 FROM rounds WHERE id = ?", roundId)) flash("/captable", "Round not found.", "error");
  if (orgId && !q1("SELECT 1 FROM orgs WHERE id = ?", orgId)) flash("/captable", "Organisation not found.", "error");
  if (docId && !q1("SELECT 1 FROM documents WHERE id = ?", docId)) flash("/captable", "Document not found.", "error");
  const signed = formStr(form.get("signed_on"), 10);
  const vals = [
    roundId, orgId, investor, amount, form.get("kind") === "pre" ? "pre" : "post", cap,
    discountPct ? discountPct / 100 : null, form.get("mfn") === "on" ? 1 : 0, status,
    /^\d{4}-\d{2}-\d{2}$/.test(signed) ? signed : null, docId, formStr(form.get("notes"), 500) || null,
  ];
  if (id) {
    run(
      "UPDATE safes SET round_id = ?, org_id = ?, investor_name = ?, amount = ?, kind = ?, valuation_cap = ?, discount = ?, mfn = ?, status = ?, signed_on = ?, document_id = ?, notes = ? WHERE id = ?",
      ...vals, id,
    );
    logActivity(me, "safe.update", "safe", id, investor);
  } else {
    const res = run(
      "INSERT INTO safes (round_id, org_id, investor_name, amount, kind, valuation_cap, discount, mfn, status, signed_on, document_id, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      ...vals,
    );
    logActivity(me, "safe.create", "safe", Number(res.lastInsertRowid), investor);
  }
  flash("/captable", `SAFE for ${investor} saved.`);
}

export async function deleteSafeAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("id"));
  const row = q1<{ investor_name: string }>("SELECT investor_name FROM safes WHERE id = ?", id);
  if (!row) flash("/captable", "SAFE not found.", "error");
  run("DELETE FROM safes WHERE id = ?", id);
  logActivity(me, "safe.delete", "safe", id, row!.investor_name);
  flash("/captable", `SAFE for ${row!.investor_name} removed.`);
}
