import Link from "next/link";
import { redirect } from "next/navigation";
import { canSeeSection, requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { allFolders, getDocument } from "@/lib/docs";
import { logView } from "@/lib/activity";
import { fileSize, fmtDate, fmtDateTime, levelName } from "@/lib/format";
import { fileKind } from "@/lib/watermark";
import { Field, Flash, Hint, LevelSelect, PageHead } from "@/components/ui";
import { deleteDocumentAction, newVersionAction, updateDocumentAction } from "../actions";

type Version = { id: number; filename: string; size: number; created_at: string; uploader: string | null };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const me = await requireUser();
  if (!canSeeSection(me, "documents")) redirect("/home");
  const doc = getDocument(Number((await params).id));
  if (!doc || doc.effective_level > me.level) redirect("/documents");
  logView(me, "doc.view", "document", doc.id);

  const folders = allFolders();
  const folder = folders.find((f) => f.id === doc.folder_id);
  const kind = fileKind(doc.mime, doc.filename);
  const src = doc.current_version_id ? `/api/file/${doc.current_version_id}` : null;
  const versions = me.isStaff
    ? q<Version>(
        "SELECT v.id, v.filename, v.size, v.created_at, u.name AS uploader FROM document_versions v LEFT JOIN users u ON u.id = v.uploaded_by WHERE v.document_id = ? ORDER BY v.id DESC",
        doc.id,
      )
    : [];

  return (
    <>
      <PageHead
        title={doc.name}
        sub={
          <>
            <Link href={`/documents?folder=${doc.folder_id}`}>← {folder?.name ?? "Documents"}</Link>
            {doc.filename && <> · {doc.filename} · {fileSize(doc.size ?? 0)} · updated {fmtDate(doc.version_created_at ?? doc.created_at)}</>}
            {me.isStaff && <> · <span className="badge">{levelName(doc.effective_level)}</span></>}
          </>
        }
      >
        {src && me.canDownload && <a className="btn" href={`${src}?download=1`}>Download</a>}
      </PageHead>
      <Flash sp={await searchParams} />
      {doc.description && <p>{doc.description}</p>}

      {!src ? (
        <div className="empty">This document has no file yet.</div>
      ) : kind === "pdf" ? (
        <>
          {!me.isStaff && <p className="muted small">Each page is marked with your email address. {me.canDownload ? "Downloaded copies are marked too." : "Downloads are not enabled for your access level."}</p>}
          <iframe className="viewer" src={src} title={doc.name} />
        </>
      ) : kind === "image" ? (
        <div className="watermarked" data-mark={me.isStaff ? "" : me.email}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={doc.name} />
        </div>
      ) : kind === "text" && me.isStaff ? (
        <iframe className="viewer" src={src} title={doc.name} />
      ) : me.canDownload ? (
        <Hint title="This file opens on your computer">
          This type of file cannot be shown in the browser. <a href={`${src}?download=1`}>Download {doc.filename}</a> and open it there.
        </Hint>
      ) : (
        <Hint title="This file cannot be shown in the browser">
          It is a {(doc.filename?.split(".").pop() ?? "file").toUpperCase()} file, and downloads are not enabled for your access level. Use &ldquo;Ask or request&rdquo; in the menu to ask the founders for a copy or a walkthrough.
        </Hint>
      )}

      {me.isStaff && (
        <>
          <div className="grid2" style={{ marginTop: 16 }}>
            <div className="card">
              <h2>Details</h2>
              <form action={updateDocumentAction}>
                <input type="hidden" name="document_id" value={doc.id} />
                <Field label="Name"><input name="name" required maxLength={200} defaultValue={doc.name} /></Field>
                <Field label="Description"><input name="description" maxLength={500} defaultValue={doc.description ?? ""} /></Field>
                <LevelSelect value={doc.min_level} />
                <Field label="Folder" hint="Moving a document can change who sees it: the folder's own setting also applies.">
                  <select name="folder_id" defaultValue={String(doc.folder_id)}>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.name} ({levelName(f.effective_level)})</option>)}
                  </select>
                </Field>
                <button className="btn primary">Save</button>
              </form>
            </div>
            <div className="card">
              <h2>Replace with a new version</h2>
              <p className="muted small">Investors always see the newest version. Older ones stay here for your records.</p>
              <form action={newVersionAction}>
                <input type="hidden" name="document_id" value={doc.id} />
                <Field label="File"><input type="file" name="file" required /></Field>
                <button className="btn">Upload new version</button>
              </form>
              <hr />
              <h3>Version history</h3>
              <div className="table-wrap"><table className="table"><tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td><a href={`/api/file/${v.id}?download=1`}>{v.filename}</a> {v.id === doc.current_version_id && <span className="badge ok">current</span>}</td>
                    <td className="small muted nowrap">{fileSize(v.size)}</td>
                    <td className="small muted">{fmtDateTime(v.created_at)}{v.uploader ? ` · ${v.uploader}` : ""}</td>
                  </tr>
                ))}
              </tbody></table></div>
            </div>
          </div>
          <div className="card">
            <form action={deleteDocumentAction} className="row">
              <input type="hidden" name="document_id" value={doc.id} />
              <label className="row small"><input type="checkbox" name="confirm" /> Delete this document and all its versions. This cannot be undone.</label>
              <button className="btn small danger">Delete document</button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
