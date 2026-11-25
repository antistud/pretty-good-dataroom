import Link from "next/link";
import { Suspense } from "react";
import { FullMenu, PrimaryNav, SubNav, type NavGroup, type NavItem } from "@/components/Nav";
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

/** Makes text safe inside a CSS string: nothing can close the quote or the style block. */
function cssString(text: string): string {
  return text.replace(/[^\w .,@()·:\-]/g, (c) => `\\${c.codePointAt(0)!.toString(16)} `);
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const company = getSetting("company_name");
  const logoKey = getSetting("logo_key");
  const pages = q<{ slug: string; title: string; min_level: number }>("SELECT slug, title, min_level FROM pages ORDER BY position, id").filter((p) =>
    canSee(me, p.min_level),
  );
  const due = me.isStaff ? updateDue() : null;
  const show = (s: Parameters<typeof canSeeSection>[1]) => canSeeSection(me, s);

  const on = <T,>(cond: boolean, value: T): T[] => (cond ? [value] : []);
  const custom: NavItem[] = pages.map((p) => ({ label: p.title, href: `/p/${p.slug}` }));

  // The whole map of the app, in one place. Groups with nothing visible to this person are dropped.
  const groups: NavGroup[] = (
    me.isStaff
      ? [
          { key: "today", label: "Today", items: [{ label: "Today", href: "/home" }, { label: "Founder guide", href: "/guide" }] },
          {
            key: "fundraising",
            label: "Fundraising",
            items: [
              { label: "Investors", href: "/pipeline" },
              { label: "Rounds", href: "/rounds" },
              { label: "Requests", href: "/requests" },
              { label: "Introductions", href: "/intros" },
            ],
          },
          {
            key: "room",
            label: "The room",
            items: [
              ...on(show("overview"), { label: "Overview", href: "/overview" }),
              ...on(show("team"), { label: "Team", href: "/team" }),
              ...on(show("documents"), { label: "Documents", href: "/documents" }),
              ...on(show("captable"), { label: "Cap table", href: "/captable" }),
              ...on(show("financials"), { label: "Financials", href: "/financials" }),
              ...custom,
              { label: "From your documents", href: "/fill" },
            ],
          },
          { key: "updates", label: "Updates", items: [{ label: "Updates", href: "/updates" }] },
          // Everyone who can get in (investors, supporters, your own team) and what they have done.
          { key: "people", label: "People", items: [{ label: "Access", href: "/people" }, { label: "Activity", href: "/activity" }] },
        ]
      : [
          { key: "home", label: "Home", items: [{ label: "Home", href: "/home" }] },
          {
            key: "company",
            label: "The company",
            items: [
              ...on(show("overview"), { label: "Overview", href: "/overview" }),
              ...on(show("round"), { label: "The round", href: "/round" }),
              ...on(show("team"), { label: "Team", href: "/team" }),
              ...custom,
            ],
          },
          {
            key: "numbers",
            label: show("captable") && show("financials") ? "The numbers" : show("captable") ? "Cap table" : "Financials",
            items: [...on(show("captable"), { label: "Cap table", href: "/captable" }), ...on(show("financials"), { label: "Financials", href: "/financials" })],
          },
          { key: "documents", label: "Documents", items: on(show("documents"), { label: "Documents", href: "/documents" }) },
          { key: "updates", label: "Updates", items: on(show("updates"), { label: "Updates", href: "/updates" }) },
          { key: "intros", label: "Introductions", items: on(show("intros"), { label: "Introductions", href: "/intros" }) },
        ]
  ).filter((g) => g.items.length > 0);

  const canAsk = !me.isStaff && show("requests");
  const jump: PaletteItem[] = [
    ...groups.flatMap((g) => g.items.map((i) => ({ label: g.items.length > 1 && i.label !== g.label ? `${g.label}: ${i.label}` : g.label, href: i.href, kind: "Go to" }))),
    ...on(canAsk, { label: "Ask the founders", href: "/requests", kind: "Go to" }),
    { label: "Printable summary", href: "/pack", kind: "Go to" },
    { label: "What's new", href: "/notifications", kind: "Go to" },
    ...on(me.role === "founder", { label: "Settings", href: "/settings", kind: "Go to" }),
    { label: "Account", href: "/account", kind: "Go to" },
  ];

  const stamp = `${company} · Confidential · Prepared for ${me.name} (${me.email}) on ${new Date().toISOString().slice(0, 10)}`;
  const unread = unreadCount(me.id);
  const ICON: Record<string, Tab["icon"]> = { today: "home", home: "home", fundraising: "people", people: "people", room: "doc", documents: "doc", company: "doc", numbers: "doc", updates: "mail", intros: "people" };
  const tabs: Tab[] = groups.slice(0, 4).map((g) => ({ label: g.label.replace(/^The /, "").replace(/^./, (c) => c.toUpperCase()), href: g.items[0].href, icon: ICON[g.key] ?? "doc", match: g.items.map((i) => i.href) }));
  const initials = me.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const who = `${me.orgName ? `${me.orgName} · ` : ""}${me.isStaff ? (me.role === "founder" ? "Founder" : "Team") : tierName(me.level)}`;

  return (
    <div className="shell">
      <Suspense fallback={null}><Cheer /></Suspense>
      <Suspense fallback={null}><Chrome tabs={tabs} unread={unread} /></Suspense>
      <header className="topbar">
        <Link className="brand" href="/home" aria-label={company}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoKey && <img className="brand-logo" src={`/api/logo?v=${logoKey.slice(0, 8)}`} alt="" />}
          {!(logoKey && getSetting("logo_has_name") === "1") && <span>{company}</span>}
        </Link>
        <PrimaryNav groups={groups} />
        <div className="topright">
          {canAsk && <Link className="btn small primary ask" href="/requests">Ask the founders</Link>}
          <Palette nav={jump} />
          <Link href="/notifications" className="whatsnew" aria-label={`What's new${unread ? `, ${unread} unread` : ""}`}>
            What&apos;s new{unread > 0 && <span className="count">{unread}</span>}
          </Link>
          <details className="acct">
            <summary aria-label="Your account"><span className="avatar">{initials}</span></summary>
            <div className="acct-pop">
              <div className="acct-who"><strong>{me.name}</strong><span className="muted small">{who}</span></div>
              <Link href="/account">Account and email</Link>
              {me.role === "founder" && <Link href="/settings">Settings</Link>}
              <ThemeSwitch />
              <form action={logoutAction}><button className="linkbtn">Sign out</button></form>
            </div>
          </details>
        </div>
      </header>
      <SubNav groups={groups} />

      {/* The phone's "More" screen: the same map, plus the account. */}
      <aside className="side" aria-label="Menu">
        <div className="brand-sub">{who}</div>
        <FullMenu groups={groups} />
        <nav>
          <div className="nav-label">You</div>
          {canAsk && <Link href="/requests">Ask the founders</Link>}
          <Link href="/notifications">What&apos;s new{unread > 0 ? ` (${unread})` : ""}</Link>
          <Link href="/account">Account and email</Link>
          {me.role === "founder" && <Link href="/settings">Settings</Link>}
        </nav>
        <div className="me">
          <div><strong>{me.name}</strong></div>
          <ThemeSwitch />
          <form action={logoutAction} style={{ marginTop: 10 }}><button className="linkbtn">Sign out</button></form>
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
        {/* Printed pages say who they were made for: once at the top, and in the footer of every page where the browser supports it. */}
        <style>{`@media print { @page { @bottom-center { content: "${cssString(stamp)}"; font: 8pt sans-serif; color: #777; } @bottom-right { content: counter(page) " / " counter(pages); font: 8pt sans-serif; color: #777; } } }`}</style>
        <div className="print-head">{stamp}</div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
