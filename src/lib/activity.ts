import { db, run } from "./db";
import type { Viewer } from "./auth";

/** Records who did what. Used for investor engagement signals and the admin audit log. */
export function logActivity(
  me: Pick<Viewer, "id" | "orgId"> | null,
  action: string,
  targetType?: string,
  targetId?: number | null,
  detail?: string,
) {
  run(
    "INSERT INTO activity (user_id, org_id, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?)",
    me?.id ?? null,
    me?.orgId ?? null,
    action,
    targetType ?? null,
    targetId ?? null,
    detail ? detail.slice(0, 500) : null,
  );
}

/**
 * Records that an investor or supporter looked at something. Staff views are
 * not recorded, and repeat views within 30 minutes are collapsed.
 * Conventions: action "section.view" with detail = section name
 * (overview, team, round, captable, financials, documents, intros),
 * "doc.view" / "doc.download" with targetType "document",
 * "update.view" with targetType "update", "page.view" with targetType "page".
 */
export function logView(me: Viewer, action: string, targetType?: string, targetId?: number | null, detail?: string) {
  if (me.isStaff) return;
  const recent = db
    .prepare(
      `SELECT 1 FROM activity WHERE user_id = ? AND action = ? AND IFNULL(target_id, 0) = IFNULL(?, 0) AND IFNULL(detail, '') = IFNULL(?, '')
         AND created_at > datetime('now', '-30 minutes') LIMIT 1`,
    )
    .get(me.id, action, targetId ?? null, detail ?? null);
  if (!recent) logActivity(me, action, targetType, targetId, detail);
}
