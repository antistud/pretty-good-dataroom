import { ExportBar } from "@/components/Export";
import Link from "next/link";
import { canSeeSection, requireSection, type Section } from "@/lib/auth";
import { getSetting } from "@/lib/db";
import { logView } from "@/lib/activity";
import { renderMarkdown } from "@/lib/md";
import { Field, Flash, Hint, Md, PageHead } from "@/components/ui";
import { saveOverviewAction } from "./actions";

const OUTLINE = `## The problem
Who has it, and how painful is it today?

## What we do
One or two sentences a stranger would understand.

## Why now
What changed that makes this possible or urgent?

## Traction
Pilots, revenue, waitlist, letters of intent. Numbers beat adjectives.

## The ask
How much you are raising, on what terms, and what it gets you to.`;

const LINKS: { section: Section; href: string; label: string; what: string }[] = [
  { section: "round", href: "/round", label: "The round", what: "How much is being raised and on what terms." },
  { section: "team", href: "/team", label: "Team", what: "Who is building this." },
  { section: "documents", href: "/documents", label: "Documents", what: "The deck and supporting files." },
  { section: "captable", href: "/captable", label: "Cap table & SAFEs", what: "Who owns what today." },
  { section: "financials", href: "/financials", label: "Financials", what: "Cash, burn and runway." },
  { section: "updates", href: "/updates", label: "Updates", what: "Monthly progress reports." },
  { section: "intros", href: "/intros", label: "Set Me Up", what: "People the company would like to meet." },
];

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireSection("overview");
  logView(me, "section.view", undefined, undefined, "overview");
  const company = getSetting("company_name");
  const tagline = getSetting("tagline");
  const body = getSetting("overview_md");
  const website = getSetting("fact_website");
  const contact = getSetting("fact_contact_email");
  const facts: [string, React.ReactNode][] = [];
  if (getSetting("fact_stage")) facts.push(["Stage", getSetting("fact_stage")]);
  if (getSetting("fact_founded")) facts.push(["Founded", getSetting("fact_founded")]);
  if (getSetting("fact_location")) facts.push(["Location", getSetting("fact_location")]);
  if (/^https?:\/\//i.test(website)) facts.push(["Website", <a key="w" href={website} target="_blank" rel="noopener noreferrer">{website.replace(/^https?:\/\//i, "")}</a>]);
  if (contact) facts.push(["Contact", <a key="c" href={`mailto:${contact}`}>{contact}</a>]);
  const links = LINKS.filter((l) => canSeeSection(me, l.section)).map((l) => (me.isStaff && l.section === "round" ? { ...l, href: "/rounds" } : l));

  return (
    <>
      <PageHead title={company} sub={tagline || (me.isStaff ? "Add a one-line description below." : undefined)}><ExportBar /></PageHead>
      <Flash sp={await searchParams} />
      {!me.isStaff && (
        <Hint title="What this page is">A short summary of the company in the founders' own words. Read this first, then use the links at the bottom to go deeper.</Hint>
      )}

      {facts.length > 0 && (
        <div className="card">
          <div className="row" style={{ gap: 28 }}>
            {facts.map(([k, v]) => (
              <div key={k}><div className="stat-label">{k}</div><div><strong>{v}</strong></div></div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        {body ? <Md html={renderMarkdown(body)} /> : <p className="muted">{me.isStaff ? "Nothing written yet. Use the form below." : "The founders have not written the overview yet."}</p>}
      </div>

      {links.length > 0 && (
        <div className="card">
          <h2>Where to go next</h2>
          <div className="grid3">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="lead" style={{ display: "block", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", color: "var(--ink)" }}>
                <strong>{l.label}</strong>
                <div className="muted small">{l.what}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {me.isStaff && (
        <div className="card">
          <h2>Edit the overview</h2>
          <Hint title="How to write this">Keep it to one screen. An investor should be able to read it in two minutes and know what you do, why it matters and what you are asking for. The box below starts with a suggested outline; replace each line with your own words.</Hint>
          <form action={saveOverviewAction}>
            <Field label="One-line description" hint="Shown under the company name."><input name="tagline" defaultValue={tagline} maxLength={200} /></Field>
            <Field label="Overview" hint="Formatting: ## heading, **bold**, - list item, [link text](https://…).">
              <textarea name="overview_md" defaultValue={body} placeholder={OUTLINE} style={{ minHeight: 320 }} />
            </Field>
            <div className="grid3">
              <Field label="Stage"><input name="fact_stage" defaultValue={getSetting("fact_stage")} placeholder="Pre-seed" maxLength={80} /></Field>
              <Field label="Founded"><input name="fact_founded" defaultValue={getSetting("fact_founded")} placeholder="2026" maxLength={40} /></Field>
              <Field label="Location"><input name="fact_location" defaultValue={getSetting("fact_location")} maxLength={120} /></Field>
            </div>
            <div className="grid2">
              <Field label="Website"><input name="fact_website" type="url" defaultValue={website} placeholder="https://" /></Field>
              <Field label="Contact email for investors"><input name="fact_contact_email" type="email" defaultValue={contact} /></Field>
            </div>
            <button className="btn primary">Save overview</button>
          </form>
        </div>
      )}
    </>
  );
}
