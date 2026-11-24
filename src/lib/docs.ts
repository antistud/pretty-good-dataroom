import { q, q1 } from "./db";

export type DocRow = {
  id: number;
  folder_id: number;
  name: string;
  description: string | null;
  min_level: number;
  /** max of the document's own level and every folder above it */
  effective_level: number;
  current_version_id: number | null;
  created_at: string;
  filename: string | null;
  mime: string | null;
  size: number | null;
  version_created_at: string | null;
};
export type FolderRow = {
  id: number;
  parent_id: number | null;
  name: string;
  description: string | null;
  min_level: number;
  effective_level: number;
  position: number;
};

// A folder is as restricted as its most restricted ancestor.
const FOLDER_LEVELS = `
WITH RECURSIVE fl(id, lvl) AS (
  SELECT id, min_level FROM folders WHERE parent_id IS NULL
  UNION ALL
  SELECT f.id, MAX(f.min_level, fl.lvl) FROM folders f JOIN fl ON f.parent_id = fl.id
)`;

export function allFolders(): FolderRow[] {
  return q<FolderRow>(`${FOLDER_LEVELS} SELECT f.*, fl.lvl AS effective_level FROM folders f JOIN fl ON fl.id = f.id ORDER BY f.position, f.name`);
}
export function visibleFolders(level: number): FolderRow[] {
  return allFolders().filter((f) => f.effective_level <= level);
}

const DOC_SELECT = `${FOLDER_LEVELS}
SELECT d.id, d.folder_id, d.name, d.description, d.min_level, d.current_version_id, d.created_at,
       MAX(d.min_level, fl.lvl) AS effective_level,
       v.filename, v.mime, v.size, v.created_at AS version_created_at
  FROM documents d JOIN fl ON fl.id = d.folder_id
  LEFT JOIN document_versions v ON v.id = d.current_version_id`;

/** Every document a viewer at this level may open. Pass 100 for staff. */
export function visibleDocuments(level: number): DocRow[] {
  return q<DocRow>(`${DOC_SELECT} WHERE MAX(d.min_level, fl.lvl) <= ? ORDER BY d.name`, level);
}
export function getDocument(id: number): DocRow | undefined {
  return q1<DocRow>(`${DOC_SELECT} WHERE d.id = ?`, id);
}
