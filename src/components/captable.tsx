import type { Conversion } from "@/lib/captable";
import { money, num, pct } from "@/lib/format";

/** Before / after-SAFEs / after-round ownership table for a simulated priced round. */
export function ProFormaTable({ c }: { c: Extract<Conversion, { ok: true }> }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Holder</th>
            <th className="num">Today</th>
            <th className="num">After SAFEs convert</th>
            <th className="num">Shares after round</th>
            <th className="num">After the round</th>
          </tr>
        </thead>
        <tbody>
          {c.rows.map((r, i) => (
            <tr key={i}>
              <td>{r.label}</td>
              <td className="num">{r.before.shares ? pct(r.before.pct) : "—"}</td>
              <td className="num">{r.afterSafes.shares ? pct(r.afterSafes.pct) : "—"}</td>
              <td className="num">{num(r.afterRound.shares)}</td>
              <td className="num"><strong>{pct(r.afterRound.pct)}</strong></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{num(c.totals.before)} sh</td>
            <td className="num">{num(c.totals.afterSafes)} sh</td>
            <td className="num">{num(c.totals.afterRound)}</td>
            <td className="num">100.00%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ProFormaStats({ c }: { c: Extract<Conversion, { ok: true }> }) {
  return (
    <div className="grid3" style={{ marginBottom: 12 }}>
      <div><div className="stat">${c.roundPrice.toFixed(4)}</div><div className="stat-label">Round price per share</div></div>
      <div><div className="stat">{money(c.postMoney, true)}</div><div className="stat-label">Post-money valuation</div></div>
      <div><div className="stat">{pct(c.founders.afterRound, 1)}</div><div className="stat-label">Founders after the round (from {pct(c.founders.before, 1)} today)</div></div>
    </div>
  );
}
