import { requireSection } from "@/lib/auth";
import { getSetting, q } from "@/lib/db";
import { logView } from "@/lib/activity";
import { ago, levelName } from "@/lib/format";
import { Field, Flash, Hint, LevelSelect, PageHead } from "@/components/ui";
import { offerIntroAction, saveAskAction, setAskStatusAction, setOfferStatusAction } from "./actions";

type Ask = { id: number; title: string; detail: string | null; blurb: string | null; min_level: number; status: string; created_at: string; offers: number };
type Offer = {
  id: number; ask_id: number | null; contact_name: string; contact_detail: string | null; note: string | null; status: string; created_at: string;
  ask_title: string | null; offerer: string | null; offerer_email: string | null; org_name: string | null;
};

const OFFER_LABEL: Record<string, string> = { offered: "Offered", intro_made: "Intro made", met: "Met", closed: "Closed" };
const OFFER_BADGE: Record<string, string> = { offered: "warn", intro_made: "", met: "ok", closed: "grey" };
const NEXT: Record<string, { status: string; label: string }[]> = {
  offered: [{ status: "intro_made", label: "Intro made" }, { status: "closed", label: "Close" }],
  intro_made: [{ status: "met", label: "We met" }, { status: "closed", label: "Close" }],
  met: [{ status: "closed", label: "Close" }],
  closed: [{ status: "offered", label: "Re-open" }],
};

const OFFER_SELECT = `SELECT o.id, o.ask_id, o.contact_name, o.contact_detail, o.note, o.status, o.created_at,
  a.title AS ask_title, u.name AS offerer, u.email AS offerer_email, g.name AS org_name
  FROM intro_offers o LEFT JOIN intro_asks a ON a.id = o.ask_id LEFT JOIN users u ON u.id = o.user_id LEFT JOIN orgs g ON g.id = u.org_id`;

function OfferForm({ askId }: { askId?: number }) {
  return (
    <form action={offerIntroAction}>
      {askId ? <input type="hidden" name="ask_id" value={askId} /> : null}
      <div className="grid2">
        <Field label="Who can you introduce?"><input name="contact_name" required maxLength={200} placeholder="Name and company" /></Field>
        <Field label="How do you know them?"><input name="contact_detail" maxLength={500} placeholder="e.g. former colleague, LinkedIn URL" /></Field>
      </div>
      <Field label="Anything the founders should know (optional)"><textarea name="note" maxLength={2000} style={{ minHeight: 60 }} /></Field>
      <button className="btn primary">{askId ? "I can intro" : "Offer this introduction"}</button>
    </form>
  );
}

export default async function Intros({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireSection("intros");
  const sp = await searchParams;
  const company = getSetting("company_name");

  if (!me.isStaff) {
    logView(me, "section.view", undefined, undefined, "intros");
    const asks = q<Ask>("SELECT *, 0 AS offers FROM intro_asks WHERE status = 'open' AND min_level <= ? ORDER BY created_at DESC", me.level);
    const mine = q<Offer>(`${OFFER_SELECT} WHERE o.user_id = ? ORDER BY o.created_at DESC`, me.id);
    return (
      <>
        <PageHead title="Set Me Up" sub={`The people ${company} would most like to meet right now.`} />
        <Flash sp={sp} />
        <Hint title="The most useful thing you can do">
          One warm introduction is worth more than almost anything else at this stage. Read the list below. If you know someone who fits,
          press <strong>I can intro</strong> and tell us who. The founders will follow up with you, and each ask has a short blurb you can
          forward so you do not have to write anything yourself.
        </Hint>

        {asks.length === 0 && <div className="empty">No specific asks right now. If you know someone the founders should meet, tell them below.</div>}
        {asks.map((a) => (
          <div className="card" key={a.id}>
            <h2>{a.title}</h2>
            {a.detail && <p style={{ whiteSpace: "pre-wrap" }}>{a.detail}</p>}
            {a.blurb && (
              <Field label="Forwardable blurb" hint="Copy this into an email or message to the person you are introducing.">
                <textarea readOnly defaultValue={a.blurb} />
              </Field>
            )}
            <details>
              <summary>I can intro</summary>
              <OfferForm askId={a.id} />
            </details>
          </div>
        ))}

        <div className="card">
          <h2>Know someone else we should meet?</h2>
          <p className="muted">A customer, an advisor, a future hire, another investor. If you think they would be useful, they probably are.</p>
          <OfferForm />
        </div>

        {mine.length > 0 && (
          <div className="card">
            <h2>Your introductions</h2>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Person</th><th>For</th><th>Status</th><th>Offered</th></tr></thead>
              <tbody>
                {mine.map((o) => (
                  <tr key={o.id}>
                    <td><strong>{o.contact_name}</strong></td>
                    <td className="small">{o.ask_title ?? "Your own suggestion"}</td>
                    <td><span className={`badge ${OFFER_BADGE[o.status]}`}>{OFFER_LABEL[o.status]}</span></td>
                    <td className="small muted">{ago(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </>
    );
  }

  // Staff view
  const asks = q<Ask>("SELECT a.*, (SELECT COUNT(*) FROM intro_offers o WHERE o.ask_id = a.id) AS offers FROM intro_asks a ORDER BY a.status = 'closed', a.created_at DESC");
  const offers = q<Offer>(`${OFFER_SELECT} ORDER BY o.created_at DESC`);
  const groups = ["offered", "intro_made", "met", "closed"].map((s) => ({ status: s, list: offers.filter((o) => o.status === s) }));

  const askForm = (a?: Ask) => (
    <form action={saveAskAction}>
      {a && <input type="hidden" name="ask_id" value={a.id} />}
      <Field label="Who do you want to meet?" hint="A named person, a company, or a type of person. Be specific: “Head of benefits at a 500–5,000 person employer” beats “enterprise buyers”.">
        <input name="title" required maxLength={200} defaultValue={a?.title ?? ""} />
      </Field>
      <Field label="Why, in a sentence or two"><textarea name="detail" maxLength={2000} defaultValue={a?.detail ?? ""} style={{ minHeight: 60 }} /></Field>
      <Field label="Forwardable blurb" hint="Three or four sentences an introducer can paste into an email: what you do, why this person, what you are asking for.">
        <textarea name="blurb" maxLength={3000} defaultValue={a?.blurb ?? ""} />
      </Field>
      <LevelSelect value={a?.min_level ?? 0} label="Who can see this ask" />
      <button className={`btn ${a ? "" : "primary"}`}>{a ? "Save changes" : "Add ask"}</button>
    </form>
  );

  return (
    <>
      <PageHead title="Set Me Up" sub="Tell your investors and supporters exactly who you want to meet, and track the introductions they offer." />
      <Flash sp={sp} />
      <Hint title="How to use this">
        Keep three to five specific asks open at a time. Each one appears on this page for the audience you choose and in every update email.
        When someone offers an intro, thank them the same day, send the blurb, then move the offer along: intro made, met, closed.
        Marking “intro made” sends the introducer a thank-you email.
      </Hint>

      <div className="card">
        <h2>Introductions offered</h2>
        {offers.length === 0 ? (
          <div className="empty">No offers yet. Add an ask below and publish an update; that is when most offers come in.</div>
        ) : (
          groups.filter((g) => g.list.length > 0).map((g) => (
            <div key={g.status} style={{ marginBottom: 14 }}>
              <h3><span className={`badge ${OFFER_BADGE[g.status]}`}>{OFFER_LABEL[g.status]}</span> <span className="muted small">{g.list.length}</span></h3>
              <div className="table-wrap"><table className="table"><tbody>
                {g.list.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.contact_name}</strong>
                      {o.contact_detail && <div className="small">{o.contact_detail}</div>}
                      {o.note && <div className="small muted" style={{ whiteSpace: "pre-wrap" }}>{o.note}</div>}
                    </td>
                    <td className="small">
                      From <strong>{o.offerer ?? "removed user"}</strong>{o.org_name ? ` (${o.org_name})` : ""}
                      {o.offerer_email && <div className="muted">{o.offerer_email}</div>}
                      <div className="muted">{o.ask_title ? `For: ${o.ask_title}` : "Their own suggestion"} · {ago(o.created_at)}</div>
                    </td>
                    <td className="right nowrap">
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        {NEXT[o.status].map((n) => (
                          <form action={setOfferStatusAction} key={n.status}>
                            <input type="hidden" name="offer_id" value={o.id} />
                            <input type="hidden" name="status" value={n.status} />
                            <button className="btn small">{n.label}</button>
                          </form>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody></table></div>
            </div>
          ))
        )}
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Add an ask</h2>
          {askForm()}
        </div>
        <div className="card">
          <h2>Your asks</h2>
          {asks.length === 0 && <div className="empty">Nothing yet. Add your first ask on the left.</div>}
          <div className="stack">
            {asks.map((a) => (
              <div key={a.id}>
                <div className="spread">
                  <strong>{a.title}</strong>
                  <span className="row">
                    <span className="badge grey">{levelName(a.min_level)}</span>
                    {a.status === "closed" ? <span className="badge grey">Closed</span> : <span className="badge ok">Open</span>}
                  </span>
                </div>
                <div className="muted small">{a.offers} {a.offers === 1 ? "offer" : "offers"} · added {ago(a.created_at)}</div>
                <div className="row small" style={{ marginTop: 4 }}>
                  <form action={setAskStatusAction}>
                    <input type="hidden" name="ask_id" value={a.id} />
                    <input type="hidden" name="status" value={a.status === "closed" ? "open" : "closed"} />
                    <button className="linkbtn small">{a.status === "closed" ? "Re-open" : "Close"}</button>
                  </form>
                </div>
                <details>
                  <summary className="small">Edit</summary>
                  {askForm(a)}
                </details>
                <hr />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
