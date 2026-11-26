import { OwnerLegend, SplitBar, StageBars, VestBar, byGroup } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { ExportBar } from "@/components/Export";
import { Fragment } from "react";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { q } from "@/lib/db";
import { logView } from "@/lib/activity";
import { getDocument, visibleDocuments } from "@/lib/docs";
import { fmtDate, money, num, pct } from "@/lib/format";
import { safeOwnershipToday, simulate } from "@/lib/captable";
import { currentRound, holderInputs, listHolders, safeInputs, type HolderRow, type RoundRow, type SafeRow } from "@/lib/rounds";
import { Field, Flash, Hint, PageHead } from "@/components/ui";
import { ProFormaStats, ProFormaTable } from "@/components/captable";
import { deleteHolderAction, deleteSafeAction, saveHolderAction, saveSafeAction } from "./actions";

const KIND_LABEL: Record<string, string> = { founder: "Founder", employee: "Employee", advisor: "Advisor", investor: "Investor", pool: "Unissued pool" };
const STATUS_BADGE: Record<string, string> = { committed: "warn", signed: "", wired: "ok" };

function parse(v: string | undefined): number | null {
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return v && Number.isFinite(n) ? n : null;
}

export default async function CapTable({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireSection("captable");
  logView(me, "section.view", undefined, undefined, "captable");
  const sp = await searchParams;

  const holders = listHolders();
  const returned = holders.reduce((n, h) => n + h.forfeited, 0);
  const safes = q<SafeRow & { round_name: string | null }>("SELECT s.*, r.name AS round_name FROM safes s LEFT JOIN rounds r ON r.id = s.round_id ORDER BY s.signed_on, s.id");
  const totalShares = holders.reduce((s, h) => s + h.shares, 0);
  const safeTotal = safes.reduce((s, x) => s + x.amount, 0);
  const sold = safeOwnershipToday(safeInputs());

  // Pro-forma defaults: the next priced round if one is planned, otherwise round numbers.
  const priced = q<RoundRow>("SELECT * FROM rounds WHERE instrument = 'priced' AND status != 'closed' ORDER BY id LIMIT 1")[0];
  const topCap = Math.max(0, ...safes.map((s) => s.valuation_cap ?? 0));
  // With nothing planned, show an ordinary-looking example: a valuation above the highest cap, selling 20%.
  const pre = parse(sp.pre) ?? priced?.pre_money ?? (topCap > 0 ? topCap * 2.5 : 10_000_000);
  const newMoney = parse(sp.money) ?? (priced?.target_amount || Math.round(pre / 4));
  const example = parse(sp.pre) == null && !priced;
  // MFN step-downs are an assumption about how each clause reads, so the model can be run with and without them.
  const useMfn = sp.mfn !== "0";
  const anyMfn = safes.some((x) => x.mfn);
  const modelSafes = safeInputs().map((x) => (useMfn ? x : { ...x, mfn: false }));
  const poolPct = parse(sp.pool) ?? (priced?.new_pool_pct != null ? priced.new_pool_pct * 100 : 10);
  const sim = holders.length ? simulate(holderInputs(), modelSafes, { preMoney: pre, newMoney, poolPct: poolPct / 100 }) : null;

  const rounds = me.isStaff ? q<RoundRow>("SELECT * FROM rounds ORDER BY id DESC") : [];
  const orgs = me.isStaff ? q<{ id: number; name: string }>("SELECT id, name FROM orgs WHERE kind = 'investor' ORDER BY name") : [];
  const docs = me.isStaff ? visibleDocuments(100) : [];
  const defaultRound = me.isStaff ? currentRound() : undefined;

  const safeForm = (s?: SafeRow) => (
    <form action={saveSafeAction}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid3">
        <Field label="Investor"><input name="investor_name" required maxLength={120} defaultValue={s?.investor_name} /></Field>
        <Field label="Amount ($)"><input name="amount" required inputMode="decimal" defaultValue={s?.amount} /></Field>
        <Field label="Status">
          <select name="status" defaultValue={s?.status ?? "signed"}>
            <option value="committed">Committed (not signed yet)</option>
            <option value="signed">Signed</option>
            <option value="wired">Wired (money received)</option>
          </select>
        </Field>
      </div>
      <div className="grid3">
        <Field label="Valuation cap ($)" hint="Leave blank if there is no cap."><input name="valuation_cap" inputMode="decimal" defaultValue={s?.valuation_cap ?? defaultRound?.valuation_cap ?? ""} /></Field>
        <Field label="Discount (%)" hint="Leave blank for none."><input name="discount" inputMode="decimal" defaultValue={s ? (s.discount ? s.discount * 100 : "") : defaultRound?.discount ? defaultRound.discount * 100 : ""} /></Field>
        <Field label="SAFE type" hint="Almost every SAFE since 2018 is post-money.">
          <select name="kind" defaultValue={s?.kind ?? "post"}><option value="post">Post-money</option><option value="pre">Pre-money</option></select>
        </Field>
      </div>
      <div className="grid3">
        <Field label="Round">
          <select name="round_id" defaultValue={String(s ? s.round_id ?? "" : defaultRound?.id ?? "")}>
            <option value="">Not part of a round</option>
            {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Investor's organisation (optional)">
          <select name="org_id" defaultValue={String(s?.org_id ?? "")}>
            <option value="">None</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Date signed"><input name="signed_on" type="date" defaultValue={s?.signed_on ?? ""} /></Field>
      </div>
      <div className="grid2">
        <Field label="Signed document" hint="Upload the PDF under Documents first, then pick it here.">
          <select name="document_id" defaultValue={String(s?.document_id ?? "")}>
            <option value="">Not attached yet</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Notes"><input name="notes" maxLength={500} defaultValue={s?.notes ?? ""} /></Field>
      </div>
      <div className="row">
        <label className="row"><input type="checkbox" name="mfn" defaultChecked={!!s?.mfn} /> Has a most-favoured-nation (MFN) clause</label>
        <button className="btn primary">{s ? "Save SAFE" : "Add SAFE"}</button>
      </div>
    </form>
  );

  /** One plain sentence about a holder's dates, or nothing when there are none. */
  const vestingLine = (h: HolderRow): string => {
    const schedule = h.vests ? `${h.vest_months}-month vesting${h.cliff_months ? ` with a ${h.cliff_months}-month cliff` : ""}` : "";
    if (h.left && h.kept_shares != null) return `${h.start_date ? `Started ${fmtDate(h.start_date)}. ` : ""}Kept ${num(h.held)} of ${num(h.granted)} shares under the separation paperwork${h.forfeited > 0 ? `; ${num(h.forfeited)} went back to the company` : ""}.`;
    if (h.left && h.vests) return h.forfeited > 0 ? `Started ${fmtDate(h.start_date)}. Kept ${num(h.held)} of ${num(h.granted)} shares; ${num(h.forfeited)} had not vested and went back to the company.` : `Started ${fmtDate(h.start_date)}. Fully vested before leaving.`;
    if (h.left) return h.start_date ? `Here from ${fmtDate(h.start_date)}.` : "";
    if (h.vests) return h.vested >= h.granted ? `Fully vested (${schedule}, from ${fmtDate(h.start_date)}).` : `${num(h.vested)} vested so far; ${schedule} from ${fmtDate(h.start_date)}, complete ${fmtDate(h.fullyVestedOn)}.`;
    if (h.end_date) return `Leaving ${fmtDate(h.end_date)}.`;
    return h.start_date ? `Since ${fmtDate(h.start_date)}.` : "";
  };

  const holderForm = (h?: HolderRow) => (
    <form action={saveHolderAction} className="inline-form">
      {h && <input type="hidden" name="id" value={h.id} />}
      <Field label="Name"><input name="name" maxLength={120} defaultValue={h?.name} placeholder="Jane Founder" /></Field>
      <Field label="Type">
        <select name="kind" defaultValue={h?.kind ?? "founder"}>
          {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Class"><input name="share_class" maxLength={60} defaultValue={h?.share_class ?? "Common"} /></Field>
      <Field label="Shares granted"><input name="shares" required inputMode="decimal" defaultValue={h?.granted} /></Field>
      <Field label="Notes"><input name="notes" maxLength={500} defaultValue={h?.notes ?? ""} /></Field>
      <details className="dates" open={!!(h?.start_date || h?.end_date || h?.vest_months || h?.kept_shares != null)}>
        <summary className="small">Dates and vesting</summary>
        <p className="muted small" style={{ margin: "6px 0 10px", maxWidth: "60ch" }}>Add these when shares vest over time, or when someone has left. A person who leaves before they are fully vested keeps what had vested on their last day; the rest stops counting on the cap table. Leave it all blank for shares that are simply owned.</p>
        <div className="inline-form">
          <Field label="Started"><input type="date" name="start_date" defaultValue={h?.start_date ?? ""} /></Field>
          <Field label="Vests over (months)" hint="Usually 48."><input name="vest_months" inputMode="numeric" defaultValue={h?.vest_months ?? ""} placeholder="48" /></Field>
          <Field label="Cliff (months)" hint="Usually 12."><input name="cliff_months" inputMode="numeric" defaultValue={h?.vest_months ? h?.cliff_months ?? "" : ""} placeholder="12" /></Field>
          <Field label="Left on" hint="Blank if still here."><input type="date" name="end_date" defaultValue={h?.end_date ?? ""} /></Field>
          <Field label="Shares kept on leaving" hint="Only if the paperwork gives a number. It overrides the schedule."><input name="kept_shares" inputMode="decimal" defaultValue={h?.kept_shares ?? ""} /></Field>
        </div>
      </details>
      <button className="btn primary">{h ? "Save" : "Add holder"}</button>
    </form>
  );

  return (
    <>
      <PageHead title="Cap table & SAFEs" sub="Who owns what today, and after a priced round."><ExportBar links={me.canDownload ? [{ href: "/api/export/cap-table.csv", label: "Cap table (CSV)" }, { href: "/api/export/safes.csv", label: "SAFEs (CSV)" }] : []} /></PageHead>
      <Flash sp={sp} />
      {me.isStaff ? (
        <Hint title="Keep this page true">
          Enter every shareholder and the unissued option pool, then every SAFE as it is signed. Investors on the right tier see this page exactly as you do, minus the edit forms. Start with the founders&apos; shares.
        </Hint>
      ) : (
        <Hint title="How to read this page">
          The first table is ownership today, counting the option pool. The second lists the SAFEs: money already invested that turns into shares at the next priced round. The calculator at the bottom shows how it all converts; change the numbers to test your own assumptions.
        </Hint>
      )}

      <div className="grid3">
        <div className="card"><div className="stat-row"><span className="icon-chip"><Icon name="pie" /></span><div><div className="stat">{num(totalShares)}</div><div className="stat-label">Fully diluted shares</div></div></div></div>
        <div className="card"><div className="stat-row"><span className="icon-chip"><Icon name="coins" /></span><div><div className="stat">{money(safeTotal)}</div><div className="stat-label">Raised on {safes.length} SAFE{safes.length === 1 ? "" : "s"}</div></div></div></div>
        <div className="card"><div className="stat-row"><span className="icon-chip"><Icon name="trend" /></span><div><div className="stat">{pct(sold, 1)}</div><div className="stat-label">Sold on SAFEs so far</div></div></div></div>
      </div>

      <div className="card">
        <h2>Ownership today</h2>
        {holders.length > 0 && (
          <>
            <SplitBar shares={byGroup(holders.map((h) => ({ kind: h.kind, value: h.shares })))} label="Ownership today" />
            <OwnerLegend groups={byGroup(holders.map((h) => ({ kind: h.kind, value: h.shares }))).map((x) => x.group)} />
          </>
        )}
        {holders.length === 0 ? (
          <div className="empty">{me.isStaff ? "No shareholders yet. Add the founders below." : "The founders have not filled this in yet."}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Holder</th><th>Type</th><th>Class</th><th className="num">Shares</th><th className="num">Fully diluted</th></tr></thead>
              <tbody>
                {holders.map((h) => (
                  <Fragment key={h.id}>
                  <tr>
                    <td>
                      {h.name}{h.left && <span className="badge grey" style={{ marginLeft: 8 }}>Left {fmtDate(h.end_date)}</span>}
                      {h.vests && <VestBar vested={h.vested} granted={h.granted} left={h.left} />}
                      {vestingLine(h) && <div className="muted small">{vestingLine(h)}</div>}
                      {h.notes && <div className="muted small">{h.notes}</div>}
                    </td>
                    <td className="small">{KIND_LABEL[h.kind]}</td>
                    <td className="small">{h.share_class}</td>
                    <td className="num">{num(h.shares)}</td>
                    <td className="num">{pct(totalShares ? h.shares / totalShares : 0)}</td>
                  </tr>
                  {me.isStaff && (
                    <tr className="edit-row">
                      <td colSpan={5}>
                        <details>
                          <summary className="small">Edit {h.name}</summary>
                          <div className="edit-panel">
                            {holderForm(h)}
                            <form action={deleteHolderAction} style={{ marginTop: 8 }}><input type="hidden" name="id" value={h.id} /><button className="linkbtn small danger">Remove {h.name}</button></form>
                          </div>
                        </details>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3}>Total</td><td className="num">{num(totalShares)}</td><td className="num">100.00%</td></tr></tfoot>
            </table>
          </div>
        )}
        {returned > 0 && <p className="muted small" style={{ marginTop: 10 }}>{num(returned)} unvested shares from people who have left are not counted above.{me.isStaff && " If they were options that return to your pool, add them to the pool row."}</p>}
        {me.isStaff && (
          <>
            <hr />
            <h3>Add a holder</h3>
            <p className="muted small">For the option pool, choose “Unissued pool” and enter the shares reserved but not yet granted.</p>
            {holderForm()}
          </>
        )}
      </div>

      <div className="card">
        <h2>SAFEs</h2>
        {safes.length === 0 ? (
          <div className="empty">No SAFEs recorded yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Investor</th><th className="num">Amount</th><th className="num">Cap</th><th className="num">Discount</th><th>Terms</th><th>Status</th><th>Document</th></tr></thead>
              <tbody>
                {safes.map((s) => {
                  const doc = s.document_id ? getDocument(s.document_id) : undefined;
                  const canOpen = doc && doc.effective_level <= me.level;
                  return (
                    <Fragment key={s.id}>
                    <tr>
                      <td>{s.investor_name}<div className="muted small">{[s.round_name, s.signed_on && fmtDate(s.signed_on)].filter(Boolean).join(" · ")}</div></td>
                      <td className="num">{money(s.amount)}</td>
                      <td className="num">{s.valuation_cap ? money(s.valuation_cap) : "None"}</td>
                      <td className="num">{s.discount ? pct(s.discount, 0) : "None"}</td>
                      <td className="small">{s.kind === "post" ? "Post-money" : "Pre-money"}{s.mfn ? " · MFN" : ""}</td>
                      <td><span className={`badge ${STATUS_BADGE[s.status]}`}>{s.status}</span></td>
                      <td className="small">{canOpen ? <Link href={`/documents/${doc!.id}`}>{doc!.name}</Link> : doc ? <span className="muted">On file</span> : <span className="muted">—</span>}</td>
                    </tr>
                    {me.isStaff && (
                      <tr className="edit-row">
                        <td colSpan={7}>
                          <details>
                            <summary className="small">Edit {s.investor_name}</summary>
                            <div className="edit-panel">
                              {safeForm(s)}
                              <form action={deleteSafeAction} style={{ marginTop: 8 }}><input type="hidden" name="id" value={s.id} /><button className="linkbtn small danger">Remove this SAFE</button></form>
                            </div>
                          </details>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot><tr><td>Total</td><td className="num">{money(safeTotal)}</td><td colSpan={5} /></tr></tfoot>
            </table>
          </div>
        )}
        <details style={{ marginTop: 12 }}>
          <summary>How SAFEs convert, in plain words</summary>
          <div className="prose">
            <p>A SAFE is money invested now that becomes shares later, at the next priced round (usually the seed or Series A). Nobody gets shares on the day they sign.</p>
            <ul>
              <li><strong>Valuation cap.</strong> The highest company value the SAFE can convert at. On a post-money SAFE the maths is simple: amount ÷ cap = the share of the company the investor holds once all SAFEs convert. $500k on a $5M cap is 10%.</li>
              <li><strong>Discount.</strong> A percentage off the price new investors pay in the priced round. If a SAFE has both a cap and a discount, the investor gets whichever gives more shares.</li>
              <li><strong>MFN.</strong> “Most favoured nation”: if a later SAFE has better terms, this investor can take those terms instead. It never reaches back to earlier SAFEs.</li>
              <li><strong>Post-money or pre-money.</strong> Post-money SAFEs fix the investor&apos;s percentage; each new SAFE dilutes the founders, not earlier SAFE holders. Pre-money SAFEs (older) dilute each other.</li>
              <li><strong>Then the round happens.</strong> Everyone, SAFE holders included, is diluted by the new investors and by any increase in the option pool.</li>
            </ul>
            <p className="muted small">This is a planning model, not legal or tax advice. The signed documents decide the real numbers.</p>
          </div>
        </details>
        {me.isStaff && (
          <>
            <hr />
            <h3>Add a SAFE</h3>
            {safeForm()}
          </>
        )}
      </div>

      <div className="card" id="proforma">
        <h2>What a priced round would look like</h2>
        <p className="muted">Try the terms of a future round. Nothing here is saved.</p>
        <form method="get" action="/captable#proforma" className="inline-form" style={{ marginBottom: 16 }}>
          <Field label="Pre-money valuation ($)"><input name="pre" inputMode="decimal" defaultValue={pre} /></Field>
          <Field label="New money raised ($)"><input name="money" inputMode="decimal" defaultValue={newMoney} /></Field>
          <Field label="Option pool after round (%)"><input name="pool" inputMode="decimal" defaultValue={poolPct} /></Field>
          {anyMfn && (
            <Field label="MFN clauses">
              <select name="mfn" defaultValue={useMfn ? "1" : "0"}>
                <option value="1">Take better later terms</option>
                <option value="0">Convert as written</option>
              </select>
            </Field>
          )}
          <button className="btn">Recalculate</button>
        </form>
        {example && <p className="notice warn" style={{ marginTop: -4 }}>These are example terms, not a plan: a {money(pre, true)} pre-money valuation raising {money(newMoney, true)}. Put in your own numbers.</p>}
        {!sim ? (
          <div className="empty">Add shareholders first and the model appears here.</div>
        ) : !sim.ok ? (
          <div className="notice error">{sim.error}</div>
        ) : (
          <>
            <ProFormaStats c={sim} />
            <StageBars
              stages={[
                { label: "Today", shares: byGroup(sim.rows.map((r) => ({ kind: r.kind, value: r.before.shares }))) },
                ...(sim.safes.length ? [{ label: "After SAFEs convert", shares: byGroup(sim.rows.map((r) => ({ kind: r.kind, value: r.afterSafes.shares }))) }] : []),
                { label: "After the round", shares: byGroup(sim.rows.map((r) => ({ kind: r.kind, value: r.afterRound.shares }))) },
              ]}
            />
            <ProFormaTable c={sim} />
            {sim.safes.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>How each SAFE converts</h3>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>SAFE</th><th className="num">Amount</th><th className="num">Price per share</th><th className="num">Shares</th><th>Converts at</th></tr></thead>
                    <tbody>
                      {sim.safes.map((s, i) => (
                        <tr key={i}>
                          <td>{s.name}</td>
                          <td className="num">{money(s.amount)}</td>
                          <td className="num">${s.price.toFixed(4)}</td>
                          <td className="num">{num(s.shares)}</td>
                          <td className="small">
                            {s.method === "cap" ? `Its ${money(s.effCap, true)} cap` : s.method === "discount" ? `The round price less ${pct(s.effDiscount, 0)}` : "The round price"}
                            {s.inherited ? " (terms taken from another SAFE via MFN)" : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <p className="muted small" style={{ marginTop: 10 }}>
              Assumes the option pool increase comes out of the pre-money valuation. An MFN SAFE is assumed to take the best cap and discount of any SAFE signed after it; whether a clause really does that is a question for your lawyer. A planning model only; your lawyer&apos;s closing spreadsheet is the real one.
            </p>
          </>
        )}
      </div>
    </>
  );
}
