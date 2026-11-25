import Link from "next/link";
import { FounderNote } from "@/components/FounderNote";
import type { Viewer } from "@/lib/auth";
import { canSeeSection } from "@/lib/auth";
import { q } from "@/lib/db";
import { visibleDocuments, visibleFolders } from "@/lib/docs";
import { ago, fmtDate, monthLabel, parseDate } from "@/lib/format";
import { visibleUpdates } from "@/lib/onboarding";
import { humanDay } from "@/lib/pipeline";
import { Field } from "@/components/ui";
import { RaiseProgress } from "@/components/rounds";
import { roundTotals } from "@/lib/rounds";
import { createRequestAction } from "@/app/(app)/requests/actions";

const STATUS_LABEL: Record<string, string> = { open: "With the founders", in_progress: "Being worked on" };

/**
 * An investor's home. No tasks and no progress tracking: it says what is
 * here, and asks what they need and by when.
 */
export default async function InvestorHome({ me }: { me: Viewer }) {
  const see = (s: Parameters<typeof canSeeSection>[1]) => canSeeSection(me, s);
  const momentum = see("round")
    ? q<{ id: number; name: string; status: string; target_amount: number }>(
        "SELECT id, name, status, target_amount FROM rounds WHERE status IN ('open','closing') AND min_level <= ? ORDER BY id DESC LIMIT 1",
        me.level,
      )[0]
    : undefined;
  const updates = see("updates") ? visibleUpdates(me.level, 1) : [];
  const requests =
    me.orgId && see("requests")
      ? q<{ id: number; title: string; status: string; needed_by: string | null; updated_at: string; asker: string | null }>(
          `SELECT r.id, r.title, r.status, r.needed_by, r.updated_at, u.name AS asker FROM requests r LEFT JOIN users u ON u.id = r.user_id
            WHERE r.org_id = ? AND r.status IN ('open','in_progress') ORDER BY r.updated_at DESC`,
          me.orgId,
        )
      : [];
  const docs = see("documents") ? visibleDocuments(me.level).filter((d) => d.current_version_id) : [];
  const pitchFolder = see("documents") ? visibleFolders(me.level).find((f) => /pitch|deck/i.test(f.name)) : undefined;
  const deck = pitchFolder ? docs.filter((d) => d.folder_id === pitchFolder.id) : [];
  const cutoff = Date.now() - 14 * 86400_000;
  const newDocs = docs
    .filter((d) => parseDate(d.version_created_at ?? d.created_at).getTime() > cutoff)
    .sort((a, b) => (b.version_created_at ?? b.created_at).localeCompare(a.version_created_at ?? a.created_at))
    .slice(0, 8);

  const here: { label: string; href: string; note: string }[] = [
    ...(see("overview") ? [{ label: "Overview", href: "/overview", note: "What the company does and where it is today" }] : []),
    ...(deck.length === 1 ? [{ label: "The deck", href: `/documents/${deck[0].id}`, note: deck[0].name }] : []),
    ...(see("round") ? [{ label: "The round", href: "/round", note: "Amount, terms and how much is committed" }] : []),
    ...(see("team") ? [{ label: "Team", href: "/team", note: "Who is building it" }] : []),
    ...(see("captable") ? [{ label: "Cap table and SAFEs", href: "/captable", note: "Ownership today and after a priced round" }] : []),
    ...(see("financials") ? [{ label: "Financials", href: "/financials", note: "Cash, burn and runway by month" }] : []),
    ...(see("documents") ? [{ label: "Documents", href: "/documents", note: `${docs.length} file${docs.length === 1 ? "" : "s"} you can open` }] : []),
    ...(see("updates") ? [{ label: "Monthly updates", href: "/updates", note: "What the founders have reported" }] : []),
  ];

  return (
    <>
      <FounderNote kind="investor" firstName={me.name.split(" ")[0]} />

      {see("requests") && me.orgId && (
        <div className="card">
          <h2>What do you need from us?</h2>
          <p className="muted" style={{ marginTop: -4, maxWidth: "62ch" }}>A document, a number, a call, an answer. Tell us what and when you need it by, and we will work to your timing.</p>
          <form action={createRequestAction}>
            <div className="grid2">
              <Field label="What you need"><input name="title" required maxLength={200} placeholder="e.g. Customer references, or a call with the CTO" /></Field>
              <div className="grid2" style={{ gap: "0 14px", marginBottom: 0 }}>
                <Field label="It is">
                  <select name="kind" defaultValue="document">
                    <option value="document">A document</option>
                    <option value="data">Some data</option>
                    <option value="call">A call</option>
                    <option value="question">A question</option>
                  </select>
                </Field>
                <Field label="Needed by"><input type="date" name="needed_by" /></Field>
              </div>
            </div>
            <button className="btn primary">Send to the founders</button>
          </form>
          {requests.length > 0 && (
            <ul className="quiet-list" style={{ marginTop: 18 }}>
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/requests/${r.id}`}>{r.title}</Link>{" "}
                  <span className="muted small">
                    · {STATUS_LABEL[r.status]}{r.needed_by ? ` · you asked for it ${humanDay(r.needed_by)}` : ""}{r.asker && r.asker !== me.name ? ` · from ${r.asker}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card">
        <h2>What is here</h2>
        <ul className="quiet-list">
          {here.map((h) => (
            <li key={h.href}><Link href={h.href}>{h.label}</Link> <span className="muted">· {h.note}</span></li>
          ))}
        </ul>
        {see("requests") && <p className="muted" style={{ marginTop: 10 }}>If something you would expect to see is not here, ask above and we will add it.</p>}
      </div>

      {momentum && (
        <div className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>{momentum.name} <span className="badge">{momentum.status === "closing" ? "closing soon" : "open now"}</span></h2>
            <Link className="btn small" href="/round">See the terms</Link>
          </div>
          <div style={{ marginTop: 12 }}><RaiseProgress totals={roundTotals(momentum.id)} target={momentum.target_amount} /></div>
        </div>
      )}

      {(updates.length > 0 || newDocs.length > 0) && (
        <div className="card">
          <h2>Recently added</h2>
          <ul className="quiet-list">
            {updates.map((u) => (
              <li key={`u${u.id}`}><Link href={`/updates/${u.id}`}>{u.title}</Link> <span className="muted small">· update for {monthLabel(u.period)}, published {fmtDate(u.published_at)}</span></li>
            ))}
            {newDocs.map((d) => (
              <li key={d.id}><Link href={`/documents/${d.id}`}>{d.name}</Link> <span className="muted small">· added {ago(d.version_created_at ?? d.created_at)}</span></li>
            ))}
          </ul>
        </div>
      )}

      {me.orgId && (
        <p className="muted">Looking at this with colleagues? <Link href="/account">Add them</Link> and they will see what you see.</p>
      )}

      <details className="card">
        <summary>Terms used in this room</summary>
          <div>
            <p><strong>SAFE.</strong> A Simple Agreement for Future Equity. You invest money now and receive shares later, when the company raises a priced round. There is no interest and no repayment date.</p>
            <p><strong>Valuation cap.</strong> The highest company valuation at which your SAFE converts into shares. With a post-money cap, your ownership is simply your investment divided by the cap: $100,000 on a $5M cap is 2%.</p>
            <p><strong>Discount.</strong> A percentage off the next round&apos;s share price. If a SAFE has both a cap and a discount, you get whichever gives you more shares.</p>
            <p><strong>Pro rata.</strong> The right to invest more in a later round so that your ownership percentage does not shrink.</p>
            <p style={{ marginBottom: 0 }}><strong>Fully diluted.</strong> Ownership counted as if every option, SAFE and reserved share had already become stock. It is the honest way to read a cap table.</p>
          </div>
      </details>
    </>
  );
}
