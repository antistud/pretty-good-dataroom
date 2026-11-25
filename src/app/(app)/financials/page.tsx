import { TwoLines } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { ExportBar } from "@/components/Export";
import Link from "next/link";
import { canSeeSection, requireSection } from "@/lib/auth";
import { q } from "@/lib/db";
import { logView } from "@/lib/activity";
import { visibleDocuments, visibleFolders } from "@/lib/docs";
import { money, monthLabel, num } from "@/lib/format";
import { Field, Flash, Hint, PageHead } from "@/components/ui";
import { deleteMonthAction, saveMonthAction } from "./actions";

type Row = { month: string; revenue: number; expenses: number; cash: number; notes: string | null };

/** Runway at a given month: cash divided by the average net burn of that month and the two before it. */
function runwayAt(rows: Row[], i: number): number | null {
  const window = rows.slice(Math.max(0, i - 2), i + 1);
  const avgBurn = window.reduce((s, r) => s + (r.expenses - r.revenue), 0) / window.length;
  return avgBurn > 0 ? rows[i].cash / avgBurn : null;
}

function CashChart({ rows }: { rows: Row[] }) {
  const W = 640, H = 180, padL = 8, padB = 22, padT = 10;
  const max = Math.max(...rows.map((r) => r.cash), 1);
  const slot = (W - padL * 2) / rows.length;
  const barW = Math.min(46, slot * 0.7);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cash at the end of each month" style={{ width: "100%", height: "auto", maxHeight: 220 }}>
      <line x1={padL} x2={W - padL} y1={H - padB} y2={H - padB} stroke="var(--line)" />
      {rows.map((r, i) => {
        const h = Math.max(0, (r.cash / max) * (H - padB - padT));
        const x = padL + slot * i + (slot - barW) / 2;
        return (
          <g key={r.month}>
            <rect x={x} y={H - padB - h} width={barW} height={h} rx={3} fill="var(--brand)">
              <title>{`${monthLabel(r.month)}: ${money(r.cash)}`}</title>
            </rect>
            {(rows.length <= 12 || i % 2 === 0) && (
              <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{r.month.slice(2)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default async function Financials({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireSection("financials");
  logView(me, "section.view", undefined, undefined, "financials");
  const rows = q<Row>("SELECT month, revenue, expenses, cash, notes FROM financials ORDER BY month");
  const last = rows[rows.length - 1];
  const lastIdx = rows.length - 1;
  const recent = rows.slice(-3);
  const avgBurn = recent.length ? recent.reduce((s, r) => s + (r.expenses - r.revenue), 0) / recent.length : 0;
  const runway = last ? runwayAt(rows, lastIdx) : null;

  const finFolderIds = canSeeSection(me, "documents")
    ? visibleFolders(me.level).filter((f) => /financ/i.test(f.name)).map((f) => f.id)
    : [];
  const docs = finFolderIds.length ? visibleDocuments(me.level).filter((d) => finFolderIds.includes(d.folder_id)) : [];
  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <>
      <PageHead title="Financials" sub="Cash, burn and runway, month by month."><ExportBar links={me.canDownload ? [{ href: "/api/export/financials.csv", label: "Download CSV" }] : []} /></PageHead>
      <Flash sp={await searchParams} />
      {me.isStaff ? (
        <Hint title="What to do here">Once a month, add one row: money in, money out, and the bank balance on the last day. These numbers pre-fill your investor update.</Hint>
      ) : (
        <Hint title="How to read this">Net burn is monthly spending after revenue. Runway is cash divided by the average burn of the last three months.</Hint>
      )}

      {rows.length === 0 ? (
        <div className="empty">{me.isStaff ? "No months entered yet. Add your first month below." : "No financials have been published yet."}</div>
      ) : (
        <>
          <div className="grid3">
            <div className="card"><div className="stat-row"><span className="icon-chip"><Icon name="bank" /></span><div><div className="stat">{money(last.cash)}</div><div className="stat-label">Cash at end of {monthLabel(last.month)}</div></div></div></div>
            <div className="card"><div className="stat-row"><span className="icon-chip"><Icon name="trend" /></span><div>
              <div className="stat">{avgBurn > 0 ? money(avgBurn) : "Profitable"}</div>
              <div className="stat-label">{avgBurn > 0 ? `Net burn a month (last ${recent.length})` : "Revenue covers expenses"}</div>
            </div></div></div>
            <div className="card"><div className="stat-row"><span className="icon-chip"><Icon name="clock" /></span><div>
              <div className="stat">{runway == null ? "Not burning" : `${num(runway, 1)} months`}</div>
              <div className="stat-label">Runway</div>
            </div></div></div>
          </div>

          {rows.length > 1 && (
            <div className="card">
              <h2>Cash at month end</h2>
              <CashChart rows={rows.slice(-18)} />
            </div>
          )}

          {rows.length > 1 && (
            <div className="card">
              <h2>Money in and out</h2>
              <TwoLines rows={rows.slice(-18).map((r) => ({ label: r.month.slice(2), a: r.revenue, b: r.expenses }))} a="Revenue" b="Expenses" />
            </div>
          )}

          <div className="card">
            <h2>Month by month</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Month</th><th className="num">Revenue</th><th className="num">Expenses</th><th className="num">Net burn</th><th className="num">Cash</th><th className="num">Runway</th><th>Notes</th>{me.isStaff && <th />}</tr></thead>
                <tbody>
                  {[...rows].reverse().map((r) => {
                    const i = rows.indexOf(r);
                    const burn = r.expenses - r.revenue;
                    const rw = runwayAt(rows, i);
                    return (
                      <tr key={r.month}>
                        <td className="nowrap">{monthLabel(r.month)}</td>
                        <td className="num">{money(r.revenue)}</td>
                        <td className="num">{money(r.expenses)}</td>
                        <td className="num">{burn > 0 ? money(burn) : <span className="badge ok">profitable</span>}</td>
                        <td className="num">{money(r.cash)}</td>
                        <td className="num">{rw == null ? "—" : `${num(rw, 1)} mo`}</td>
                        <td className="small muted">{r.notes}</td>
                        {me.isStaff && (
                          <td className="right"><form action={deleteMonthAction}><input type="hidden" name="month" value={r.month} /><button className="linkbtn small danger">Delete</button></form></td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {docs.length > 0 && (
        <div className="card">
          <h2>Supporting files</h2>
          <ul>
            {docs.map((d) => <li key={d.id}><Link href={`/documents/${d.id}`}>{d.name}</Link></li>)}
          </ul>
        </div>
      )}

      {me.isStaff && (
        <div className="card">
          <h2>Add or correct a month</h2>
          <p className="muted small">Saving a month that already exists replaces it.</p>
          <form action={saveMonthAction}>
            <div className="inline-form">
              <Field label="Month"><input name="month" type="month" required defaultValue={thisMonth} /></Field>
              <Field label="Revenue ($)"><input name="revenue" inputMode="decimal" placeholder="0" /></Field>
              <Field label="Expenses ($)"><input name="expenses" inputMode="decimal" placeholder="0" /></Field>
              <Field label="Cash at month end ($)"><input name="cash" inputMode="decimal" required /></Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Notes (optional)" hint="Anything unusual, such as a one-off cost or a grant received."><input name="notes" maxLength={500} /></Field>
            </div>
            <button className="btn primary">Save month</button>
          </form>
        </div>
      )}
    </>
  );
}
