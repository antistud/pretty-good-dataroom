import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { q } from "@/lib/db";
import { ago } from "@/lib/format";
import { humanDay } from "@/lib/pipeline";
import { Field, Flash, Hint, PageHead } from "@/components/ui";
import { createRequestAction, setRequestStatusAction } from "./actions";

type Row = {
  id: number; org_id: number | null; kind: string; title: string; status: string; needed_by: string | null; created_at: string; updated_at: string;
  asker: string | null; org_name: string | null; replies: number;
};

const KIND_LABEL: Record<string, string> = { question: "Question", document: "Document", data: "Data", call: "Call" };
const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", fulfilled: "Fulfilled", declined: "Declined" };
const STATUS_BADGE: Record<string, string> = { open: "warn", in_progress: "", fulfilled: "ok", declined: "grey" };

const SELECT = `SELECT r.id, r.org_id, r.kind, r.title, r.status, r.needed_by, r.created_at, r.updated_at, u.name AS asker, o.name AS org_name,
  (SELECT COUNT(*) FROM request_messages m WHERE m.request_id = r.id) AS replies
  FROM requests r LEFT JOIN users u ON u.id = r.user_id LEFT JOIN orgs o ON o.id = r.org_id`;

export default async function Requests({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireSection("requests");
  const sp = await searchParams;

  if (!me.isStaff) {
    const rows = me.orgId ? q<Row>(`${SELECT} WHERE r.org_id = ? ORDER BY r.updated_at DESC`, me.orgId) : [];
    return (
      <>
        <PageHead title="Ask or request" sub="Anything you need from the founders, in one place." />
        <Flash sp={sp} />
        <Hint title="How this works">
          Can&apos;t find something, or want to dig deeper? Send it here instead of by email. The founders are notified, you can follow the status,
          and everyone at {me.orgName ?? "your firm"} sees the same list, so nobody asks twice.
        </Hint>
        <div className="card">
          <h2>Ask a question or request something</h2>
          <form action={createRequestAction}>
            <div className="grid2">
              <Field label="What do you need?">
                <select name="kind" defaultValue="question">
                  <option value="question">An answer to a question</option>
                  <option value="document">A document</option>
                  <option value="data">A number or piece of data</option>
                  <option value="call">A call with the founders</option>
                </select>
              </Field>
              <Field label="In one line"><input name="title" required maxLength={200} placeholder="e.g. Customer contract with your first pilot" /></Field>
            </div>
            <Field label="When do you need it by? (optional)" hint="So the founders can get it to you in time."><input type="date" name="needed_by" /></Field>
            <Field label="Details (optional)" hint="The more specific you are, the faster you get exactly what you need."><textarea name="body" maxLength={5000} /></Field>
            <button className="btn primary">Send to the founders</button>
          </form>
        </div>
        <div className="card">
          <h2>Requests from {me.orgName ?? "your firm"}</h2>
          {rows.length === 0 ? (
            <div className="empty">Nothing yet. When you or a colleague sends a request, it shows up here with its status.</div>
          ) : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Request</th><th>Asked by</th><th>Status</th><th>Last activity</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/requests/${r.id}`}><strong>{r.title}</strong></Link><div className="muted small">{KIND_LABEL[r.kind]} · {r.replies} {r.replies === 1 ? "reply" : "replies"}</div></td>
                    <td className="small">{r.asker ?? "—"}</td>
                    <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td className="small muted">{ago(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </>
    );
  }

  // Staff inbox
  const orgFilter = Number(sp.org) || 0;
  const orgs = q<{ id: number; name: string }>("SELECT DISTINCT o.id, o.name FROM orgs o JOIN requests r ON r.org_id = o.id ORDER BY o.name");
  const rows = orgFilter ? q<Row>(`${SELECT} WHERE r.org_id = ? ORDER BY r.needed_by IS NULL, r.needed_by, r.created_at`, orgFilter) : q<Row>(`${SELECT} ORDER BY r.needed_by IS NULL, r.needed_by, r.created_at`);
  const by = (s: string) => rows.filter((r) => r.status === s);
  const closed = rows.filter((r) => r.status === "fulfilled" || r.status === "declined").reverse();

  const table = (list: Row[], next: { status: string; label: string }[]) => (
    <div className="table-wrap"><table className="table">
      <thead><tr><th>Request</th><th>From</th><th>Waiting</th><th></th></tr></thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.id}>
            <td><Link href={`/requests/${r.id}`}><strong>{r.title}</strong></Link><div className="muted small">{KIND_LABEL[r.kind]} · {r.replies} {r.replies === 1 ? "reply" : "replies"}</div></td>
            <td className="small"><strong>{r.org_name ?? "—"}</strong><div className="muted">{r.asker ?? "—"}</div></td>
            <td className="small muted nowrap">{r.status === "fulfilled" || r.status === "declined" ? <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span> : `${r.needed_by && r.status !== "fulfilled" && r.status !== "declined" ? `needed ${humanDay(r.needed_by)} · ` : ""}asked ${ago(r.created_at)}`}</td>
            <td className="right nowrap">
              <div className="row" style={{ justifyContent: "flex-end" }}>
                {next.map((n) => (
                  <form action={setRequestStatusAction} key={n.status}>
                    <input type="hidden" name="request_id" value={r.id} />
                    <input type="hidden" name="status" value={n.status} />
                    <input type="hidden" name="back" value="inbox" />
                    <button className="btn small">{n.label}</button>
                  </form>
                ))}
                <Link className="btn small primary" href={`/requests/${r.id}`}>Reply</Link>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );

  return (
    <>
      <PageHead title="Requests" sub="Everything investors have asked for. Answer fast: response time is one of the things they are judging.">
        {orgs.length > 0 && (
          <form className="row" action="/requests">
            <select name="org" defaultValue={String(orgFilter)} style={{ width: "auto" }}>
              <option value="0">All firms</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button className="btn small">Filter</button>
          </form>
        )}
      </PageHead>
      <Flash sp={sp} />
      <Hint title="What to do here">
        Work top to bottom. Open a request, reply (attach a document from the room if that answers it), then mark it fulfilled.
        If you need time, mark it in progress so the investor knows you have seen it. Aim to answer within one working day.
      </Hint>
      <div className="card">
        <h2>Open <span className="badge warn">{by("open").length}</span></h2>
        {by("open").length === 0 ? <div className="empty">Nothing waiting on you.</div> : table(by("open"), [{ status: "in_progress", label: "Start" }, { status: "fulfilled", label: "Fulfilled" }])}
      </div>
      <div className="card">
        <h2>In progress <span className="badge">{by("in_progress").length}</span></h2>
        {by("in_progress").length === 0 ? <div className="empty">Nothing in progress.</div> : table(by("in_progress"), [{ status: "fulfilled", label: "Fulfilled" }, { status: "declined", label: "Decline" }])}
      </div>
      {closed.length > 0 && (
        <div className="card">
          <details>
            <summary>Fulfilled and declined ({closed.length})</summary>
            {table(closed, [{ status: "open", label: "Re-open" }])}
          </details>
        </div>
      )}
    </>
  );
}
