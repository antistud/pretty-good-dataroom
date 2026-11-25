import Link from "next/link";
import { dismissedCount, missingDocuments, type MissingRow } from "@/lib/missing-room";
import { dismissMissingAction, restoreMissingAction } from "@/app/(app)/documents/actions";

/**
 * For founders and team: documents the room's own contents point to but which
 * have not been uploaded. `back` is the page to return to after "Not needed".
 */
/** How many to show before the rest fold away, so the list never buries the page beneath it. */
const FIRST = 5;

export function MissingDocs({ back, heading = "Still to upload" }: { back: string; heading?: string }) {
  const all = missingDocuments();
  const hidden = dismissedCount();
  if (all.length === 0 && hidden === 0) return null;
  const item = (m: MissingRow) => (
    <li key={m.key}>
      <div>
        <strong>{m.title}</strong>
        <div className="muted small">{m.why}</div>
      </div>
      <div className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
        <Link className="btn small" href={m.folderId ? `/documents?folder=${m.folderId}#upload` : "/documents"}>Upload{m.folderName ? ` to ${m.folderName}` : ""}</Link>
        <form action={dismissMissingAction}>
          <input type="hidden" name="key" value={m.key} />
          <input type="hidden" name="back" value={back} />
          <button className="linkbtn small nowrap" title="Hide this because it does not apply to your company">Not needed</button>
        </form>
      </div>
    </li>
  );
  return (
    <div className="card missing" id="missing">
      <h2>{heading}</h2>
      {all.length === 0 ? (
        <p className="muted">Every document the room refers to is here. Nicely done.</p>
      ) : (
        <>
          <p className="muted" style={{ maxWidth: "66ch", marginTop: -4 }}>
            The room mentions {all.length === 1 ? "something" : "things"} an investor will ask to see the paper for. {all.length === 1 ? "This is" : "These are"} not uploaded yet, as far as we can tell from the file names.
          </p>
          <ul className="missing-list">{all.slice(0, FIRST).map(item)}</ul>
          {all.length > FIRST && (
            <details className="missing-more">
              <summary>Show {all.length - FIRST} more</summary>
              <ul className="missing-list">{all.slice(FIRST).map(item)}</ul>
            </details>
          )}
          <p className="muted small" style={{ maxWidth: "66ch" }}>Already uploaded under a different name? Mark it not needed. This is a prompt based on common pre-seed diligence, not legal advice; your lawyer knows what your company actually needs.</p>
        </>
      )}
      {hidden > 0 && (
        <form action={restoreMissingAction} className="small muted">
          <input type="hidden" name="back" value={back} />
          {hidden} marked not needed. <button className="linkbtn small">Show {hidden === 1 ? "it" : "them"} again</button>
        </form>
      )}
    </div>
  );
}
