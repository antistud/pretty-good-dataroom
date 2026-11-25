import Link from "next/link";
import { q, q1 } from "@/lib/db";
import { reactUpdateAction, replyUpdateAction } from "../respond-actions";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth";
import { logView } from "@/lib/activity";
import { fmtDate, levelName, levelOptions, monthLabel, tierName } from "@/lib/format";
import { renderMarkdown } from "@/lib/md";
import { Field, Flash, Hint, LevelSelect, Md, PageHead } from "@/components/ui";
import { allSections, getUpdate, recipientsSummary, tierLevels, visibleAsks, type AskRow, type SectionRow } from "@/lib/updates";
import {
  addSectionAction, deleteSectionAction, deleteUpdateAction, moveSectionDownAction, moveSectionUpAction,
  publishUpdateAction, resendUpdateAction, saveSectionAction, saveTitleAction, unpublishUpdateAction,
} from "../actions";

const PROMPTS: Record<string, string> = {
  highlights: "The two or three best things that happened. Lead with the biggest. Use numbers where you have them.",
  lowlights: "What went wrong or slower than planned, and what you are doing about it. Investors trust founders who say this plainly.",
  "key metrics": "The same three to five numbers every month (users, revenue, pilots, pipeline), each with last month's figure next to it.",
  "cash & runway": "Filled in from your Financials page. Check the numbers, then add one line on anything unusual.",
  asks: "Specific requests: a named person or company to meet, a hire, a customer intro. Specific asks get answered; vague ones do not.",
  "thank-yous": "Name the people who helped this month. It encourages everyone else to help next month.",
};

function AsksBlock({ asks }: { asks: AskRow[] }) {
  if (!asks.length) return null;
  return (
    <div className="hint">
      <strong>Can you help?</strong>
      <p>The founders would like an introduction to:</p>
      <ul style={{ margin: "0 0 10px", paddingLeft: 20 }}>
        {asks.map((a) => <li key={a.id}>{a.title}{a.detail ? <span className="muted"> — {a.detail}</span> : null}</li>)}
      </ul>
      <Link className="btn primary" href="/intros">I can make an intro</Link>
    </div>
  );
}

function Reading({ sections }: { sections: SectionRow[] }) {
  return (
    <>
      {sections.filter((s) => s.body_md.trim()).map((s) => (
        <div key={s.id} style={{ marginBottom: 18 }}>
          <h2>{s.heading}</h2>
          <Md html={renderMarkdown(s.body_md)} />
        </div>
      ))}
    </>
  );
}

const REACTION: Record<string, string> = { thanks: "said thanks", help: "can help with an ask", talk: "wants to talk" };

/** For founders: who has read this update and how they responded. */
function Readers({ updateId }: { updateId: number }) {
  const readers = q<{ name: string; org: string | null; at: string; kind: string | null }>(
    `SELECT u.name, o.name AS org, MIN(a.created_at) AS at, r.kind
       FROM activity a JOIN users u ON u.id = a.user_id LEFT JOIN orgs o ON o.id = u.org_id
       LEFT JOIN update_reactions r ON r.update_id = a.target_id AND r.user_id = u.id
      WHERE a.action = 'update.view' AND a.target_id = ? GROUP BY u.id ORDER BY at`,
    updateId,
  );
  return (
    <div className="card">
      <h2>Who has read it</h2>
      {readers.length === 0 ? <p className="muted">Nobody yet. Most people open an update within a day or two.</p> : (
        <ul className="quiet-list">
          {readers.map((r) => (
            <li key={r.name + r.at}>
              {r.name}{r.org ? <span className="muted"> · {r.org}</span> : null}
              {r.kind ? <strong> {REACTION[r.kind]}</strong> : null} <span className="muted small">· {fmtDate(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function UpdatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const me = await requireSection("updates");
  const id = Number((await params).id);
  const sp = await searchParams;
  const update = Number.isInteger(id) ? getUpdate(id) : undefined;
  if (!update) redirect("/updates");
  const all = allSections(id);

  if (!me.isStaff) {
    const mine = all.filter((s) => s.min_level <= me.level && s.body_md.trim());
    if (update.status !== "published" || mine.length === 0) redirect("/updates");
    logView(me, "update.view", "update", id);
    const myReaction = q1<{ kind: string }>("SELECT kind FROM update_reactions WHERE update_id = ? AND user_id = ?", id, me.id)?.kind;
    return (
      <>
        <PageHead title={update.title} sub={`Covers ${monthLabel(update.period)} · published ${fmtDate(update.published_at)}`}>
          <Link className="btn" href="/updates">All updates</Link>
        </PageHead>
        <Flash sp={sp} />
        <div className="card"><Reading sections={mine} /></div>
        <AsksBlock asks={visibleAsks(me.level)} />
        <div className="card">
          <h2>Say something back</h2>
          <p className="muted" style={{ marginTop: -6 }}>One tap tells the founders you read it. A few words mean more.</p>
          <div className="row" style={{ marginBottom: 14 }}>
            {([["thanks", "Thanks for the update"], ["help", "I can help with an ask"], ["talk", "Let's talk"]] as const).map(([kind, label]) => (
              <form action={reactUpdateAction} key={kind}>
                <input type="hidden" name="update_id" value={id} />
                <input type="hidden" name="kind" value={kind} />
                <button className={`btn ${myReaction === kind ? "primary" : ""}`}>{myReaction === kind ? "✓ " : ""}{label}</button>
              </form>
            ))}
          </div>
          <form action={replyUpdateAction}>
            <input type="hidden" name="update_id" value={id} />
            <Field label="Reply to the founders"><textarea name="body" rows={3} placeholder="A thought, a question, an offer…" required /></Field>
            <button className="btn">Send reply</button>
          </form>
        </div>
      </>
    );
  }

  const published = update.status === "published";
  const summary = recipientsSummary(id);
  const options = levelOptions().filter((o) => o.level < 100);
  const previewLevel = sp.as != null && sp.as !== "" && Number.isInteger(Number(sp.as)) ? Number(sp.as) : null;
  const confirm = sp.confirm === "1" && !published;
  const hasBody = all.some((s) => s.body_md.trim());
  const emptyHeadings = all.filter((s) => !s.body_md.trim()).map((s) => s.heading);
  const hidden = <input type="hidden" name="update_id" value={id} />;

  const recipients = (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        {summary.byLevel.length === 0 && <span className="muted">No investors or supporters have joined yet.</span>}
        {summary.byLevel.map((l) => <span className="badge" key={l.level}>{tierName(l.level)}: {l.count}</span>)}
      </div>
      <p className="small muted">
        {summary.canRead} of {summary.total} people can see at least one section.{" "}
        {summary.mailOn
          ? `${summary.willEmail} will be emailed${summary.alreadySent ? `, ${summary.alreadySent} already have it` : ""}${summary.optedOut ? `, ${summary.optedOut} turned emails off` : ""}. Founders and team get a copy of the full version.`
          : "Email (SMTP) is not set up, so nobody will be emailed; readers see it when they sign in."}
      </p>
    </>
  );

  return (
    <>
      <PageHead title={update.title} sub={<>Covers {monthLabel(update.period)} · {published ? <span className="badge ok">Published {fmtDate(update.published_at)}</span> : <span className="badge warn">Draft</span>}</>}>
        <Link className="btn" href="/updates">All updates</Link>
        {!published && !confirm && <Link className="btn primary" href={`/updates/${id}?confirm=1`}>Publish and send…</Link>}
      </PageHead>
      <Flash sp={sp} />
      {update.status === "published" && <Readers updateId={id} />}

      {confirm && (
        <div className="card">
          <h2>Ready to publish?</h2>
          {!hasBody ? (
            <p>Every section is still empty. <Link href={`/updates/${id}`}>Go back and write something first.</Link></p>
          ) : (
            <>
              <p>This makes the update visible in the data room and emails each reader their own version. Sent emails cannot be recalled.</p>
              {recipients}
              <table className="table" style={{ marginBottom: 12 }}>
                <thead><tr><th>Section</th><th>Who sees it</th></tr></thead>
                <tbody>
                  {all.filter((s) => s.body_md.trim()).map((s) => <tr key={s.id}><td>{s.heading}</td><td><span className="badge">{levelName(s.min_level)}</span></td></tr>)}
                </tbody>
              </table>
              {emptyHeadings.length > 0 && <p className="small muted">Empty sections will be left out: {emptyHeadings.join(", ")}.</p>}
              <div className="row">
                <form action={publishUpdateAction}>{hidden}<button className="btn primary big">Yes, publish and send</button></form>
                <Link className="btn" href={`/updates/${id}`}>Not yet, keep editing</Link>
              </div>
            </>
          )}
        </div>
      )}

      {!published && !confirm && (
        <Hint title="What to do">
          Fill in each section below and press Save on each one. Check the “Who sees this” setting on every section: supporters only get sections marked Everyone. Use Preview to read it as each audience, then press “Publish and send”.
        </Hint>
      )}

      {published && (
        <div className="card">
          <h2>Sent</h2>
          {recipients}
          <div className="row">
            {summary.mailOn && summary.willEmail > 0 && <form action={resendUpdateAction}>{hidden}<button className="btn">Send to anyone missed ({summary.willEmail})</button></form>}
            <form action={unpublishUpdateAction}>{hidden}<button className="btn danger">Unpublish to draft</button></form>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>You can still fix typos below; changes show in the data room straight away. To change who sees a section, unpublish first so nobody is surprised.</p>
        </div>
      )}

      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Preview as</h2>
          <form method="get" className="row">
            <select name="as" defaultValue={previewLevel != null ? String(previewLevel) : ""} style={{ width: "auto" }}>
              <option value="">Choose an audience…</option>
              <option value="0">A supporter</option>
              {options.filter((o) => o.level > 0).map((o) => <option key={o.level} value={o.level}>An investor at {tierName(o.level)}</option>)}
            </select>
            <button className="btn small">Preview</button>
            {previewLevel != null && <Link href={`/updates/${id}`} className="small">Close preview</Link>}
          </form>
        </div>
        {previewLevel != null && (() => {
          const seen = all.filter((s) => s.min_level <= previewLevel && s.body_md.trim());
          const notSeen = all.filter((s) => s.min_level > previewLevel && s.body_md.trim());
          return (
            <div style={{ marginTop: 14 }}>
              <div className={`notice ${notSeen.length ? "warn" : ""}`}>
                {seen.length === 0
                  ? `${tierName(previewLevel)} readers see nothing, so they will not get this update at all.`
                  : notSeen.length
                    ? `Hidden from ${tierName(previewLevel)} readers: ${notSeen.map((s) => s.heading).join(", ")}.`
                    : `${tierName(previewLevel)} readers see every section.`}
              </div>
              {seen.length > 0 && (
                <div style={{ border: "1px dashed var(--line)", borderRadius: 10, padding: 18 }}>
                  <h1 style={{ marginBottom: 14 }}>{update.title}</h1>
                  <Reading sections={seen} />
                  <AsksBlock asks={visibleAsks(previewLevel)} />
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <div className="card">
        <form action={saveTitleAction} className="inline-form">
          {hidden}
          <Field label="Title"><input name="title" defaultValue={update.title} required maxLength={200} /></Field>
          <button className="btn">Save title</button>
        </form>
      </div>

      {all.map((s, i) => (
        <div className="card" key={s.id}>
          <form action={saveSectionAction}>
            <input type="hidden" name="section_id" value={s.id} />
            <div className="grid2">
              <Field label="Heading"><input name="heading" defaultValue={s.heading} required maxLength={200} /></Field>
              <LevelSelect value={s.min_level} label="Who sees this section" />
            </div>
            <Field label="What to say" hint={PROMPTS[s.heading.toLowerCase()] ?? "Keep it to a few bullet points."}>
              <textarea name="body_md" defaultValue={s.body_md} style={{ minHeight: 140 }} />
            </Field>
            <div className="spread">
              <div className="row">
                <button className="btn primary">Save section</button>
                <span className="muted small">Formatting: <code>- item</code> for bullets, <code>**bold**</code>, <code>[text](https://link)</code>.</span>
              </div>
              <div className="row">
                {i > 0 && <button className="linkbtn small" formAction={moveSectionUpAction} formNoValidate>Move up</button>}
                {i < all.length - 1 && <button className="linkbtn small" formAction={moveSectionDownAction} formNoValidate>Move down</button>}
                <button className="linkbtn small danger" formAction={deleteSectionAction} formNoValidate>Delete section</button>
              </div>
            </div>
          </form>
        </div>
      ))}

      <div className="card">
        <h2>Add a section</h2>
        <form action={addSectionAction} className="inline-form">
          {hidden}
          <Field label="Heading"><input name="heading" required maxLength={200} placeholder="e.g. Hiring, Product, Fundraising" /></Field>
          <LevelSelect value={tierLevels().highest} label="Who sees it" />
          <button className="btn">Add section</button>
        </form>
        <p className="small muted" style={{ marginTop: 8 }}>New sections start visible to your most trusted investors only. Widen it once you are sure the content is safe for everyone.</p>
      </div>

      {!published && (
        <form action={deleteUpdateAction} style={{ textAlign: "right" }}>{hidden}<button className="linkbtn small danger">Delete this draft</button></form>
      )}
    </>
  );
}
