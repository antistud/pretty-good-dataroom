import { appUrl, requireFounder } from "@/lib/auth";
import { getSetting, q } from "@/lib/db";
import { ago, levelName, levelOptions } from "@/lib/format";
import { mailEnabled } from "@/lib/mail";
import { Field, Flash, Hint, LevelSelect, PageHead } from "@/components/ui";
import {
  createPageAction, deletePageAction, saveCompanyAction, saveNdaAction, saveSectionsAction, saveTiersAction,
  saveUpdateDayAction, testEmailAction, updatePageAction, saveWelcomeAction, saveAutomationsAction } from "./actions";
import { AUTOMATIONS, automationOn } from "@/lib/automations";

const SECTIONS: [string, string, string][] = [
  ["overview", "Overview", "The company summary."],
  ["team", "Team", "Founders, hires and advisors."],
  ["updates", "Updates", "The monthly update archive. Each section of an update has its own audience too."],
  ["intros", "Set Me Up", "The list of introductions you are looking for."],
  ["round", "The round", "Terms and progress of the open round."],
  ["documents", "Documents", "The folder tree. Each folder and file also has its own audience."],
  ["requests", "Ask or request", "Lets people ask questions and request documents or calls."],
  ["captable", "Cap table & SAFEs", "Ownership and outstanding SAFEs."],
  ["financials", "Financials", "Cash, burn and runway."],
];

type Page = { id: number; slug: string; title: string; body_md: string; min_level: number; position: number };

function PageFields({ p }: { p?: Page }) {
  return (
    <>
      <div className="grid2">
        <Field label="Title"><input name="title" required maxLength={120} defaultValue={p?.title} /></Field>
        <Field label="Address" hint="Letters, numbers and dashes. Leave blank to make one from the title."><input name="slug" maxLength={60} pattern="[a-z0-9\-]*" defaultValue={p?.slug} placeholder="market-research" /></Field>
      </div>
      <Field label="Content" hint="Formatting: ## heading, **bold**, - list item, [link text](https://…)."><textarea name="body_md" defaultValue={p?.body_md} style={{ minHeight: 160 }} /></Field>
      <div className="grid2">
        <LevelSelect value={p?.min_level} />
        <Field label="Menu order" hint="Lower numbers come first."><input name="position" type="number" defaultValue={p?.position ?? 0} /></Field>
      </div>
    </>
  );
}

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireFounder();
  const emailLog = q<{ id: number; to_email: string; subject: string; status: string; error: string | null; created_at: string }>("SELECT * FROM email_log ORDER BY id DESC LIMIT 40");
  const tiers = q<{ level: number; name: string; can_download: number }>("SELECT level, name, can_download FROM tiers ORDER BY level");
  const pages = q<Page>("SELECT * FROM pages ORDER BY position, id");
  const options = [...levelOptions(), { level: 999, label: "Off (hidden from everyone, including you)" }];
  const url = appUrl();
  const secure = url.startsWith("https://");
  const setupToken = !!process.env.SETUP_TOKEN;

  return (
    <>
      <PageHead title="Settings" sub="Only founders can see and change this page. Every change is recorded in the activity log." />
      <Flash sp={await searchParams} />

      <div className="grid2">
        <div className="card">
          <h2>Company</h2>
          <form action={saveCompanyAction}>
            <Field label="Company name"><input name="company_name" required maxLength={120} defaultValue={getSetting("company_name")} /></Field>
            <Field label="One-line description"><input name="tagline" maxLength={200} defaultValue={getSetting("tagline")} /></Field>
            <button className="btn primary">Save</button>
          </form>
        </div>
        <div className="card">
          <h2>Monthly investor update</h2>
          <p className="muted small">Each month's update covers the month before. You are reminded three days before the due day, on the day, and every few days after until it is published.</p>
          <form action={saveUpdateDayAction} className="inline-form">
            <Field label="Due on day of the month (1–28)"><input name="update_due_day" type="number" min={1} max={28} required defaultValue={getSetting("update_due_day")} /></Field>
            <button className="btn primary">Save</button>
          </form>
        </div>
      </div>

      <div className="card">
        <h2>Your welcome, in your own words</h2>
        <p className="muted" style={{ maxWidth: "66ch" }}>The first thing an investor or supporter reads is a short letter from you, signed with the founders&apos; names. Leave these blank to use a plain default, or write a few sentences the way you would say them.</p>
        <form action={saveWelcomeAction}>
          <div className="grid2">
            <Field label="To investors"><textarea name="welcome_investor" rows={7} defaultValue={getSetting("welcome_investor")} placeholder="Thank you for taking the time to look at us…" /></Field>
            <Field label="To supporters"><textarea name="welcome_supporter" rows={7} defaultValue={getSetting("welcome_supporter")} placeholder="Thank you for being in our corner…" /></Field>
          </div>
          <button className="btn">Save welcome notes</button>
        </form>
      </div>

      <div className="card" id="automations">
        <h2>Things the room does for you</h2>
        <p className="muted" style={{ marginTop: -6, maxWidth: "66ch" }}>Each of these runs on its own. Switch off any you would rather do by hand. Monthly update reminders are set separately above.</p>
        <form action={saveAutomationsAction}>
          {AUTOMATIONS.map((a) => (
            <p key={a.key} style={{ marginBottom: 10 }}>
              <label className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <input type="checkbox" name={a.key} defaultChecked={automationOn(a.key)} style={{ marginTop: 5, flex: "none" }} />
                <span><strong>{a.title}</strong><br /><span className="muted">{a.help}</span></span>
              </label>
            </p>
          ))}
          <button className="btn">Save</button>
        </form>
      </div>

      <details className="card" id="emails">
        <summary>Emails sent recently ({emailLog.length})</summary>
        {emailLog.length === 0 ? <p className="muted">Nothing has been sent yet.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Result</th></tr></thead>
            <tbody>
              {emailLog.map((e) => (
                <tr key={e.id}>
                  <td className="small muted nowrap">{ago(e.created_at)}</td>
                  <td className="small">{e.to_email}</td>
                  <td>{e.subject}</td>
                  <td><span className={`badge ${e.status === "sent" ? "ok" : e.status === "failed" ? "bad" : "grey"}`}>{e.status}</span>{e.error ? <div className="small muted">{e.error}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </details>

      <div className="card">
        <h2>Investor access tiers</h2>
        <Hint>Every investor firm sits in one tier. A higher tier sees everything the lower tiers see, plus more. Rename the tiers to match how you run a raise, and choose which tiers may download files (everyone else can only view them in the browser, watermarked).</Hint>
        <form action={saveTiersAction}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Level</th><th>Name</th><th>May download files</th></tr></thead>
              <tbody>
                {tiers.map((t) => (
                  <tr key={t.level}>
                    <td>{t.level}</td>
                    <td><input name={`name_${t.level}`} required maxLength={40} defaultValue={t.name} /></td>
                    <td><label className="row"><input type="checkbox" name={`download_${t.level}`} defaultChecked={!!t.can_download} /> Allow downloads</label></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn primary" style={{ marginTop: 10 }}>Save tiers</button>
        </form>
      </div>

      <div className="card">
        <h2>Who sees each section</h2>
        <Hint>Pick the least-trusted audience that should see each section. “Everyone” includes supporters, who are not investors. If you are unsure, choose the more restricted option; you can always open it up later. “Off” removes the section from the menu.</Hint>
        <form action={saveSectionsAction}>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {SECTIONS.map(([key, label, what]) => (
                  <tr key={key}>
                    <td><strong>{label}</strong><div className="muted small">{what}</div></td>
                    <td style={{ minWidth: 260 }}>
                      <select name={`level_${key}`} defaultValue={getSetting(`level_${key}`)} aria-label={`Audience for ${label}`}>
                        {options.map((o) => <option key={o.level} value={o.level}>{o.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn primary" style={{ marginTop: 10 }}>Save visibility</button>
        </form>
      </div>

      <div className="card">
        <h2>Confidentiality step</h2>
        <p className="muted small">When on, every investor and supporter must click “I agree” to the text below before they see anything. Their name and the time are recorded. This is a click-through acknowledgement, not a signed contract; ask your lawyer if you need a formal NDA.</p>
        <form action={saveNdaAction}>
          <label className="row" style={{ marginBottom: 10 }}><input type="checkbox" name="nda_enabled" defaultChecked={getSetting("nda_enabled") === "1"} /> Ask people to accept before entering</label>
          <Field label="Text they agree to"><textarea name="nda_text" defaultValue={getSetting("nda_text")} maxLength={10000} /></Field>
          <button className="btn primary">Save</button>
        </form>
      </div>

      <div className="card">
        <h2>Custom pages</h2>
        <Hint>Add your own pages to the menu, for example “Market”, “Press” or “FAQ”. Each page has its own audience.</Hint>
        {pages.map((p) => (
          <details key={p.id} style={{ marginBottom: 10 }}>
            <summary>{p.title} <span className="badge grey">{levelName(p.min_level)}</span> <span className="muted small">/p/{p.slug}</span></summary>
            <form action={updatePageAction}>
              <input type="hidden" name="id" value={p.id} />
              <PageFields p={p} />
              <button className="btn">Save page</button>
            </form>
            <form action={deletePageAction} style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={p.id} />
              <button className="linkbtn small danger">Delete this page</button>
            </form>
            <hr />
          </details>
        ))}
        <details open={pages.length === 0}>
          <summary>Add a page</summary>
          <form action={createPageAction}>
            <PageFields />
            <button className="btn primary">Create page</button>
          </form>
        </details>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Email</h2>
          {mailEnabled() ? (
            <>
              <p><span className="badge ok">On</span> Invitations, updates and reminders are emailed.</p>
              <form action={testEmailAction}><button className="btn">Send me a test email</button></form>
            </>
          ) : (
            <>
              <p><span className="badge warn">Off</span> Nothing is emailed. Invitations give you a link to send yourself, and reminders only show as banners inside the app.</p>
              <p className="muted small">To turn it on, set <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> and <code>SMTP_FROM</code> in your <code>.env</code> file and restart the container.</p>
            </>
          )}
        </div>
        <div className="card">
          <h2>Security check</h2>
          <ul className="steps">
            <li className={secure ? "done" : ""}>
              <span className="tick">✓</span>
              <div className="step-body">
                <div className="step-title">Served over HTTPS</div>
                <div className="small muted">APP_URL is <code>{url}</code>. {secure ? "Sign-in cookies are marked secure." : "Sign-in cookies are NOT marked secure. Put a TLS proxy in front and set APP_URL to the https:// address before inviting anyone."}</div>
              </div>
            </li>
            <li className={setupToken ? "done" : ""}>
              <span className="tick">✓</span>
              <div className="step-body">
                <div className="step-title">Setup token set</div>
                <div className="small muted">{setupToken ? "SETUP_TOKEN is set." : "SETUP_TOKEN is not set. Setup is already complete, so this only matters if you ever start again from an empty data volume."}</div>
              </div>
            </li>
            <li>
              <span className="tick">✓</span>
              <div className="step-body">
                <div className="step-title">Turn on two-step sign-in and back up the data volume</div>
                <div className="small muted">Each founder turns on two-step sign-in under Account. Backups are yours to schedule; see the README.</div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
