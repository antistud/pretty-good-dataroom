import { ExportBar } from "@/components/Export";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { visibleDocuments, visibleFolders, type FolderRow } from "@/lib/docs";
import { logView } from "@/lib/activity";
import { fileSize, fmtDate, levelName } from "@/lib/format";
import { Field, Flash, Hint, LevelSelect, PageHead } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { FilingBox } from "@/components/FilingBox";
import { MissingDocs } from "@/components/MissingDocs";
import { createFolderAction, deleteFolderAction, updateFolderAction, uploadDocumentAction } from "./actions";

export default async function Documents({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireSection("documents");
  const sp = await searchParams;
  logView(me, "section.view", undefined, undefined, "documents");

  const folders = visibleFolders(me.level);
  const docs = visibleDocuments(me.level);
  const count = (id: number) => docs.filter((d) => d.folder_id === id).length;
  const roots = folders.filter((f) => f.parent_id == null || !folders.some((p) => p.id === f.parent_id));
  const current = folders.find((f) => f.id === Number(sp.folder)) ?? roots[0];
  const here = current ? docs.filter((d) => d.folder_id === current.id) : [];
  const children = current ? folders.filter((f) => f.parent_id === current.id) : [];
  const parent = current ? folders.find((f) => f.id === current.parent_id) : undefined;
  // Documents filed a moment ago by the drop box, so the founder can check where each one went.
  const filedIds = String(sp.filed ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 30);
  const filed = me.isStaff ? docs.filter((d) => filedIds.includes(d.id)) : [];

  // Folders that `current` could be moved into: anything that is not itself or beneath it.
  const below = new Set<number>(current ? [current.id] : []);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of folders) if (f.parent_id != null && below.has(f.parent_id) && !below.has(f.id)) (below.add(f.id), (grew = true));
  }

  const tree = (list: FolderRow[], depth: number): React.ReactNode =>
    list.map((f) => (
      <div key={f.id}>
        <Link
          href={`/documents?folder=${f.id}`}
          style={{ display: "block", padding: "6px 8px", paddingLeft: 8 + depth * 16, borderRadius: 7, color: "var(--ink)", background: current?.id === f.id ? "var(--soft)" : undefined, fontWeight: current?.id === f.id ? 600 : 400 }}
        >
          <Icon name="folder" size={16} /> {f.name} <span className="muted small">{count(f.id)}</span>
        </Link>
        {tree(folders.filter((c) => c.parent_id === f.id), depth + 1)}
      </div>
    ));

  return (
    <>
      <PageHead title="Documents" sub={me.isStaff ? "Everything investors can open." : "The company's documents."}><ExportBar print={false} links={me.canDownload ? [{ href: "/api/export/documents.zip", label: "Download everything (zip)" }] : []} /></PageHead>
      <Flash sp={sp} />
      {me.isStaff ? (
        <Hint title="How this works">Pick a folder, then upload into it. A document is shown only to people allowed to see both it and its folder. Investors see PDFs stamped with their own email.</Hint>
      ) : (
        <Hint title="What to do here">Pick a folder and click a document to read it. Each page is marked with your email, and the founders can see what you have viewed.</Hint>
      )}

      {me.isStaff && filed.length > 0 && (
        <div className="card callout" id="filed">
          <h2>Just filed</h2>
          <ul className="quiet-list">
            {filed.map((d) => (
              <li key={d.id} className="spread">
                <span><Link href={`/documents/${d.id}`}>{d.name}</Link> <span className="muted">→ <Link href={`/documents?folder=${d.folder_id}`}>{folders.find((f) => f.id === d.folder_id)?.name}</Link> · {levelName(d.effective_level)}</span></span>
                <Link className="small" href={`/documents/${d.id}`}>Move or rename</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {me.isStaff && <FilingBox back="/documents" fallbackFolderId={sp.folder ? current?.id : undefined} />}
      {me.isStaff && <MissingDocs back="/documents" />}

      {folders.length === 0 ? (
        <div className="empty">{me.isStaff ? "No folders yet. Create one below." : "Nothing has been shared with you here yet. Check back soon."}</div>
      ) : (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className="card" style={{ flex: "0 0 250px", padding: 10 }}>{tree(roots, 0)}</div>
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            {current && (
              <div className="card">
                <div className="spread">
                  <h2 style={{ margin: 0 }}>
                    {parent && <><Link href={`/documents?folder=${parent.id}`}>{parent.name}</Link> <span className="muted">/</span> </>}
                    {current.name}
                  </h2>
                  {me.isStaff && <span className="badge">{levelName(current.effective_level)}</span>}
                </div>
                {current.description && <p className="muted" style={{ marginTop: 6 }}>{current.description}</p>}
                {children.length > 0 && (
                  <p className="small" style={{ marginTop: 8 }}>
                    Sub-folders: {children.map((c, i) => <span key={c.id}>{i > 0 && ", "}<Link href={`/documents?folder=${c.id}`}>{c.name}</Link></span>)}
                  </p>
                )}
                {here.length === 0 ? (
                  <div className="empty" style={{ marginTop: 12 }}>{me.isStaff ? "This folder is empty. Upload the first document below." : "Nothing in this folder yet."}</div>
                ) : (
                  <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table className="table">
                      <thead><tr><th>Document</th><th>File</th><th>Updated</th>{me.isStaff && <th>Who can see it</th>}</tr></thead>
                      <tbody>
                        {here.map((d) => (
                          <tr key={d.id}>
                            <td>
                              <Link href={`/documents/${d.id}`} className="with-icon"><Icon name="file" size={16} /><strong>{d.name}</strong></Link>
                              {d.description && <div className="muted small">{d.description}</div>}
                            </td>
                            <td className="small muted nowrap">{d.filename ? `${(d.filename.split(".").pop() ?? "").toUpperCase()} · ${fileSize(d.size ?? 0)}` : "—"}</td>
                            <td className="small muted nowrap">{fmtDate(d.version_created_at ?? d.created_at)}</td>
                            {me.isStaff && <td><span className="badge">{levelName(d.effective_level)}</span></td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {me.isStaff && current && (
              <>
                <div className="card" id="upload">
                  <h2>Upload to &ldquo;{current.name}&rdquo;</h2>
                  <form action={uploadDocumentAction}>
                    <input type="hidden" name="folder_id" value={current.id} />
                    <Field label="File" hint="Up to 50 MB. PDFs work best: investors read them in the browser with a watermark. Other file types are download-only."><input type="file" name="file" required /></Field>
                    <div className="grid2">
                      <Field label="Name (optional)" hint="Leave blank to use the file name."><input name="name" maxLength={200} /></Field>
                      <LevelSelect value={current.effective_level} />
                    </div>
                    <Field label="One-line description (optional)" hint="Tell the reader what this is and why it matters."><input name="description" maxLength={500} /></Field>
                    <button className="btn primary">Upload</button>
                  </form>
                </div>
                <div className="card">
                  <details>
                    <summary>Folder settings for &ldquo;{current.name}&rdquo;</summary>
                    <form action={updateFolderAction}>
                      <input type="hidden" name="folder_id" value={current.id} />
                      <div className="grid2">
                        <Field label="Name"><input name="name" required maxLength={120} defaultValue={current.name} /></Field>
                        <LevelSelect value={current.min_level} />
                      </div>
                      <Field label="Description"><input name="description" maxLength={500} defaultValue={current.description ?? ""} /></Field>
                      <Field label="Inside">
                        <select name="parent_id" defaultValue={String(current.parent_id ?? "")}>
                          <option value="">Top level</option>
                          {folders.filter((f) => !below.has(f.id)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </Field>
                      <button className="btn">Save folder</button>
                    </form>
                    <hr />
                    <form action={deleteFolderAction} className="row">
                      <input type="hidden" name="folder_id" value={current.id} />
                      <label className="row small"><input type="checkbox" name="confirm" /> Delete this folder, its sub-folders and every document in them. This cannot be undone.</label>
                      <button className="btn small danger">Delete folder</button>
                    </form>
                  </details>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {me.isStaff && (
        <div className="card">
          <details open={folders.length === 0}>
            <summary>New folder</summary>
            <form action={createFolderAction}>
              <div className="grid2">
                <Field label="Name"><input name="name" required maxLength={120} /></Field>
                <LevelSelect />
              </div>
              <Field label="Description (optional)" hint="Shown to readers at the top of the folder."><input name="description" maxLength={500} /></Field>
              <Field label="Inside">
                <select name="parent_id" defaultValue="">
                  <option value="">Top level</option>
                  {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
              <button className="btn">Create folder</button>
            </form>
          </details>
        </div>
      )}
    </>
  );
}
