import { q1, getSetting } from "./db";

export function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The monthly update covers the previous calendar month and is due on the
 * configured day of the current month.
 */
export function updateDue(now = new Date()) {
  const dueDay = Math.min(28, Math.max(1, Number(getSetting("update_due_day")) || 5));
  const period = periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dueDay));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysUntilDue = Math.round((dueDate.getTime() - today) / 86400_000);
  const update = q1<{ id: number; status: string }>("SELECT id, status FROM updates WHERE period = ?", period);
  return {
    period,
    dueDate,
    daysUntilDue,
    published: update?.status === "published",
    draftId: update?.id ?? null,
    overdue: update?.status !== "published" && daysUntilDue < 0,
  };
}
