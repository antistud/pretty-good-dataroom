import { getSetting, q, setSetting } from "./db";
import { findMissing, type MissingDoc } from "./missing";


export type MissingRow = MissingDoc & { folderId: number | null; folderName: string | null };
const DISMISSED_KEY = "docs_not_needed";

function dismissed(): string[] {
  try {
    const v = JSON.parse(getSetting(DISMISSED_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function dismissMissing(key: string) {
  const all = dismissed();
  if (!all.includes(key)) setSetting(DISMISSED_KEY, JSON.stringify([...all, key].slice(-200)));
}
export function restoreMissing() {
  setSetting(DISMISSED_KEY, "[]");
}
export function dismissedCount(): number {
  return dismissed().length;
}

/** Documents the room's own contents imply, which have not been uploaded. */
export function missingDocuments(): MissingRow[] {
  const folders = q<{ id: number; name: string; n: number }>("SELECT f.id, f.name, (SELECT COUNT(*) FROM documents d WHERE d.folder_id = f.id) AS n FROM folders f ORDER BY f.position, f.id");
  const found = findMissing({
    docs: q<{ t: string }>("SELECT d.name || ' ' || COALESCE(d.description, '') || ' ' || COALESCE(v.filename, '') AS t FROM documents d LEFT JOIN document_versions v ON v.id = d.current_version_id").map((r) => r.t),
    filledFolders: folders.filter((f) => f.n > 0).map((f) => f.name),
    holders: q("SELECT name, kind, shares FROM holders"),
    team: q("SELECT name FROM team_members"),
    safes: q<{ id: number; investor: string; amount: number; status: string; signed_on: string | null; document_id: number | null }>("SELECT id, investor_name AS investor, amount, status, signed_on, document_id FROM safes").map((s) => ({ ...s, hasDocument: s.document_id != null })),
    rounds: q("SELECT name, status, instrument FROM rounds"),
    dismissed: dismissed(),
  });
  return found.map((m) => {
    const folder = folders.find((f) => f.name.toLowerCase().startsWith(m.folder.toLowerCase())) ?? folders.find((f) => f.name.toLowerCase().includes(m.folder.toLowerCase()));
    return { ...m, folderId: folder?.id ?? null, folderName: folder?.name ?? null };
  });
}
