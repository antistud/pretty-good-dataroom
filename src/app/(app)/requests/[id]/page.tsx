import { ExportBar } from "@/components/Export";
import Link from "next/link";
import { humanDay } from "@/lib/pipeline";
import { redirect } from "next/navigation";
import { canSeeSection, requireUser } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { getDocument, visibleDocuments } from "@/lib/docs";
import { fmtDateTime, tierName } from "@/lib/format";
import { Field, Flash, Hint, PageHead } from "@/components/ui";
import { replyAction } from "../actions";

type Req = {
  id: number; org_id: number | null; kind: string; title: string; body: string | null; status: string; needed_by: string | null; created_at: string;
  asker: string | null; org_name: string | null; org_kind: string | null; org_tier: number | null;
};
type Msg = { id: number; body: string; document_id: number | null; created_at: string; author: string | null; author_role: string | null };

const KIND_LABEL: Record<string, string> = { question: "Question", document: "Document request", data: "Data request", call: "Call request" };
const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", fulfilled: "Fulfilled", declined: "Declined" };
const STATUS_BADGE: Record<string, string> = { open: "warn", in_progress: "", fulfilled: "ok", declined: "grey" };

export default async function RequestThread({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  const req = q1<Req>(
    `SELECT r.id, r.org_id, r.kind, r.title, r.body, r.status, r.needed_by, r.created_at, u.name AS asker,
            o.name AS org_name, o.kind AS org_kind, o.tier AS org_tier
       FROM requests r LEFT JOIN users u ON u.id = r.user_id LEFT JOIN orgs o ON o.id = r.org_id WHERE r.id = ?`,
    id,
  );
  // Investors can only open their own organisation's requests.
  if (!req || (!me.isStaff && (!me.orgId || req.org_id !== me.orgId))) redirect(canSeeSection(me, "requests") ? "/requests" : "/home");

  const messages = q<Msg>(
    `SELECT m.id, m.body, m.document_id, m.created_at, u.name AS author, u.role AS author_role
       FROM request_messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.request_id = ? ORDER BY m.created_at, m.id`,
    id,
  );
  const orgLevel = req.org_kind === "investor" ? Math.max(1, req.org_tier ?? 1) : 0;
  const docs = me.isStaff ? visibleDocuments(100) : [];

  return (
    <>
      <PageHead title={req.title} sub={<>{KIND_LABEL[req.kind]} from {req.asker ?? "someone"}{me.isStaff && req.org_name ? ` at ${req.org_name}` : ""} · {fmtDateTime(req.created_at)}{req.needed_by ? <strong> · needed {humanDay(req.needed_by)}</strong> : null}</>}>
          <ExportBar />
        <span className={`badge ${STATUS_BADGE[req.status]}`}>{STATUS_LABEL[req.status]}</span>
        <Link className="btn small" href="/requests">All requests</Link>
      </PageHead>
      <Flash sp={await searchParams} />

      {!me.isStaff && (
        <Hint>
          {req.status === "open" && "The founders have been notified. You will see their reply here."}
          {req.status === "in_progress" && "The founders are working on this."}
          {req.status === "fulfilled" && "The founders marked this as done. If it did not answer what you needed, reply below and it will re-open."}
          {req.status === "declined" && "The founders could not provide this. See their note below. Reply if you want to follow up."}
        </Hint>
      )}

      <div className="card">
        {req.body ? <p style={{ whiteSpace: "pre-wrap" }}>{req.body}</p> : <p className="muted">No extra details were given.</p>}
      </div>

      {messages.map((m) => {
        const fromStaff = m.author_role === "founder" || m.author_role === "team";
        const doc = m.document_id ? getDocument(m.document_id) : undefined;
        const canOpen = doc && doc.effective_level <= me.level;
        return (
          <div className="card" key={m.id} style={fromStaff ? { borderLeft: "3px solid var(--brand)" } : undefined}>
            <div className="spread small muted" style={{ marginBottom: 6 }}>
              <span><strong style={{ color: "var(--ink)" }}>{m.author ?? "Removed user"}</strong>{fromStaff ? " · founder team" : ""}</span>
              <span>{fmtDateTime(m.created_at)}</span>
            </div>
            <p style={{ whiteSpace: "pre-wrap" }}>{m.body}</p>
            {m.document_id && (
              canOpen ? (
                <p><Link className="btn small" href={`/documents/${doc!.id}`}>Open document: {doc!.name}</Link></p>
              ) : me.isStaff ? (
                <p className="muted small">Attached document no longer exists.</p>
              ) : (
                <p className="muted small">A document was attached that your access level does not include yet. Ask the founders to open it up for you.</p>
              )
            )}
            {me.isStaff && doc && doc.effective_level > orgLevel && (
              <div className="notice warn small" style={{ marginBottom: 0 }}>
                {req.org_name ?? "This firm"} is on {tierName(orgLevel)} access and cannot open “{doc.name}”. Raise their tier in People &amp; access, or lower the document&apos;s audience.
              </div>
            )}
          </div>
        );
      })}

      <div className="card">
        <h2>{me.isStaff ? "Reply" : "Add a reply"}</h2>
        <form action={replyAction}>
          <input type="hidden" name="request_id" value={req.id} />
          <Field label="Message"><textarea name="body" maxLength={5000} required={!me.isStaff} /></Field>
          {me.isStaff && (
            <div className="grid2">
              <Field label="Attach a document from the room (optional)" hint={`${req.org_name ?? "This firm"} is on ${tierName(orgLevel)} access. Documents marked “locked” are above that and will not open for them.`}>
                <select name="document_id" defaultValue="">
                  <option value="">No attachment</option>
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}{d.effective_level > orgLevel ? " (locked for this firm)" : ""}</option>
                  ))}
                </select>
              </Field>
              <Field label="Status after this reply">
                <select name="status" defaultValue={req.status}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
          )}
          <button className="btn primary">{me.isStaff ? "Send reply" : "Post reply"}</button>
        </form>
      </div>
    </>
  );
}
