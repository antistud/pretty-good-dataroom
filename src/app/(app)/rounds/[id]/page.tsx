import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { q } from "@/lib/db";
import { fmtDate, money, pct } from "@/lib/format";
import { safeOwnershipToday, simulate } from "@/lib/captable";
import {
  STATUS_LABEL, closingChecklist, getRound, holderInputs, readyChecklist, roundTotals, safeInputs,
  type CheckItem, type SafeRow,
} from "@/lib/rounds";
import { Flash, Hint, PageHead } from "@/components/ui";
import { ProFormaStats, ProFormaTable } from "@/components/captable";
import { RaiseProgress, RoundFields } from "@/components/rounds";
import { deleteRoundAction, setRoundStatusAction, toggleCheckAction, updateRoundAction } from "../actions";

function Checklist({ items, roundId, list }: { items: CheckItem[]; roundId: number; list: "ready" | "closing" }) {
  const next = items.find((i) => !i.done);
  return (
    <ul className="steps">
      {items.map((i) => (
        <li key={i.key} className={i.done ? "done" : i === next ? "next" : ""}>
          <span className="tick">✓</span>
          <div className="step-body">
            <div className="step-title">{i.title}</div>
            <div className="muted small">{i.help}</div>
          </div>
          <div className="row">
            {!i.done && <Link className={`btn small ${i === next ? "primary" : ""}`} href={i.href}>{i === next ? "Do this next" : "Go"}</Link>}
            {!i.auto && (
              <form action={toggleCheckAction}>
                <input type="hidden" name="id" value={roundId} />
                <input type="hidden" name="list" value={list} />
                <input type="hidden" name="key" value={i.key} />
                <button className="btn small">{i.done ? "Undo" : "Mark done"}</button>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function RoundDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireStaff();
  const id = Number((await params).id);
  const r = getRound(id);
  if (!r) notFound();
  const t = roundTotals(id);
  const safes = q<SafeRow>("SELECT * FROM safes WHERE round_id = ? ORDER BY signed_on, id", id);
  const ready = readyChecklist(id);
  const closing = closingChecklist(id);
  const readyLeft = ready.filter((i) => !i.done).length;
  const closingLeft = closing.filter((i) => !i.done).length;

  const statusBtn = (status: string, label: string, primary = false) => (
    <form action={setRoundStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={`btn ${primary ? "primary" : ""}`}>{label}</button>
    </form>
  );

  const guide = {
    planning: readyLeft
      ? `You are getting ready. ${readyLeft} thing${readyLeft === 1 ? "" : "s"} left on the checklist below. Investors cannot see this round yet.`
      : "Everything on the checklist is done. Open the round when you are ready to start conversations.",
    open: "The round is open. Work your pipeline, record each SAFE on the cap table page as it is committed, and move to closing when you have most of the money lined up.",
    closing: `You are closing. Chase signatures and wires, and work through the closing checklist. ${closingLeft} item${closingLeft === 1 ? "" : "s"} left.`,
    closed: closingLeft ? `The round is closed, with ${closingLeft} closing item${closingLeft === 1 ? "" : "s"} still to finish.` : "The round is closed and everything is tidied up. Well done.",
  }[r.status];

  // Dilution preview.
  const holders = holderInputs();
  const allSafes = safeInputs();
  const sim = r.instrument === "priced" && r.pre_money && holders.length
    ? simulate(holders, allSafes, { preMoney: r.pre_money, newMoney: r.target_amount, poolPct: r.new_pool_pct })
    : null;
  const soldNow = safeOwnershipToday(allSafes);
  const sellsIfFull = r.instrument === "safe" && r.valuation_cap ? r.target_amount / r.valuation_cap : null;
  const otherSold = safeOwnershipToday(safeInputs("WHERE round_id IS NOT ?", id));

  return (
    <>
      <PageHead title={r.name} sub={<><Link href="/rounds">Rounds</Link> · <span className="badge">{STATUS_LABEL[r.status]}</span>{r.opened_at ? ` · opened ${fmtDate(r.opened_at)}` : ""}{r.closed_at ? ` · closed ${fmtDate(r.closed_at)}` : ""}</>}>
        {r.status === "planning" && statusBtn("open", "Open the round", readyLeft === 0)}
        {r.status === "open" && <>{statusBtn("closing", "Start closing", true)}{statusBtn("planning", "Back to planning")}</>}
        {r.status === "closing" && <>{statusBtn("closed", "Close the round", closingLeft === 0)}{statusBtn("open", "Reopen")}</>}
        {r.status === "closed" && statusBtn("closing", "Reopen closing")}
      </PageHead>
      <Flash sp={await searchParams} />
      <Hint title="Where you are">{guide}</Hint>

      <div className="card">
        <h2>Progress</h2>
        <RaiseProgress totals={t} target={r.target_amount} />
        <div className="grid3" style={{ marginTop: 14 }}>
          <div><div className="stat">{money(t.committed)}</div><div className="stat-label">Committed, not signed</div></div>
          <div><div className="stat">{money(t.signed)}</div><div className="stat-label">Signed, waiting for wire</div></div>
          <div><div className="stat">{money(t.wired)}</div><div className="stat-label">Wired</div></div>
        </div>
      </div>

      <div className="card" id="checklist">
        {r.status === "planning" || (r.status === "open" && readyLeft > 0) ? (
          <>
            <h2>Ready to raise checklist</h2>
            <p className="muted">Items tick themselves when the room has what it needs. The rest you tick by hand.</p>
            <Checklist items={ready} roundId={id} list="ready" />
          </>
        ) : r.status === "open" ? (
          <>
            <h2>While the round is open</h2>
            <ul className="steps">
              <li className="next"><span className="tick">✓</span><div className="step-body"><div className="step-title">Work the pipeline every day</div><div className="muted small">Each investor card tells you the next step.</div></div><Link className="btn small primary" href="/pipeline">Open pipeline</Link></li>
              <li><span className="tick">✓</span><div className="step-body"><div className="step-title">Record each commitment as a SAFE</div><div className="muted small">Add it as “committed”, then update it to signed and wired.</div></div><Link className="btn small" href="/captable">Cap table</Link></li>
              <li><span className="tick">✓</span><div className="step-body"><div className="step-title">Answer investor requests quickly</div><div className="muted small">Slow answers stall diligence.</div></div><Link className="btn small" href="/requests">Requests</Link></li>
            </ul>
          </>
        ) : (
          <>
            <h2>Closing checklist</h2>
            <p className="muted">The first three tick themselves from the SAFE records. The rest you tick by hand.</p>
            <Checklist items={closing} roundId={id} list="closing" />
          </>
        )}
        <p className="muted small" style={{ marginTop: 10 }}>This app tracks and guides. It is not legal advice: have your lawyer confirm documents, approvals and filings.</p>
      </div>

      <div className="card">
        <div className="spread"><h2 style={{ margin: 0 }}>Investments in this round</h2><Link className="btn small" href="/captable">Add or edit on the cap table page</Link></div>
        {safes.length === 0 ? (
          <div className="empty" style={{ marginTop: 10 }}>Nothing recorded yet. When an investor commits, add their SAFE on the cap table page and pick this round.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Investor</th><th className="num">Amount</th><th className="num">Cap</th><th className="num">Discount</th><th>Status</th><th>Signed copy</th></tr></thead>
              <tbody>
                {safes.map((s) => (
                  <tr key={s.id}>
                    <td>{s.investor_name}</td>
                    <td className="num">{money(s.amount)}</td>
                    <td className="num">{s.valuation_cap ? money(s.valuation_cap) : "None"}</td>
                    <td className="num">{s.discount ? pct(s.discount, 0) : "None"}</td>
                    <td><span className={`badge ${s.status === "wired" ? "ok" : s.status === "committed" ? "warn" : ""}`}>{s.status}</span></td>
                    <td className="small">{s.document_id ? <Link href={`/documents/${s.document_id}`}>On file</Link> : <span className="badge warn">Missing</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>What this round costs you</h2>
        {r.instrument === "safe" ? (
          sellsIfFull == null ? (
            <p className="muted">Set a valuation cap and a target above and this shows how much of the company the round sells.</p>
          ) : (
            <>
              <div className="grid3">
                <div><div className="stat">{pct(sellsIfFull, 1)}</div><div className="stat-label">Sold if you raise the full {money(r.target_amount, true)} at the {money(r.valuation_cap, true)} cap</div></div>
                <div><div className="stat">{pct(soldNow, 1)}</div><div className="stat-label">Sold on all SAFEs signed so far</div></div>
                <div><div className="stat">{pct(otherSold + sellsIfFull, 1)}</div><div className="stat-label">Total on SAFEs if this round fills</div></div>
              </div>
              <p className="muted small" style={{ marginTop: 10 }}>Post-money SAFE maths: amount ÷ cap. Founders usually aim to sell 10–20% at pre-seed. To see how it converts at your next priced round, use the calculator on the <Link href="/captable#proforma">cap table page</Link>.</p>
            </>
          )
        ) : !sim ? (
          <p className="muted">Set a pre-money valuation and a target above, and enter your cap table, and this shows everyone&apos;s ownership after the round.</p>
        ) : !sim.ok ? (
          <div className="notice error">{sim.error}</div>
        ) : (
          <>
            <ProFormaStats c={sim} />
            <ProFormaTable c={sim} />
            <p className="muted small" style={{ marginTop: 10 }}>Assumes the full target is raised, every SAFE converts, and the pool increase comes out of the pre-money valuation. A planning model only.</p>
          </>
        )}
      </div>

      <div className="card">
        <h2>Round details</h2>
        <form action={updateRoundAction}>
          <input type="hidden" name="id" value={id} />
          <RoundFields r={r} />
          <button className="btn primary">Save round</button>
        </form>
        {r.status === "planning" && safes.length === 0 && (
          <form action={deleteRoundAction} style={{ marginTop: 14 }}>
            <input type="hidden" name="id" value={id} />
            <button className="linkbtn small danger">Delete this round</button>
          </form>
        )}
      </div>
    </>
  );
}
