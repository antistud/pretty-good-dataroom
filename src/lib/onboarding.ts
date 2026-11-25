import { q } from "./db";

export type UpdateLink = { id: number; title: string; period: string; published_at: string | null };

/** Published updates with at least one section this level may read, newest first. */
export function visibleUpdates(level: number, limit = 6): UpdateLink[] {
  return q<UpdateLink>(
    `SELECT u.id, u.title, u.period, u.published_at FROM updates u
      WHERE u.status = 'published' AND EXISTS (SELECT 1 FROM update_sections s WHERE s.update_id = u.id AND s.min_level <= ?)
      ORDER BY u.period DESC LIMIT ?`,
    level,
    limit,
  );
}
