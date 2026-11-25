"use server";

import { db, q, q1, run } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { allFolders } from "@/lib/docs";
import { deleteFile, saveFile } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { formLevel, formStr } from "@/lib/format";
import { canWatermark, fileKind } from "@/lib/watermark";
import { dismissMissing, restoreMissing } from "@/lib/missing-room";
import { fileKey, planFiling, type FilingHint } from "@/lib/filing";

const MAX_BYTES = 50 * 1024 * 1024;
const UNSORTED = "To sort";

function folderUrl(id: number | null) {
  return id ? `/documents?folder=${id}` : "/documents";
}

function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 200) || "file";
}

async function readUpload(form: FormData, back: string) {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) flash(back, "Choose a file to upload.", "error");
  const f = file as File;
  if (f.size > MAX_BYTES) flash(back, "That file is larger than 50 MB. Compress it or split it up.", "error");
  const data = Buffer.from(await f.arrayBuffer());
  const filename = cleanFilename(f.name);
  const mime = (f.type || "application/octet-stream").slice(0, 100);
  const pdfProblem = fileKind(mime, filename) === "pdf" && !(await canWatermark(data));
  return { data, filename, mime, pdfProblem };
}

const PDF_WARNING =
  " Warning: this PDF is password-protected or damaged, so it cannot be watermarked and investors will not be able to open it. Upload an unprotected copy as a new version.";

/** Ids of a folder and everything beneath it. */
function subtree(folderId: number): number[] {
  const folders = allFolders();
  const ids = [folderId];
  for (let i = 0; i < ids.length; i++) for (const f of folders) if (f.parent_id === ids[i]) ids.push(f.id);
  return ids;
}

function parentId(form: FormData): number | null {
  const n = Number(form.get("parent_id"));
  return Number.isInteger(n) && n > 0 && q1("SELECT 1 FROM folders WHERE id = ?", n) ? n : null;
}

export async function createFolderAction(form: FormData) {
  const me = await requireStaff();
  const name = formStr(form.get("name"), 120);
  if (!name) flash("/documents", "Give the folder a name.", "error");
  const parent = parentId(form);
  const pos = q1<{ p: number }>("SELECT IFNULL(MAX(position), 0) + 1 AS p FROM folders")!.p;
  const res = run(
    "INSERT INTO folders (parent_id, name, description, min_level, position) VALUES (?,?,?,?,?)",
    parent,
    name,
    formStr(form.get("description"), 500) || null,
    formLevel(form.get("min_level")),
    pos,
  );
  const id = Number(res.lastInsertRowid);
  logActivity(me, "folder.create", "folder", id, name);
  flash(folderUrl(id), `Folder "${name}" created. Upload documents into it below.`);
}

export async function updateFolderAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("folder_id"));
  if (!q1("SELECT 1 FROM folders WHERE id = ?", id)) flash("/documents", "Folder not found.", "error");
  const name = formStr(form.get("name"), 120);
  if (!name) flash(folderUrl(id), "Give the folder a name.", "error");
  const parent = parentId(form);
  if (parent && subtree(id).includes(parent)) flash(folderUrl(id), "A folder cannot be moved inside itself.", "error");
  run(
    "UPDATE folders SET name = ?, description = ?, min_level = ?, parent_id = ? WHERE id = ?",
    name,
    formStr(form.get("description"), 500) || null,
    formLevel(form.get("min_level")),
    parent,
    id,
  );
  logActivity(me, "folder.update", "folder", id, name);
  flash(folderUrl(id), "Folder saved.");
}

export async function deleteFolderAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("folder_id"));
  const folder = q1<{ name: string; parent_id: number | null }>("SELECT name, parent_id FROM folders WHERE id = ?", id);
  if (!folder) flash("/documents", "Folder not found.", "error");
  if (form.get("confirm") !== "on") flash(folderUrl(id), "Tick the box to confirm you want to delete this folder and everything in it.", "error");
  const ids = subtree(id);
  const marks = ids.map(() => "?").join(",");
  const keys = q<{ storage_key: string }>(
    `SELECT v.storage_key FROM document_versions v JOIN documents d ON d.id = v.document_id WHERE d.folder_id IN (${marks})`,
    ...ids,
  );
  run("DELETE FROM folders WHERE id = ?", id); // documents and versions cascade
  for (const k of keys) await deleteFile(k.storage_key);
  logActivity(me, "folder.delete", "folder", id, folder!.name);
  flash(folderUrl(folder!.parent_id), `Folder "${folder!.name}" and its documents were deleted.`);
}

export async function uploadDocumentAction(form: FormData) {
  const me = await requireStaff();
  const folderId = Number(form.get("folder_id"));
  if (!q1("SELECT 1 FROM folders WHERE id = ?", folderId)) flash("/documents", "Pick a folder first.", "error");
  const back = folderUrl(folderId);
  const up = await readUpload(form, back);
  const name = formStr(form.get("name"), 200) || up.filename.replace(/\.[^.]+$/, "");
  const key = await saveFile(up.data);
  const docId = db.transaction(() => {
    const d = run(
      "INSERT INTO documents (folder_id, name, description, min_level, created_by) VALUES (?,?,?,?,?)",
      folderId,
      name,
      formStr(form.get("description"), 500) || null,
      formLevel(form.get("min_level")),
      me.id,
    );
    const id = Number(d.lastInsertRowid);
    const v = run(
      "INSERT INTO document_versions (document_id, filename, mime, size, storage_key, uploaded_by) VALUES (?,?,?,?,?,?)",
      id,
      up.filename,
      up.mime,
      up.data.length,
      key,
      me.id,
    );
    run("UPDATE documents SET current_version_id = ? WHERE id = ?", Number(v.lastInsertRowid), id);
    return id;
  })();
  logActivity(me, "doc.upload", "document", docId, name);
  if (up.pdfProblem) flash(`/documents/${docId}`, `"${name}" uploaded.${PDF_WARNING}`, "error");
  flash(back, `"${name}" uploaded.`);
}

/** Where a "still to upload" form may send the founder back to. */
function backTo(form: FormData): string {
  return (["/documents", "/fill", "/home"].includes(String(form.get("back"))) ? String(form.get("back")) : "/documents");
}

/**
 * Several files at once. Each is named and put in a folder using the note a founder's AI assistant left for it, or
 * failing that its own file name. Who can see it always comes from the folder, never from the assistant.
 */
export async function uploadManyAction(form: FormData) {
  const me = await requireStaff();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 30);
  if (files.length === 0) flash("/documents", "Choose at least one file.", "error");
  const big = files.find((f) => f.size > MAX_BYTES);
  if (big) flash("/documents", `"${cleanFilename(big.name)}" is larger than 50 MB. Nothing was uploaded.`, "error");
  let folders = allFolders();
  // Where a file goes when neither a note nor its name says: the folder the founder had open, or else a private
  // "To sort" folder that only founders and team can see, so nothing reaches investors by accident.
  let fallback = folders.find((f) => f.id === Number(form.get("fallback_folder_id")))?.id;
  if (!fallback) {
    fallback = folders.find((f) => f.name === UNSORTED && f.parent_id == null)?.id;
    if (!fallback) {
      const pos = q1<{ p: number }>("SELECT IFNULL(MAX(position), 0) + 1 AS p FROM folders")!.p;
      fallback = Number(run("INSERT INTO folders (name, description, min_level, position) VALUES (?,?,100,?)", UNSORTED, "Files the room could not place. Only founders and team can see this folder. Move each one where it belongs.", pos).lastInsertRowid);
      folders = allFolders();
    }
  }
  const hints = q<FilingHint>("SELECT id, filename, title, folder, description, safe_investor FROM doc_hints WHERE used = 0 ORDER BY id DESC");
  const safes = q<{ id: number; investor_name: string; document_id: number | null }>("SELECT id, investor_name, document_id FROM safes WHERE status != 'committed'");

  const ids: number[] = [];
  let attached = 0;
  let protectedPdfs = 0;
  for (const f of files) {
    const data = Buffer.from(await f.arrayBuffer());
    const filename = cleanFilename(f.name);
    const mime = (f.type || "application/octet-stream").slice(0, 100);
    if (fileKind(mime, filename) === "pdf" && !(await canWatermark(data))) protectedPdfs++;
    const plan = planFiling(filename, hints, folders, fallback);
    const folder = folders.find((x) => x.id === plan.folderId)!;
    const storageKey = await saveFile(data);
    const docId = db.transaction(() => {
      const d = run("INSERT INTO documents (folder_id, name, description, min_level, created_by) VALUES (?,?,?,?,?)", folder.id, plan.title.slice(0, 200), plan.description, folder.effective_level, me.id);
      const id = Number(d.lastInsertRowid);
      const v = run("INSERT INTO document_versions (document_id, filename, mime, size, storage_key, uploaded_by) VALUES (?,?,?,?,?,?)", id, filename, mime, data.length, storageKey, me.id);
      run("UPDATE documents SET current_version_id = ? WHERE id = ?", Number(v.lastInsertRowid), id);
      if (plan.hintId) run("UPDATE doc_hints SET used = 1 WHERE id = ?", plan.hintId);
      return id;
    })();
    // A signed SAFE is attached to its entry on the cap table when exactly one unattached SAFE matches the investor.
    const text = fileKey(`${plan.title} ${filename}`);
    const wanted = plan.safeInvestor ? fileKey(plan.safeInvestor) : null;
    const matches = safes.filter((s) => s.document_id == null && (wanted ? fileKey(s.investor_name) === wanted || fileKey(s.investor_name).includes(wanted) || wanted.includes(fileKey(s.investor_name)) : /\bsafe\b/.test(text) && fileKey(s.investor_name).split(" ").filter((w) => w.length >= 4).some((w) => text.includes(w))));
    if (matches.length === 1) {
      run("UPDATE safes SET document_id = ? WHERE id = ?", docId, matches[0].id);
      matches[0].document_id = docId;
      attached++;
    }
    logActivity(me, "doc.upload", "document", docId, `${plan.title} (filed ${plan.how === "assistant" ? "from an assistant's note" : plan.how === "name" ? "by its name" : "in the open folder"})`);
    ids.push(docId);
  }
  if (!q1("SELECT 1 FROM documents WHERE folder_id = ?", fallback) && folders.find((f) => f.id === fallback)?.name === UNSORTED) run("DELETE FROM folders WHERE id = ? AND name = ?", fallback, UNSORTED);
  const unsorted = folders.find((f) => f.id === fallback)?.name === UNSORTED ? (q1<{ n: number }>(`SELECT COUNT(*) AS n FROM documents WHERE folder_id = ? AND id IN (${ids.map(() => "?").join(",")})`, fallback, ...ids)?.n ?? 0) : 0;
  const extra = `${attached ? ` ${attached} attached to ${attached === 1 ? "its SAFE" : "their SAFEs"} on the cap table.` : ""}${unsorted ? ` ${unsorted} could not be placed and ${unsorted === 1 ? "is" : "are"} in "To sort", where only you can see ${unsorted === 1 ? "it" : "them"}.` : ""}${protectedPdfs ? ` ${protectedPdfs} PDF${protectedPdfs === 1 ? " is" : "s are"} password-protected or damaged and cannot be shown to investors; upload unprotected copies.` : ""}`;
  flash(`/documents?filed=${ids.join(",")}`, `${ids.length} document${ids.length === 1 ? "" : "s"} filed. Check where each one went below.${extra}`, protectedPdfs ? "error" : "ok");
}

export async function discardHintsAction(form: FormData) {
  await requireStaff();
  run("DELETE FROM doc_hints WHERE used = 0");
  flash(backTo(form), "The assistant's filing notes were discarded. Nothing in the room changed.");
}

export async function newVersionAction(form: FormData) {
  const me = await requireStaff();
  const docId = Number(form.get("document_id"));
  const doc = q1<{ name: string }>("SELECT name FROM documents WHERE id = ?", docId);
  if (!doc) flash("/documents", "Document not found.", "error");
  const back = `/documents/${docId}`;
  const up = await readUpload(form, back);
  const key = await saveFile(up.data);
  db.transaction(() => {
    const v = run(
      "INSERT INTO document_versions (document_id, filename, mime, size, storage_key, uploaded_by) VALUES (?,?,?,?,?,?)",
      docId,
      up.filename,
      up.mime,
      up.data.length,
      key,
      me.id,
    );
    run("UPDATE documents SET current_version_id = ? WHERE id = ?", Number(v.lastInsertRowid), docId);
  })();
  logActivity(me, "doc.version", "document", docId, up.filename);
  if (up.pdfProblem) flash(back, `New version uploaded.${PDF_WARNING}`, "error");
  flash(back, "New version uploaded. Investors now see this one; older versions stay visible to you only.");
}

export async function updateDocumentAction(form: FormData) {
  const me = await requireStaff();
  const docId = Number(form.get("document_id"));
  if (!q1("SELECT 1 FROM documents WHERE id = ?", docId)) flash("/documents", "Document not found.", "error");
  const back = `/documents/${docId}`;
  const name = formStr(form.get("name"), 200);
  const folderId = Number(form.get("folder_id"));
  if (!name) flash(back, "Give the document a name.", "error");
  if (!q1("SELECT 1 FROM folders WHERE id = ?", folderId)) flash(back, "Pick a folder.", "error");
  run(
    "UPDATE documents SET name = ?, description = ?, min_level = ?, folder_id = ? WHERE id = ?",
    name,
    formStr(form.get("description"), 500) || null,
    formLevel(form.get("min_level")),
    folderId,
    docId,
  );
  logActivity(me, "doc.update", "document", docId, name);
  flash(back, "Document saved.");
}

export async function deleteDocumentAction(form: FormData) {
  const me = await requireStaff();
  const docId = Number(form.get("document_id"));
  const doc = q1<{ name: string; folder_id: number }>("SELECT name, folder_id FROM documents WHERE id = ?", docId);
  if (!doc) flash("/documents", "Document not found.", "error");
  if (form.get("confirm") !== "on") flash(`/documents/${docId}`, "Tick the box to confirm you want to delete this document.", "error");
  const keys = q<{ storage_key: string }>("SELECT storage_key FROM document_versions WHERE document_id = ?", docId);
  run("DELETE FROM documents WHERE id = ?", docId);
  for (const k of keys) await deleteFile(k.storage_key);
  logActivity(me, "doc.delete", "document", docId, doc!.name);
  flash(folderUrl(doc!.folder_id), `"${doc!.name}" was deleted.`);
}


export async function dismissMissingAction(form: FormData) {
  const me = await requireStaff();
  const key = formStr(form.get("key"), 120);
  if (key) {
    dismissMissing(key);
    logActivity(me, "documents.not_needed", undefined, undefined, key);
  }
  flash(backTo(form), "Hidden. You can bring it back from the bottom of that list.");
}

export async function restoreMissingAction(form: FormData) {
  await requireStaff();
  restoreMissing();
  flash(backTo(form), "Showing everything again.");
}
