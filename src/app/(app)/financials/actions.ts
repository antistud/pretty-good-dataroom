"use server";

import { run } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { formNum, formStr } from "@/lib/format";

export async function saveMonthAction(form: FormData) {
  const me = await requireStaff();
  const month = String(form.get("month") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) flash("/financials", "Pick a month.", "error");
  const revenue = formNum(form.get("revenue")) ?? 0;
  const expenses = formNum(form.get("expenses")) ?? 0;
  const cash = formNum(form.get("cash")) ?? 0;
  if (revenue < 0 || expenses < 0) flash("/financials", "Revenue and expenses cannot be negative.", "error");
  run(
    `INSERT INTO financials (month, revenue, expenses, cash, notes) VALUES (?,?,?,?,?)
     ON CONFLICT(month) DO UPDATE SET revenue = excluded.revenue, expenses = excluded.expenses, cash = excluded.cash, notes = excluded.notes`,
    month, revenue, expenses, cash, formStr(form.get("notes"), 500) || null,
  );
  logActivity(me, "financials.save", undefined, undefined, month);
  flash("/financials", `${month} saved.`);
}

export async function deleteMonthAction(form: FormData) {
  const me = await requireStaff();
  const month = String(form.get("month") ?? "");
  run("DELETE FROM financials WHERE month = ?", month);
  logActivity(me, "financials.delete", undefined, undefined, month);
  flash("/financials", `${month} deleted.`);
}
