import Link from "next/link";
import { Welcome } from "@/components/Garden";
import type { Viewer } from "@/lib/auth";
import { canSeeSection } from "@/lib/auth";
import { getSetting, q } from "@/lib/db";
import { visibleDocuments } from "@/lib/docs";
import { ago, fmtDate, monthLabel, parseDate } from "@/lib/format";
import { onboardingSteps, visibleUpdates } from "@/lib/onboarding";
import { Hint } from "@/components/ui";
import { markStepAction } from "@/app/(app)/home/actions";

const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress" };

export default async function InvestorHome({ me }: { me: Viewer }) {
  const company = getSetting("company_name");
  const steps = onboardingSteps(me);
  const required = steps.filter((s) => !s.optional);
  const doneCount = steps.filter((s) => s.done).length;
  const next = required.find((s) => !s.done) ?? steps.find((s) => !s.done);
  const allDone = required.every((s) => s.done);
  const pctDone = steps.length ? Math.round((doneCount / steps.length) * 100) : 100;

  const updates = canSeeSection(me, "updates") ? visibleUpdates(me.level, 1) : [];
  const requests =
    me.orgId && canSeeSection(me, "requests")
      ? q<{ id: number; title: string; status: string; updated_at: string; asker: string | null }>(
          `SELECT r.id, r.title, r.status, r.updated_at, u.name AS asker FROM requests r LEFT JOIN users u ON u.id = r.user_id
            WHERE r.org_id = ? AND r.status IN ('open','in_progress') ORDER BY r.updated_at DESC`,
          me.orgId,
        )
      : [];
  const cutoff = Date.now() - 14 * 86400_000;
  const newDocs = canSeeSection(me, "documents")
    ? visibleDocuments(me.level)
        .filter((d) => d.current_version_id && parseDate(d.version_created_at ?? d.created_at).getTime() > cutoff)
        .sort((a, b) => (b.version_created_at ?? b.created_at).localeCompare(a.version_created_at ?? a.created_at))
        .slice(0, 8)
    : [];

  return (
    <>
      <Welcome title={`Welcome, ${me.name.split(" ")[0]}`} stage={Math.round((pctDone / 100) * 4)}>
        This is {company}&apos;s data room{me.orgName ? <> for <strong>{me.orgName}</strong></> : null}: everything you need to evaluate the company, in the order we suggest you read it.
      </Welcome>

      <div className="card">
        {allDone ? (
          <>
            <h2>You&apos;re all caught up</h2>
            <p className="muted">You have been through everything. Here is what is new since you last looked, further down this page. If something is missing, ask for it.</p>
            <div className="row">
              {canSeeSection(me, "requests") && <Link className="btn primary" href="/requests">Ask or request something</Link>}
              {canSeeSection(me, "intros") && <Link className="btn" href="/intros">Make an introduction</Link>}
            </div>
          </>
        ) : (
          <>
            <div className="spread">
              <h2 style={{ margin: 0 }}>Start here</h2>
              <span className="muted small">{doneCount} of {steps.length} done</span>
            </div>
            <p className="muted" style={{ marginTop: 6 }}>Follow these steps top to bottom. Each one ticks itself off when you have done it. Most people finish in about 20 minutes.</p>
            {next && <p><Link className="btn primary big" href={next.href}>Next: {next.title} →</Link></p>}
          </>
        )}
        <div className="progress" style={{ margin: "12px 0" }}><div style={{ width: `${pctDone}%` }} /></div>
        <ol className="steps">
          {steps.map((s) => (
            <li key={s.key} className={s.done ? "done" : s === next ? "next" : ""}>
              <span className="tick">✓</span>
              <div className="step-body">
                <div className="step-title">{s.title}{s.optional ? <span className="muted small" style={{ fontWeight: 400 }}> · optional</span> : null}</div>
                <div className="muted small">{s.body}</div>
              </div>
              <div className="row nowrap">
                <Link className={`btn small ${s === next ? "primary" : ""}`} href={s.href}>{s.done ? "Open again" : s.cta}</Link>
                {!s.done && (
                  <form action={markStepAction}>
                    <input type="hidden" name="key" value={s.key} />
                    <button className="linkbtn small">Mark done</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Latest update</h2>
          {updates.length === 0 ? (
            <p className="muted">No updates published yet. The founders send one every month; you will get an email when it is out.</p>
          ) : (
            <>
              <p><Link href={`/updates/${updates[0].id}`}><strong>{updates[0].title}</strong></Link></p>
              <p className="muted small">{monthLabel(updates[0].period)} · published {fmtDate(updates[0].published_at)}</p>
              <Link className="btn small" href="/updates">All updates</Link>
            </>
          )}
        </div>
        <div className="card">
          <h2>Your open requests</h2>
          {requests.length === 0 ? (
            <p className="muted">Nothing open. {canSeeSection(me, "requests") ? <Link href="/requests">Ask a question or request a document</Link> : null}</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/requests/${r.id}`}>{r.title}</Link>{" "}
                  <span className={`badge ${r.status === "open" ? "warn" : ""}`}>{STATUS_LABEL[r.status]}</span>
                  <div className="muted small">{r.asker ?? "—"} · {ago(r.updated_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {canSeeSection(me, "documents") && (
        <div className="card">
          <h2>New in the last 14 days</h2>
          {newDocs.length === 0 ? (
            <p className="muted">No new documents. You will get an email when the founders add something.</p>
          ) : (
            <div className="table-wrap"><table className="table"><tbody>
              {newDocs.map((d) => (
                <tr key={d.id}>
                  <td><Link href={`/documents/${d.id}`}>{d.name}</Link></td>
                  <td className="small muted right">added {ago(d.version_created_at ?? d.created_at)}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </div>
      )}

      <div className="card">
        <details>
          <summary>New to startup investing? The five terms you will see here</summary>
          <Hint>
            <p><strong>SAFE.</strong> A Simple Agreement for Future Equity. You invest money now and receive shares later, when the company raises a priced round. There is no interest and no repayment date.</p>
            <p><strong>Valuation cap.</strong> The highest company valuation at which your SAFE converts into shares. With a post-money cap, your ownership is simply your investment divided by the cap: $100,000 on a $5M cap is 2%.</p>
            <p><strong>Discount.</strong> A percentage off the next round&apos;s share price. If a SAFE has both a cap and a discount, you get whichever gives you more shares.</p>
            <p><strong>Pro rata.</strong> The right to invest more in a later round so that your ownership percentage does not shrink.</p>
            <p style={{ marginBottom: 0 }}><strong>Fully diluted.</strong> Ownership counted as if every option, SAFE and reserved share had already become stock. It is the honest way to read a cap table.</p>
          </Hint>
        </details>
      </div>
    </>
  );
}
