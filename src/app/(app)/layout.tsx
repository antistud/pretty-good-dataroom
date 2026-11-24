import Link from "next/link";
import { canSee, canSeeSection, requireUser } from "@/lib/auth";
import { getSetting, q } from "@/lib/db";
import { monthLabel, tierName } from "@/lib/format";
import { updateDue } from "@/lib/updates";
import { logoutAction } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const company = getSetting("company_name");
  const pages = q<{ slug: string; title: string; min_level: number }>("SELECT slug, title, min_level FROM pages ORDER BY position, id").filter((p) =>
    canSee(me, p.min_level),
  );
  const due = me.isStaff ? updateDue() : null;
  const show = (s: Parameters<typeof canSeeSection>[1]) => canSeeSection(me, s);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">{company}</div>
        <div className="brand-sub">{me.isStaff ? "Founder workspace" : me.role === "supporter" ? "Supporter updates" : "Investor data room"}</div>
        <nav>
          <Link href="/home">{me.isStaff ? "Today" : "Start here"}</Link>
          {me.isStaff && (
            <>
              <div className="nav-label">Fundraising</div>
              <Link href="/pipeline">Pipeline</Link>
              <Link href="/rounds">Rounds</Link>
              <Link href="/requests">Requests</Link>
              <Link href="/intros">Set Me Up</Link>
              <Link href="/updates">Investor updates</Link>
              <div className="nav-label">The room</div>
            </>
          )}
          {show("overview") && <Link href="/overview">Overview</Link>}
          {!me.isStaff && show("round") && <Link href="/round">The round</Link>}
          {show("team") && <Link href="/team">Team</Link>}
          {show("documents") && <Link href="/documents">Documents</Link>}
          {show("captable") && <Link href="/captable">Cap table &amp; SAFEs</Link>}
          {show("financials") && <Link href="/financials">Financials</Link>}
          {pages.map((p) => (
            <Link key={p.slug} href={`/p/${p.slug}`}>{p.title}</Link>
          ))}
          {!me.isStaff && (
            <>
              {show("updates") && <Link href="/updates">Updates</Link>}
              {show("requests") && <Link href="/requests">Ask or request</Link>}
              {show("intros") && <Link href="/intros">Set Me Up</Link>}
            </>
          )}
          {me.isStaff && (
            <>
              <div className="nav-label">Admin</div>
              <Link href="/people">People &amp; access</Link>
              <Link href="/activity">Activity</Link>
              {me.role === "founder" && <Link href="/settings">Settings</Link>}
            </>
          )}
        </nav>
        <div className="me">
          <div><strong>{me.name}</strong></div>
          <div className="muted">{me.orgName ? `${me.orgName} · ` : ""}{me.isStaff ? me.role : tierName(me.level)}</div>
          <div className="row" style={{ marginTop: 6 }}>
            <Link href="/account">Account</Link>
            <form action={logoutAction}><button className="linkbtn">Sign out</button></form>
          </div>
        </div>
      </aside>
      <div>
        {due && !due.published && due.daysUntilDue <= 5 && (
          <div className="banner">
            <span>
              {due.overdue
                ? `The ${monthLabel(due.period)} investor update is ${-due.daysUntilDue} day${due.daysUntilDue === -1 ? "" : "s"} overdue.`
                : due.daysUntilDue === 0
                  ? `The ${monthLabel(due.period)} investor update is due today.`
                  : `The ${monthLabel(due.period)} investor update is due in ${due.daysUntilDue} day${due.daysUntilDue === 1 ? "" : "s"}.`}
            </span>
            <Link className="btn small" href="/updates">{due.draftId ? "Finish the draft" : "Write it now"}</Link>
          </div>
        )}
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
