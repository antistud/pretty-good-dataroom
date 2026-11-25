import Link from "next/link";
import { cookies } from "next/headers";
import { appUrl, requireStaff } from "@/lib/auth";
import { CONNECTOR_DAYS } from "@/lib/mcp";
import { getSetting, q } from "@/lib/db";
import { ago, money, num } from "@/lib/format";
import { documentsPrompt, parseAnswer } from "@/lib/docfill";
import { COMPANY_FIELDS, describe } from "@/lib/docfill-apply";
import { Field, Flash, PageHead } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { FilingBox } from "@/components/FilingBox";
import { MissingDocs } from "@/components/MissingDocs";
import { AssistantHelp } from "@/components/AssistantHelp";
import { applyProposalAction, createConnectorAction, dismissProposalAction, hideConnectorAction, pasteAnswerAction, revokeConnectorAction } from "./actions";

const Tick = ({ name, checked = true, children }: { name: string; checked?: boolean; children: React.ReactNode }) => (
  <label className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", padding: "7px 0" }}>
    <input type="checkbox" name={name} defaultChecked={checked} style={{ marginTop: 4 }} />
    <span style={{ minWidth: 0 }}>{children}</span>
  </label>
);

export default async function Fill({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireStaff();
  const company = getSetting("company_name");
  const key = (await cookies()).get("pgd_new_connector")?.value;
  const fresh = key && /^[A-Za-z0-9_-]{40,60}$/.test(key) ? { key, address: `${appUrl()}/mcp/${key}`, plain: `${appUrl()}/mcp` } : null;
  const connectors = q<{ id: number; label: string; last_used_at: string | null; can_read: number; days_left: number }>(
    "SELECT id, label, last_used_at, can_read, CAST(julianday(expires_at) - julianday('now') + 0.5 AS INTEGER) AS days_left FROM mcp_tokens WHERE user_id = ? AND revoked = 0 AND expires_at > datetime('now') ORDER BY id DESC",
    me.id,
  );
  const proposals = q<{ id: number; source: string; payload: string; created_at: string }>("SELECT id, source, payload, created_at FROM proposals WHERE status = 'pending' ORDER BY id DESC LIMIT 10");
  const prompt = documentsPrompt(company);

  return (
    <>
      <PageHead title="Let your AI do the setup" sub="Hand your deck, formation documents and SAFEs to your own AI assistant. It suggests what goes in the room; you check before anything is saved." />
      <Flash sp={await searchParams} />

      {proposals.length > 0 && (
        <div id="review">
          {proposals.map((p) => {
            const a = parseAnswer(p.payload);
            if (!a) return null;
            const d = describe(a);
            return (
              <div className="card callout" key={p.id}>
                <h2>Review what it found</h2>
                <p className="muted" style={{ marginTop: -6 }}>{p.source === "assistant" ? "Sent by your connected assistant" : "From the answer you pasted"} · {ago(p.created_at)}. Untick anything that is wrong. Nothing is saved until you press the button.</p>
                <form action={applyProposalAction}>
                  <input type="hidden" name="proposal_id" value={p.id} />
                  {a.company && COMPANY_FIELDS.some(([k]) => a.company![k]) && (
                    <>
                      <h3>Company</h3>
                      {COMPANY_FIELDS.filter(([k]) => a.company![k]).map(([key, label]) => {
                        const now = d.current[key];
                        const value = a.company![key];
                        const replaces = !!now && now.trim() !== value.trim();
                        return (
                          <Tick key={key} name={`c_${key}`} checked={!replaces}>
                            <strong>{label}</strong>{replaces && <span className="badge warn" style={{ marginLeft: 8 }}>replaces what you have</span>}{now && !replaces && <span className="badge grey" style={{ marginLeft: 8 }}>same as now</span>}
                            {key === "overview_markdown" ? <details><summary>Read it ({value.split(/\s+/).length} words)</summary><div className="template">{value}</div></details> : <div>{value}</div>}
                          </Tick>
                        );
                      })}
                    </>
                  )}
                  {a.team.length > 0 && (
                    <>
                      <h3 style={{ marginTop: 16 }}>Team</h3>
                      {a.team.map((m, i) => d.teamExists(m.name)
                        ? <p key={i} className="muted" style={{ margin: "7px 0 7px 26px" }}>{m.name} <span className="badge grey">already on the team page</span></p>
                        : <Tick key={i} name={`t_${i}`}><strong>{m.name}</strong>{m.title ? `, ${m.title}` : ""}{m.bio && <div className="muted">{m.bio}</div>}</Tick>)}
                    </>
                  )}
                  {a.holders.length > 0 && (
                    <>
                      <h3 style={{ marginTop: 16 }}>Cap table</h3>
                      {a.holders.map((h, i) => d.holderExists(h.name)
                        ? <p key={i} className="muted" style={{ margin: "7px 0 7px 26px" }}>{h.name} <span className="badge grey">already on the cap table</span></p>
                        : <Tick key={i} name={`h_${i}`}><strong>{h.name}</strong> · {num(h.shares)} {h.share_class} shares <span className="muted">· {h.kind === "pool" ? "unissued option pool" : h.kind}</span></Tick>)}
                    </>
                  )}
                  {a.round && (
                    <>
                      <h3 style={{ marginTop: 16 }}>Round</h3>
                      {d.roundExists(a.round.name)
                        ? <p className="muted" style={{ margin: "7px 0 7px 26px" }}>{a.round.name} <span className="badge grey">a round with this name already exists</span></p>
                        : <Tick name="r"><strong>{a.round.name}</strong>: raising {money(a.round.target_amount)} {a.round.instrument === "safe" ? "on SAFEs" : "in a priced round"}{a.round.valuation_cap ? ` at a ${money(a.round.valuation_cap, true)} cap` : ""}{a.round.discount_percent ? `, ${a.round.discount_percent}% discount` : ""}{a.round.min_check ? `, ${money(a.round.min_check)} minimum` : ""}.{a.round.use_of_funds && <div className="muted">{a.round.use_of_funds}</div>}<div className="muted small">Created in planning; investors see nothing until you open it.</div></Tick>}
                    </>
                  )}
                  {a.safes.length > 0 && (
                    <>
                      <h3 style={{ marginTop: 16 }}>SAFEs</h3>
                      {a.safes.map((s, i) => d.safeExists(s.investor, s.amount)
                        ? <p key={i} className="muted" style={{ margin: "7px 0 7px 26px" }}>{s.investor} · {money(s.amount)} <span className="badge grey">already recorded</span></p>
                        : <Tick key={i} name={`s_${i}`}><strong>{s.investor}</strong> · {money(s.amount)}{s.valuation_cap ? ` at a ${money(s.valuation_cap, true)} cap` : ", no cap"}{s.discount_percent ? `, ${s.discount_percent}% discount` : ""} <span className="muted">· {s.type === "post" ? "post-money" : "pre-money"}{s.mfn ? ", MFN" : ""}{s.signed_on ? `, signed ${s.signed_on}` : ""}</span></Tick>)}
                    </>
                  )}
                  {a.unsure.length > 0 && (
                    <div className="notice warn" style={{ marginTop: 16 }}>
                      <strong>It was not sure about</strong>
                      <ul style={{ margin: "6px 0 0" }}>{a.unsure.map((u, i) => <li key={i}>{u}</li>)}</ul>
                    </div>
                  )}
                  <div className="row" style={{ marginTop: 16 }}>
                    <button className="btn primary">Add the ticked items to the room</button>
                    <button className="btn" formAction={dismissProposalAction} formNoValidate>Discard all of it</button>
                  </div>
                  <p className="muted small" style={{ marginTop: 10 }}>An AI read your documents, and AIs make mistakes, especially with share counts and SAFE terms. Check the numbers against the signed documents.</p>
                </form>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <h2>1. Connect your assistant</h2>
        <p style={{ maxWidth: "64ch" }}>Give Claude, ChatGPT, Grok or any MCP assistant a private key to this room. It can only send suggestions, and cannot read anything unless you tick the box below.</p>
        {fresh && (
          <div className="notice" style={{ background: "var(--warn-soft)", color: "var(--ink)" }}>
            <strong>Your connector address. Copy it now; it will not be shown again.</strong>
            <div className="template" style={{ margin: "8px 0", wordBreak: "break-all", background: "var(--surface)" }}>{fresh.address}</div>
            <div className="row">
              <CopyButton text={fresh.address} label="Copy address" />
              <form action={hideConnectorAction}><button className="btn small">I have copied it</button></form>
            </div>
            <details style={{ marginTop: 10 }}>
              <summary>Safer, if your assistant lets you add a key, token or header</summary>
              <p className="small" style={{ margin: "8px 0 4px" }}>Use this address, which contains no secret:</p>
              <div className="template" style={{ margin: "0 0 6px", wordBreak: "break-all", background: "var(--surface)" }}>{fresh.plain}</div>
              <CopyButton text={fresh.plain} label="Copy address" />
              <p className="small" style={{ margin: "10px 0 4px" }}>and give it this as the API key or bearer token (sent as <code>Authorization: Bearer …</code>):</p>
              <div className="template" style={{ margin: "0 0 6px", wordBreak: "break-all", background: "var(--surface)" }}>{fresh.key}</div>
              <CopyButton text={fresh.key} label="Copy key" />
            </details>
            <p className="small" style={{ margin: "10px 0 0" }}>Treat it like a password. You will get a note the first time it is used; if that surprises you, turn it off.</p>
          </div>
        )}
        <form action={createConnectorAction} style={{ maxWidth: 520 }}>
          <div className="inline-form">
            <Field label="Which assistant is it for?"><input name="label" maxLength={60} placeholder="e.g. Claude" /></Field>
            <Field label="Works for">
              <select name="days" defaultValue="7">
                {CONNECTOR_DAYS.map((d) => <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>)}
              </select>
            </Field>
          </div>
          <label className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", margin: "10px 0" }}>
            <input type="checkbox" name="can_read" style={{ marginTop: 4 }} />
            <span>Also let it see what is already in the room <span className="muted">(company profile, team, cap table, rounds and SAFEs). Leave this off unless you need it: with it off, a leaked key reveals nothing.</span></span>
          </label>
          <button className="btn primary">Create a connector</button>
        </form>
        {connectors.length > 0 && (
          <ul className="quiet-list" style={{ marginTop: 14, maxWidth: 560 }}>
            {connectors.map((c) => (
              <li key={c.id} className="spread">
                <span>{c.label} <span className="muted small">· {c.can_read ? "can read and suggest" : "suggestions only"} · {c.last_used_at ? `last used ${ago(c.last_used_at)}` : "not used yet"} · {c.days_left < 1 ? "expires today" : `expires in ${c.days_left} day${c.days_left === 1 ? "" : "s"}`}</span></span>
                <form action={revokeConnectorAction}><input type="hidden" name="id" value={c.id} /><button className="linkbtn small danger">Turn off</button></form>
              </li>
            ))}
          </ul>
        )}
        <AssistantHelp />
      </div>

      <div className="card">
        <h2>2. Give it your documents</h2>
        <p style={{ maxWidth: "64ch" }}>In a new chat, attach what you have (deck, certificate of incorporation, stock agreements, signed SAFEs) and say:</p>
        <div className="template" style={{ maxWidth: 620 }}>Read the attached documents and fill in my data room using the data room connector. Only use what the documents say.</div>
        <p style={{ marginTop: 8 }}><CopyButton text="Read the attached documents and fill in my data room using the data room connector. Only use what the documents say." label="Copy that message" /></p>
        <details style={{ marginTop: 6 }}>
          <summary>My assistant does not support connectors</summary>
          <p className="muted" style={{ maxWidth: "64ch" }}>Use copy and paste instead. Copy this prompt, paste it into your assistant together with your documents, then paste its whole reply into the box.</p>
          <p><CopyButton text={prompt} label="Copy the prompt" /></p>
          <form action={pasteAnswerAction}>
            <Field label="Paste the assistant's reply here"><textarea name="answer" rows={6} required placeholder={'```json\n{ "company": { … }, "team": [ … ] }\n```'} /></Field>
            <button className="btn">Show me what it found</button>
          </form>
        </details>
      </div>

      <div className="card">
        <h2>3. Review, then put the files in the room</h2>
        <p style={{ maxWidth: "64ch" }}>Tick and apply the suggestions at the top of this page. Your assistant cannot upload files, so drop them in the box below; it tells the room what each one is, and they are named and filed for you.</p>
        <p className="muted small" style={{ maxWidth: "64ch" }}>Your documents go to the AI service you choose, under its terms. This data room never sends your files anywhere.</p>
      </div>
      <FilingBox back="/fill" heading="Put the files in the room" />
      <MissingDocs back="/fill" heading="Files the room is still missing" />
    </>
  );
}
