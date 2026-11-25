import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { templatesFor } from "@/lib/templates";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { ago, fmtDate, fmtDateTime, money, tierName } from "@/lib/format";
import { mailEnabled } from "@/lib/mail";
import { STAGES, diligence, engagement, recentExternalActivity, stageOf, suggestions, tierLevelForRank, today, type Lead } from "@/lib/pipeline";
import { Field, Flash, Hint, PageHead } from "@/components/ui";
import {
  addNoteAction, afterPassAction, commitAction, deleteLeadAction, inviteLeadAction, moveStageAction, passAction, setNextActionAction, updateLeadAction,
} from "../actions";

type Org = { id: number; name: string; kind: string; tier: number };

function Move({ leadId, stage, label, primary = true }: { leadId: number; stage: string; label: string; primary?: boolean }) {
  return (
    <form action={moveStageAction}>
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="stage" value={stage} />
      <button className={`btn ${primary ? "primary big" : ""}`}>{label}</button>
    </form>
  );
}

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const me = await requireStaff();
  const { id } = await params;
  const lead = q1<Lead>("SELECT * FROM leads WHERE id = ?", Number(id));
  if (!lead) notFound();
  const stage = stageOf(lead.stage);
  const rounds = q<{ id: number; name: string; instrument: string; valuation_cap: number | null; discount: number | null }>(
    "SELECT id, name, instrument, valuation_cap, discount FROM rounds ORDER BY created_at DESC, id DESC",
  );
  const round = rounds.find((r) => r.id === lead.round_id);
  const orgs = q<Org>("SELECT id, name, kind, tier FROM orgs ORDER BY name");
  const org = orgs.find((o) => o.id === lead.org_id);
  const members = org ? q<{ id: number; name: string; email: string; disabled: number; last_seen_at: string | null }>("SELECT id, name, email, disabled, last_seen_at FROM users WHERE org_id = ? ORDER BY name", org.id) : [];
  const invites = org
    ? q<{ id: number; email: string; created_at: string; expires_at: string }>(
        "SELECT id, email, created_at, expires_at FROM invites WHERE org_id = ? AND accepted_at IS NULL AND revoked = 0 AND expires_at > ? ORDER BY created_at DESC",
        org.id,
        new Date().toISOString(),
      )
    : [];
  const notes = q<{ id: number; body: string; created_at: string; author: string | null }>(
    "SELECT n.id, n.body, n.created_at, u.name AS author FROM lead_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.lead_id = ? ORDER BY n.id DESC",
    lead.id,
  );
  const safes = q<{ id: number; amount: number; status: string; valuation_cap: number | null; discount: number | null }>(
    "SELECT id, amount, status, valuation_cap, discount FROM safes WHERE ((? IS NOT NULL AND org_id = ?) OR (org_id IS NULL AND investor_name = ?)) AND IFNULL(round_id, 0) = IFNULL(?, 0)",
    lead.org_id, lead.org_id, lead.org_name, lead.round_id,
  );
  const eng = org ? engagement(org.id) : null;
  const dd = org ? diligence(org.id) : null;
  const nudges = suggestions(lead);
  const recent = org ? recentExternalActivity(8, org.id) : [];
  const t = today();
  const stageIndex = STAGES.findIndex((s) => s.key === lead.stage);
  const inviteLabel = mailEnabled() ? "invite to the room" : "get their invite link";
  const templates = templatesFor(lead, me.name);
  const hasAccess = !!org && (members.length > 0 || invites.length > 0);

  const inviteForm = (label: string, primary = true) => (
    <form action={inviteLeadAction}>
      <input type="hidden" name="lead_id" value={lead.id} />
      <button className={`btn ${primary ? "primary big" : ""}`}>{label}</button>
    </form>
  );
  const needsEmail = <p className="notice warn">Add the contact&apos;s email under Details below. You need it to invite them.</p>;

  return (
    <>
      <PageHead
        title={lead.org_name}
        sub={<>{lead.contact_name || "No contact name"}{lead.contact_email ? ` · ${lead.contact_email}` : ""}{round ? ` · ${round.name}` : " · no round set"}{lead.check_size != null ? ` · ${money(lead.check_size)}` : ""}</>}
      >
        <Link className="btn" href={lead.round_id ? `/pipeline?round=${lead.round_id}` : "/pipeline"}>All investors</Link>
      </PageHead>
      <Flash sp={await searchParams} />

      <div className="row small" style={{ marginBottom: 14, gap: 6 }}>
        {STAGES.filter((s) => s.key !== "passed").map((s, i) => (
          <span key={s.key} className={`badge ${s.key === lead.stage ? "" : lead.stage !== "passed" && i < stageIndex ? "ok" : "grey"}`}>{i + 1}. {s.label}</span>
        ))}
        {lead.stage === "passed" && <span className="badge bad">Passed</span>}
      </div>

      <div className="card callout">
        <div className="muted small">Do this next · stage: {stage.label}</div>
        <h2 style={{ marginTop: 4 }}>{stage.action}</h2>
        <p>{stage.todo}</p>

        {lead.stage === "lead" && <Move leadId={lead.id} stage="contacted" label="Mark as contacted" />}

        {lead.stage === "contacted" && (lead.contact_email ? (
          <div className="row">
            {inviteForm(`They're interested: ${inviteLabel}`)}
            <Move leadId={lead.id} stage="interested" label="Mark interested without inviting" primary={false} />
          </div>
        ) : needsEmail)}

        {lead.stage === "interested" && (
          <>
            {!hasAccess && (lead.contact_email
              ? <div style={{ marginBottom: 12 }}><p className="notice warn">They have no data room access yet.</p>{inviteForm(`Invite them: ${inviteLabel}`, false)}</div>
              : needsEmail)}
            {org && members.length === 0 && invites.length > 0 && <p className="muted small">They have been invited but have not signed in yet.</p>}
            <form action={moveStageAction}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <input type="hidden" name="stage" value="meeting" />
              <Field label="How did the meeting go? (saved as a note)"><textarea name="note" placeholder="What they liked, what worried them, what they asked for." /></Field>
              <button className="btn primary big">Log the meeting</button>
            </form>
          </>
        )}

        {lead.stage === "meeting" && (
          <>
            {!org && (lead.contact_email
              ? <div style={{ marginBottom: 12 }}><p className="notice warn">They are not in the data room yet. Invite them first, or opening diligence will not give them anything to look at.</p>{inviteForm(`Invite them: ${inviteLabel}`, false)}</div>
              : needsEmail)}
            <Move leadId={lead.id} stage="diligence" label={`Open diligence${org ? ` (raise ${org.name} to ${tierName(tierLevelForRank(2))})` : ""}`} />
          </>
        )}

        {lead.stage === "diligence" && (
          <form action={commitAction} className="inline-form">
            <input type="hidden" name="lead_id" value={lead.id} />
            <Field label="Amount they committed ($)"><input name="amount" inputMode="numeric" required defaultValue={lead.check_size ?? ""} /></Field>
            <button className="btn primary big">Record commitment</button>
            <p className="muted small" style={{ flexBasis: "100%", margin: 0 }}>
              {round
                ? round.instrument === "priced"
                  ? `${round.name} is a priced round, so this records the amount only.`
                  : `Adds a SAFE to the cap table at the ${round.name} terms (cap ${money(round.valuation_cap)}${round.discount ? `, ${round.discount}% discount` : ""}) and unlocks closing documents for them.`
                : "This lead has no round. Set one under Details first so the SAFE picks up the right terms."}
            </p>
          </form>
        )}

        {lead.stage === "committed" && (
          <div className="row">
            <Move leadId={lead.id} stage="signed" label="Mark SAFE signed" />
            <Link className="btn" href="/documents">Upload the signed copy</Link>
          </div>
        )}

        {lead.stage === "signed" && <Move leadId={lead.id} stage="wired" label="Confirm wire received" />}

        {lead.stage === "wired" && (
          <p className="notice">Closed. {lead.org_name} {safes[0] ? `invested ${money(safes[0].amount)} and ` : ""}now receives your monthly investor updates. <Link href="/updates">Go to updates</Link></p>
        )}

        {lead.stage === "passed" && (
          <>
            {lead.passed_reason && <p><strong>Why they passed:</strong> {lead.passed_reason}</p>}
            {org ? (
              <>
                <p className="muted small">{org.name} currently has {org.kind === "supporter" ? "supporter access (updates only)" : `${tierName(org.tier)} investor access`}. Investors who pass often come back next round if they keep hearing from you.</p>
                <div className="row">
                  {org.kind !== "supporter" && (
                    <form action={afterPassAction}><input type="hidden" name="lead_id" value={lead.id} /><input type="hidden" name="mode" value="supporter" /><button className="btn primary">Keep them as a supporter</button></form>
                  )}
                  {org.kind !== "supporter" && org.tier > tierLevelForRank(1) && (
                    <form action={afterPassAction}><input type="hidden" name="lead_id" value={lead.id} /><input type="hidden" name="mode" value="teaser" /><button className="btn">Lower to {tierName(tierLevelForRank(1))} access</button></form>
                  )}
                  <form action={afterPassAction}><input type="hidden" name="lead_id" value={lead.id} /><input type="hidden" name="mode" value="remove" /><button className="btn danger">Remove their access</button></form>
                </div>
              </>
            ) : <p className="muted small">They never had data room access, so there is nothing to change. To keep them warm, add them as a supporter under People &amp; access.</p>}
          </>
        )}

        {nudges.length > 0 && (
          <>
            <hr />
            <h3>Worth knowing</h3>
            <ul style={{ margin: 0, paddingLeft: 20 }}>{nudges.map((n, i) => <li key={i} className={n.urgent ? "" : "muted"}>{n.text}</li>)}</ul>
          </>
        )}
      </div>

      {templates.length > 0 && (
        <details className="card">
          <summary>Words you can use: {templates.map((t) => t.title.toLowerCase()).join(", ")}</summary>
          <p className="muted small">A starting point, written for this stage. Replace anything in [brackets], make it sound like you, then send it from your own email.</p>
          {templates.map((t) => (
            <div key={t.key} style={{ marginBottom: 16 }}>
              <div className="spread" style={{ marginBottom: 6 }}>
                <div><strong>{t.title}</strong> <span className="muted small">· {t.when}</span></div>
                <div className="row">
                  <CopyButton text={`Subject: ${t.subject}\n\n${t.body}`} label="Copy" />
                  {lead.contact_email && <a className="btn small" href={`mailto:${encodeURIComponent(lead.contact_email)}?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(t.body)}`}>Open in email</a>}
                </div>
              </div>
              <div className="template"><strong>{t.subject}</strong>{"\n\n"}{t.body}</div>
            </div>
          ))}
        </details>
      )}

      <div className="grid2">
        <div className="card">
          <h2>Next action</h2>
          <form action={setNextActionAction}>
            <input type="hidden" name="lead_id" value={lead.id} />
            <Field label="What will you do?"><input name="next_action" maxLength={300} defaultValue={lead.next_action ?? ""} placeholder="Send follow-up with updated metrics" /></Field>
            <Field label="By when?" hint="Shows on your Today screen on this date and stays there until done.">
              <input name="next_action_due" type="date" defaultValue={lead.next_action_due ?? ""} />
            </Field>
            <div className="row">
              <button className="btn">Save next action</button>
              {lead.next_action_due && lead.next_action_due <= t && <span className="badge warn">{lead.next_action_due < t ? "Overdue" : "Due today"}</span>}
            </div>
          </form>
        </div>

        <div className="card">
          <h2>Move or close</h2>
          <form action={moveStageAction} className="inline-form">
            <input type="hidden" name="lead_id" value={lead.id} />
            <Field label="Move to stage">
              <select name="stage" defaultValue={lead.stage === "passed" ? "contacted" : lead.stage}>
                {STAGES.filter((s) => s.key !== "passed").map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
            <button className="btn">Move</button>
          </form>
          <p className="muted small" style={{ marginTop: 6 }}>Use this to skip ahead, go back, or reopen a pass. Moving forward raises access; moving back never lowers it.</p>
          {lead.stage !== "passed" && lead.stage !== "wired" && (
            <details style={{ marginTop: 10 }}>
              <summary>They passed</summary>
              <form action={passAction}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <Field label="Why? (for your own records)"><input name="reason" maxLength={500} placeholder="Too early for them; wants to see 3 paying customers" /></Field>
                <button className="btn danger">Mark as passed</button>
              </form>
            </details>
          )}
        </div>
      </div>

      {org && eng && dd ? (
        <>
          <div className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>What {org.name} has done in the room</h2>
              <span className={`badge ${org.kind === "supporter" ? "grey" : ""}`}>{org.kind === "supporter" ? "Supporter" : `${tierName(org.tier)} access`}</span>
            </div>
            <div className="grid3" style={{ marginTop: 12 }}>
              <div><div className="stat">{eng.lastSeen ? ago(eng.lastSeen) : "never"}</div><div className="stat-label">Last activity</div></div>
              <div><div className="stat">{dd.viewed} / {dd.total}</div><div className="stat-label">Documents opened, of those they can see</div></div>
              <div><div className="stat">{eng.openRequests}</div><div className="stat-label">Open requests{eng.openRequests > 0 && <> · <Link href="/requests">answer</Link></>}</div></div>
            </div>
            <div className="row small" style={{ marginTop: 12, gap: 6 }}>
              <span className={`badge ${eng.viewedDeck ? "ok" : "grey"}`}>{eng.viewedDeck ? "Opened the deck" : "Deck not opened"}</span>
              <span className={`badge ${eng.roundViews ? "ok" : "grey"}`}>Round terms: {eng.roundViews} view{eng.roundViews === 1 ? "" : "s"}</span>
              <span className={`badge ${eng.captableViews ? "ok" : "grey"}`}>Cap table: {eng.captableViews}</span>
              <span className={`badge ${eng.financialsViews ? "ok" : "grey"}`}>Financials: {eng.financialsViews}</span>
              <span className={`badge ${eng.updateViews ? "ok" : "grey"}`}>Updates read: {eng.updateViews}</span>
              <span className={`badge ${eng.downloads ? "warn" : "grey"}`}>Downloads: {eng.downloads}</span>
            </div>
            {recent.length > 0 && (
              <ul className="small" style={{ margin: "12px 0 0", paddingLeft: 20 }}>
                {recent.map((r) => <li key={r.id}>{r.who} {r.what} <span className="muted">· {ago(r.created_at)}</span></li>)}
              </ul>
            )}
          </div>

          <div className="grid2">
            <div className="card">
              <h2>People at {org.name}</h2>
              {members.length === 0 && invites.length === 0 && <p className="muted small">Nobody has been invited yet.</p>}
              <div className="table-wrap"><table className="table"><tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.name}</strong> {m.disabled ? <span className="badge bad">access removed</span> : null}<div className="muted small">{m.email}</div></td>
                    <td className="small muted right">Last seen {ago(m.last_seen_at)}</td>
                  </tr>
                ))}
                {invites.map((i) => (
                  <tr key={`i${i.id}`}>
                    <td>{i.email} <span className="badge warn">invited, not joined</span></td>
                    <td className="small muted right">Invited {ago(i.created_at)} · expires {fmtDate(i.expires_at)}</td>
                  </tr>
                ))}
              </tbody></table></div>
              <p className="muted small" style={{ marginTop: 8 }}>They can invite their own colleagues. Manage everyone under <Link href="/people">People &amp; access</Link>.</p>
            </div>
            <div className="card">
              <h2>Their requests</h2>
              {dd.requests.length === 0 ? <p className="muted small">They have not asked for anything yet.</p> : (
                <div className="table-wrap"><table className="table"><tbody>
                  {dd.requests.map((r) => (
                    <tr key={r.id}>
                      <td><Link href={`/requests/${r.id}`}>{r.title}</Link><div className="muted small">{r.kind} · {fmtDate(r.created_at)}</div></td>
                      <td className="right"><span className={`badge ${r.status === "fulfilled" ? "ok" : r.status === "declined" ? "grey" : "warn"}`}>{r.status.replace("_", " ")}</span></td>
                    </tr>
                  ))}
                </tbody></table></div>
              )}
            </div>
          </div>

          <div className="card">
            <h2>Diligence tracker</h2>
            <Hint>Everything {org.name} is allowed to see at their current access, and whether anyone there has opened it. Unopened items are good prompts for a follow-up; an empty folder is something they may ask you for.</Hint>
            {dd.folders.length === 0 ? <div className="empty">Nothing is visible at their access level yet.</div> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Folder</th><th>Document</th><th>Opened</th></tr></thead>
                <tbody>
                  {dd.folders.flatMap((f) =>
                    f.docs.length === 0
                      ? [<tr key={`f${f.id}`}><td>{f.name}</td><td className="muted small">Empty: nothing uploaded here yet</td><td><span className="badge warn">missing</span></td></tr>]
                      : f.docs.map((d, i) => (
                          <tr key={d.id}>
                            <td>{i === 0 ? f.name : ""}</td>
                            <td><Link href={`/documents/${d.id}`}>{d.name}</Link></td>
                            <td>{d.viewedAt ? <span className="badge ok">{d.views}× · last {ago(d.viewedAt)}</span> : <span className="badge grey">not yet</span>}</td>
                          </tr>
                        )),
                  )}
                </tbody>
              </table></div>
            )}
          </div>
        </>
      ) : (
        <div className="card">
          <h2>Data room access</h2>
          <p className="muted">{lead.org_name} has no access yet. Once you invite them, this card shows what they have opened, what they have asked for, and a diligence tracker.</p>
          {lead.contact_email && lead.stage !== "passed" && inviteForm(mailEnabled() ? "Invite to the room now" : "Get their invite link", false)}
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <h2>Notes</h2>
          <form action={addNoteAction}>
            <input type="hidden" name="lead_id" value={lead.id} />
            <Field label="Log a call, email or thought"><textarea name="body" required /></Field>
            <button className="btn">Add note</button>
          </form>
          <hr />
          {notes.length === 0 ? <p className="muted small">No notes yet. Logging each contact keeps the follow-up reminders accurate.</p> : (
            <div className="stack">
              {notes.map((n) => (
                <div key={n.id}>
                  <div className="muted small">{n.author ?? "Someone"} · {fmtDateTime(n.created_at)}</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Details</h2>
          <form action={updateLeadAction}>
            <input type="hidden" name="lead_id" value={lead.id} />
            <Field label="Firm or investor name"><input name="org_name" required maxLength={120} defaultValue={lead.org_name} /></Field>
            <div className="grid2">
              <Field label="Contact name"><input name="contact_name" maxLength={120} defaultValue={lead.contact_name ?? ""} /></Field>
              <Field label="Contact email"><input name="contact_email" type="email" defaultValue={lead.contact_email ?? ""} /></Field>
            </div>
            <div className="grid2">
              <Field label="Cheque size ($)"><input name="check_size" inputMode="numeric" defaultValue={lead.check_size ?? ""} /></Field>
              <Field label="Round">
                <select name="round_id" defaultValue={lead.round_id ?? ""}>
                  <option value="">Not decided</option>
                  {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="How you know them"><input name="source" maxLength={200} defaultValue={lead.source ?? ""} /></Field>
            <Field label="Linked data room organisation" hint="Set automatically when you invite them. Change it only if they already had an account under another name.">
              <select name="org_id" defaultValue={lead.org_id ?? ""}>
                <option value="">None</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.kind})</option>)}
              </select>
            </Field>
            <button className="btn">Save details</button>
          </form>
          {safes.length > 0 && (
            <p className="small muted" style={{ marginTop: 12 }}>
              On the cap table: {safes.map((s) => `${money(s.amount)} SAFE (${s.status})`).join(", ")}. <Link href="/captable">Open cap table</Link>
            </p>
          )}
          <hr />
          <details>
            <summary>Delete this lead</summary>
            <p className="muted small">Removes the card and its notes. It does not remove any data room access or SAFEs.</p>
            <form action={deleteLeadAction}><input type="hidden" name="lead_id" value={lead.id} /><button className="btn danger">Delete lead</button></form>
          </details>
        </div>
      </div>
    </>
  );
}
