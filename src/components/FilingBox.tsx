import { q } from "@/lib/db";
import { allFolders } from "@/lib/docs";
import { planFiling, type FilingHint } from "@/lib/filing";
import { DropZone } from "@/components/DropZone";
import { discardHintsAction, uploadManyAction } from "@/app/(app)/documents/actions";

/**
 * For founders and team: one box to drop many files into. Files an AI
 * assistant has described are listed first, so the founder knows which ones
 * the room is waiting for and where each will go.
 */
export function FilingBox({ back, fallbackFolderId, heading = "Add documents" }: { back: string; fallbackFolderId?: number; heading?: string }) {
  const folders = allFolders();
  if (folders.length === 0) return null;
  const hints = q<FilingHint>("SELECT id, filename, title, folder, description, safe_investor FROM doc_hints WHERE used = 0 ORDER BY id");
  const fallback = fallbackFolderId ?? folders[0].id;
  return (
    <div className="card" id="add">
      <h2>{heading}</h2>
      <p className="muted" style={{ marginTop: -4, maxWidth: "62ch" }}>Drop everything in at once. Each file goes to the folder its name points to; anything unclear waits in a private “To sort” folder.</p>
      {hints.length > 0 && (
        <div className="noted">
          <strong>Your assistant described {hints.length} file{hints.length === 1 ? "" : "s"}.</strong> Drop {hints.length === 1 ? "it" : "them"} below and {hints.length === 1 ? "it is" : "they are"} named and filed like this:
          <ul>
            {hints.slice(0, 12).map((h) => {
              const plan = planFiling(h.filename, hints, folders, fallback);
              return <li key={h.id}><code>{h.filename}</code> → {plan.title} <span className="muted">· {folders.find((f) => f.id === plan.folderId)?.name}{h.safe_investor ? ` · attached to ${h.safe_investor}'s SAFE` : ""}</span></li>;
            })}
          </ul>
          {hints.length > 12 && <p className="muted small" style={{ margin: "4px 0 0" }}>and {hints.length - 12} more.</p>}
          <form action={discardHintsAction} style={{ marginTop: 6 }}><input type="hidden" name="back" value={back} /><button className="linkbtn small">Discard these notes</button></form>
        </div>
      )}
      <DropZone action={uploadManyAction} noted={hints.map((h) => h.filename)} fallbackFolderId={fallbackFolderId} />
    </div>
  );
}
