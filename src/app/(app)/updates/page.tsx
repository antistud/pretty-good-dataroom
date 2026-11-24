import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { q } from "@/lib/db";
import { fmtDate, monthLabel } from "@/lib/format";
import { Field, Flash, Hint, PageHead } from "@/components/ui";
import { mailEnabled } from "@/lib/mail";
import { updateDue, type UpdateRow } from "@/lib/updates";
import { createUpdateAction } from "./actions";

export default async function Updates({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireSection("updates");
  const sp = await searchParams;

  if (!me.isStaff) {
    const updates = q<UpdateRow>(
      `SELECT u.id, u.period, u.title, u.status, u.published_at, u.created_at FROM updates u
        WHERE u.status = 'published' AND EXISTS (SELECT 1 FROM update_sections s WHERE s.update_id = u.id AND s.min_level <= ?)
        ORDER BY u.period DESC`,
      me.level,
    );
    return (
      <>
        <PageHead title="Updates" sub="A short note from the founders every month: what went well, what did not, and where you can help." />
        <Flash sp={sp} />
        <Hint title="What to do here">Open the newest update first. At the bottom of each one is a short list of people the founders would like to meet. If you know one of them, that is the most useful thing you can do.</Hint>
        {updates.length === 0 ? (
          <div className="empty">No updates have been published yet. You will get an email when the first one is out.</div>
        ) : (
          <div className="card">
            <table className="table"><tbody>
              {updates.map((u, i) => (
                <tr key={u.id}>
                  <td><Link href={`/updates/${u.id}`}><strong>{u.title}</strong></Link> {i === 0 && <span className="badge ok">Newest</span>}</td>
                  <td className="muted small right">Published {fmtDate(u.published_at)}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}
      </>
    );
  }

  const due = updateDue();
  const updates = q<UpdateRow>("SELECT id, period, title, status, published_at, created_at FROM updates ORDER BY period DESC");
  const dueText = due.published
    ? `The ${monthLabel(due.period)} update is published. Nothing to do until next month.`
    : due.overdue
      ? `The ${monthLabel(due.period)} update is ${-due.daysUntilDue} day${due.daysUntilDue === -1 ? "" : "s"} overdue.`
      : due.daysUntilDue === 0
        ? `The ${monthLabel(due.period)} update is due today.`
        : `The ${monthLabel(due.period)} update is due in ${due.daysUntilDue} day${due.daysUntilDue === 1 ? "" : "s"} (${fmtDate(due.dueDate.toISOString())}).`;

  return (
    <>
      <PageHead title="Investor updates" sub="One update a month. You write it once; each reader gets only the sections their access allows." />
      <Flash sp={sp} />

      <div className="card">
        <div className="spread">
          <div>
            <h2 style={{ marginBottom: 4 }}>{due.published ? "You are up to date" : "This month's update"}</h2>
            <div className={due.overdue ? "" : "muted"}>
              {due.overdue && <span className="badge bad">Overdue</span>} {dueText}
            </div>
          </div>
          {!due.published &&
            (due.draftId ? (
              <Link className="btn primary big" href={`/updates/${due.draftId}`}>Finish the draft</Link>
            ) : (
              <form action={createUpdateAction}>
                <input type="hidden" name="period" value={due.period} />
                <button className="btn primary big">Start the {monthLabel(due.period)} update</button>
              </form>
            ))}
        </div>
      </div>

      <Hint title="How this works">
        <ol style={{ margin: "4px 0 0", paddingLeft: 20 }}>
          <li>Press the button above. A draft appears with the usual sections, and cash and runway are filled in from your Financials page.</li>
          <li>Write two or three bullet points per section. Fifteen minutes is enough; a short honest update beats a late polished one.</li>
          <li>Check who sees each section, preview it as a supporter and as an investor, then publish.</li>
        </ol>
        {!mailEnabled() && <p style={{ marginTop: 8 }}><strong>Email is not set up</strong>, so publishing will not email anyone and you will not get reminder emails. Readers see updates when they sign in. Set the SMTP values in your .env file to turn email on.</p>}
      </Hint>

      <div className="card">
        <h2>All updates</h2>
        {updates.length === 0 ? (
          <div className="empty">Nothing yet. Start your first update above.</div>
        ) : (
          <table className="table"><tbody>
            {updates.map((u) => (
              <tr key={u.id}>
                <td><Link href={`/updates/${u.id}`}><strong>{u.title}</strong></Link><div className="muted small">Covers {monthLabel(u.period)}</div></td>
                <td>{u.status === "published" ? <span className="badge ok">Published</span> : <span className="badge warn">Draft</span>}</td>
                <td className="muted small right">{u.status === "published" ? `Published ${fmtDate(u.published_at)}` : `Started ${fmtDate(u.created_at)}`}</td>
              </tr>
            ))}
          </tbody></table>
        )}
        <details style={{ marginTop: 14 }}>
          <summary>Start an update for a different month</summary>
          <form action={createUpdateAction} className="inline-form">
            <Field label="Month the update covers"><input type="month" name="period" required defaultValue={due.period} /></Field>
            <button className="btn">Create draft</button>
          </form>
        </details>
      </div>
    </>
  );
}
