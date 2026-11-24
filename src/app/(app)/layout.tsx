import Link from "next/link";
import { NavLink } from "@/components/NavLink";
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
          <NavLink href="/home">{me.isStaff ? "Today" : "Start here"}</NavLink>
          {me.isStaff && (
            <>
              <NavLink href="/guide">Founder guide</NavLink>
              <div className="nav-label">Fundraising</div>
              <NavLink href="/pipeline">Pipeline</NavLink>
              <NavLink href="/rounds">Rounds</NavLink>
              <NavLink href="/requests">Requests</NavLink>
              <NavLink href="/intros">Set Me Up</NavLink>
              <NavLink href="/updates">Investor updates</NavLink>
              <div className="nav-label">The room</div>
            </>
          )}
          {show("overview") && <NavLink href="/overview">Overview</NavLink>}
          {!me.isStaff && show("round") && <NavLink href="/round">The round</NavLink>}
          {show("team") && <NavLink href="/team">Team</NavLink>}
          {show("documents") && <NavLink href="/documents">Documents</NavLink>}
          {show("captable") && <NavLink href="/captable">Cap table &amp; SAFEs</NavLink>}
          {show("financials") && <NavLink href="/financials">Financials</NavLink>}
          {pages.map((p) => (
            <NavLink key={p.slug} href={`/p/${p.slug}`}>{p.title}</NavLink>
          ))}
          {!me.isStaff && (
            <>
              {show("updates") && <NavLink href="/updates">Updates</NavLink>}
              {show("requests") && <NavLink href="/requests">Ask or request</NavLink>}
              {show("intros") && <NavLink href="/intros">Set Me Up</NavLink>}
            </>
          )}
          {me.isStaff && (
            <>
              <div className="nav-label">Admin</div>
              <NavLink href="/people">People &amp; access</NavLink>
              <NavLink href="/activity">Activity</NavLink>
              {me.role === "founder" && <NavLink href="/settings">Settings</NavLink>}
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
