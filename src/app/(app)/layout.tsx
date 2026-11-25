import Link from "next/link";
import { Suspense } from "react";
import { NavLink } from "@/components/NavLink";
import { Palette, type PaletteItem } from "@/components/Palette";
import { Cheer } from "@/components/Cheer";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { Chrome, type Tab } from "@/components/Chrome";
import { unreadCount } from "@/lib/notify";
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

  const jump: PaletteItem[] = [
    { label: me.isStaff ? "Today" : "Start here", href: "/home", kind: "Go to" },
    ...(me.isStaff
      ? [
          { label: "Founder guide", href: "/guide", kind: "Go to" },
          { label: "Pipeline", href: "/pipeline", kind: "Go to" },
          { label: "Rounds", href: "/rounds", kind: "Go to" },
          { label: "People & access", href: "/people", kind: "Go to" },
          { label: "Activity", href: "/activity", kind: "Go to" },
        ]
      : []),
    ...(show("overview") ? [{ label: "Overview", href: "/overview", kind: "Go to" }] : []),
    ...(!me.isStaff && show("round") ? [{ label: "The round", href: "/round", kind: "Go to" }] : []),
    ...(show("team") ? [{ label: "Team", href: "/team", kind: "Go to" }] : []),
    ...(show("documents") ? [{ label: "Documents", href: "/documents", kind: "Go to" }] : []),
    ...(show("captable") ? [{ label: "Cap table & SAFEs", href: "/captable", kind: "Go to" }] : []),
    ...(show("financials") ? [{ label: "Financials", href: "/financials", kind: "Go to" }] : []),
    ...(show("updates") ? [{ label: me.isStaff ? "Investor updates" : "Updates", href: "/updates", kind: "Go to" }] : []),
    ...(show("requests") ? [{ label: me.isStaff ? "Requests" : "Ask or request", href: "/requests", kind: "Go to" }] : []),
    ...(show("intros") ? [{ label: "Set Me Up", href: "/intros", kind: "Go to" }] : []),
    ...(me.role === "founder" ? [{ label: "Settings", href: "/settings", kind: "Go to" }] : []),
    { label: "What's new", href: "/notifications", kind: "Go to" },
    { label: "Account", href: "/account", kind: "Go to" },
  ];

  const unread = unreadCount(me.id);
  const tabs: Tab[] = me.isStaff
    ? [
        { label: "Today", href: "/home", icon: "home" },
        { label: "Pipeline", href: "/pipeline", icon: "people" },
        { label: "Requests", href: "/requests", icon: "chat" },
        { label: "Updates", href: "/updates", icon: "mail" },
      ]
    : [
        { label: "Start", href: "/home", icon: "home" },
        ...(show("documents") ? [{ label: "Documents", href: "/documents", icon: "doc" } as Tab] : []),
        ...(show("updates") ? [{ label: "Updates", href: "/updates", icon: "mail" } as Tab] : []),
        ...(show("requests") ? [{ label: "Ask", href: "/requests", icon: "chat" } as Tab] : show("intros") ? [{ label: "Help", href: "/intros", icon: "people" } as Tab] : []),
      ];

  return (
    <div className="shell">
      <Suspense fallback={null}><Cheer /></Suspense>
      <Suspense fallback={null}><Chrome tabs={tabs} unread={unread} /></Suspense>
      <header className="topbar">
        <Link href="/home">{company}</Link>
        <Link href="/notifications" aria-label={`What's new${unread ? `, ${unread} unread` : ""}`} style={{ fontFamily: "var(--sans)", fontSize: 14 }}>
          {unread > 0 ? <span className="count">{unread}</span> : <span className="muted">What&apos;s new</span>}
        </Link>
      </header>
      <aside className="side">
        <div className="brand">{company}</div>
        <div className="brand-sub">{me.isStaff ? "Founder workspace" : me.role === "supporter" ? "Supporter updates" : "Investor data room"}</div>
        <Palette nav={jump} />
        <nav>
          <NavLink href="/home">{me.isStaff ? "Today" : "Start here"}</NavLink>
          <NavLink href="/notifications"><span className="bell" style={{ flex: 1 }}>What&apos;s new {unread > 0 && <span className="count">{unread}</span>}</span></NavLink>
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
          <ThemeSwitch />
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
