import Link from "next/link";
import { canSeeSection, requireUser } from "@/lib/auth";
import { getSetting, q } from "@/lib/db";
import { logView } from "@/lib/activity";
import { fmtDate, money, monthLabel, num, pct } from "@/lib/format";
import { renderMarkdown } from "@/lib/md";
import { visibleUpdates } from "@/lib/onboarding";
import { roundTotals } from "@/lib/rounds";
import { safeOwnershipToday } from "@/lib/captable";
import { safeInputs } from "@/lib/rounds";
import { Md, PageHead } from "@/components/ui";
import { ExportBar } from "@/components/Export";
import { listHolders } from "@/lib/rounds";

/**
 * Everything this person may see, on one page laid out for paper:
 * the summary an investor takes to a partner meeting.
 */
export default async function Pack() {
  const me = await requireUser();
  const see = (s: Parameters<typeof canSeeSection>[1]) => canSeeSection(me, s);
  const company = getSetting("company_name");
  logView(me, "page.view", "page", null, "summary");

  const overview = see("overview") ? getSetting("overview_md").trim() : "";
  const facts = see("overview")
    ? ([["Stage", "fact_stage"], ["Founded", "fact_founded"], ["Location", "fact_location"], ["Website", "fact_website"]] as const).map(([label, key]) => [label, getSetting(key)] as const).filter(([, v]) => v)
    : [];
  const rounds = see("round")
    ? q<{ id: number; name: string; instrument: string; status: string; target_amount: number; valuation_cap: number | null; discount: number | null; pre_money: number | null; min_check: number | null; terms_md: string | null }>(
        "SELECT * FROM rounds WHERE status IN ('open','closing') AND min_level <= ? ORDER BY id DESC",
        me.level,
      )
    : [];
  const team = see("team") ? q<{ id: number; name: string; title: string | null; bio: string | null }>("SELECT id, name, title, bio FROM team_members ORDER BY position, id") : [];
  const holders = see("captable") ? listHolders().filter((h) => h.shares > 0) : [];
  const totalShares = holders.reduce((n, h) => n + h.shares, 0);
  const safes = see("captable")
    ? q<{ id: number; investor_name: string; amount: number; valuation_cap: number | null; discount: number | null; kind: string; status: string }>("SELECT id, investor_name, amount, valuation_cap, discount, kind, status FROM safes ORDER BY signed_on IS NULL, signed_on, id")
    : [];
  const months = see("financials") ? q<{ month: string; revenue: number; expenses: number; cash: number }>("SELECT month, revenue, expenses, cash FROM financials ORDER BY month DESC LIMIT 12").reverse() : [];
  const recent = months.slice(-3);
  const burn = recent.length ? recent.reduce((a, r) => a + (r.expenses - r.revenue), 0) / recent.length : 0;
  const latest = see("updates") ? visibleUpdates(me.level, 1)[0] : undefined;
  const latestSections = latest
    ? q<{ id: number; heading: string; body_md: string }>("SELECT id, heading, body_md FROM update_sections WHERE update_id = ? AND min_level <= ? AND TRIM(body_md) != '' ORDER BY position, id", latest.id, me.level)
    : [];
  const nothing = !overview && !rounds.length && !team.length && !holders.length && !months.length && !latest;

  return (
    <div className="pack">
      <PageHead title={`${company}: summary`} sub={`Everything open to you, on one page. As of ${fmtDate(new Date().toISOString())}.`}>
        <ExportBar />
      </PageHead>
      {nothing && <p className="empty">There is nothing to summarise yet.</p>}

      {(overview || facts.length > 0) && (
        <section className="card">
          <h2>The company</h2>
          {getSetting("tagline") && <p className="muted">{getSetting("tagline")}</p>}
          {overview && <Md html={renderMarkdown(overview)} />}
          {facts.length > 0 && <p className="muted">{facts.map(([label, value]) => `${label}: ${value}`).join(" · ")}</p>}
        </section>
      )}

      {rounds.map((r) => {
        const t = roundTotals(r.id);
        return (
          <section className="card" key={r.id}>
            <h2>{r.name}</h2>
            <table className="table"><tbody>
              <tr><td>Raising</td><td className="num">{money(r.target_amount)} {r.instrument === "safe" ? "on SAFEs" : "in a priced round"}</td></tr>
              {r.valuation_cap != null && <tr><td>Valuation cap</td><td className="num">{money(r.valuation_cap)}</td></tr>}
              {r.discount != null && r.discount > 0 && <tr><td>Discount</td><td className="num">{pct(r.discount, 0)}</td></tr>}
              {r.pre_money != null && <tr><td>Pre-money valuation</td><td className="num">{money(r.pre_money)}</td></tr>}
              {r.min_check != null && <tr><td>Minimum investment</td><td className="num">{money(r.min_check)}</td></tr>}
              <tr><td>Committed so far</td><td className="num">{money(t.total)} ({money(t.wired)} received)</td></tr>
            </tbody></table>
            {r.terms_md && <Md html={renderMarkdown(r.terms_md)} />}
          </section>
        );
      })}

      {team.length > 0 && (
        <section className="card">
          <h2>Team</h2>
          {team.map((m) => (
            <p key={m.id}><strong>{m.name}</strong>{m.title ? `, ${m.title}` : ""}{m.bio ? <><br /><span className="muted">{m.bio}</span></> : null}</p>
          ))}
        </section>
      )}

      {holders.length > 0 && (
        <section className="card">
          <h2>Ownership today</h2>
          <table className="table">
            <thead><tr><th>Holder</th><th>Class</th><th className="num">Shares</th><th className="num">Fully diluted</th></tr></thead>
            <tbody>
              {holders.map((h) => (
                <tr key={h.id}><td>{h.name}</td><td>{h.share_class}</td><td className="num">{num(h.shares)}</td><td className="num">{pct(totalShares ? h.shares / totalShares : 0)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td>Total</td><td /><td className="num">{num(totalShares)}</td><td className="num">100.00%</td></tr></tfoot>
          </table>
        </section>
      )}

      {safes.length > 0 && (
        <section className="card">
          <h2>SAFEs</h2>
          <table className="table">
            <thead><tr><th>Investor</th><th className="num">Amount</th><th className="num">Cap</th><th className="num">Discount</th><th>Status</th></tr></thead>
            <tbody>
              {safes.map((s) => (
                <tr key={s.id}><td>{s.investor_name}</td><td className="num">{money(s.amount)}</td><td className="num">{s.valuation_cap != null ? money(s.valuation_cap) : "None"}</td><td className="num">{s.discount ? pct(s.discount, 0) : "None"}</td><td>{s.status}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td>Total</td><td className="num">{money(safes.reduce((n, s) => n + s.amount, 0))}</td><td /><td /><td /></tr></tfoot>
          </table>
          <p className="muted small">Ownership sold on post-money SAFEs so far: {pct(safeOwnershipToday(safeInputs()), 1)}.</p>
        </section>
      )}

      {months.length > 0 && (
        <section className="card">
          <h2>Financials</h2>
          <p>
            Cash of <strong>{money(months[months.length - 1].cash)}</strong> at the end of {monthLabel(months[months.length - 1].month)}
            {burn > 0 ? <>; average net burn of {money(burn)} a month over the last {recent.length} month{recent.length === 1 ? "" : "s"}, which is about {Math.round(months[months.length - 1].cash / burn)} months of runway</> : <>; the company is not burning cash</>}.
          </p>
          <table className="table">
            <thead><tr><th>Month</th><th className="num">Revenue</th><th className="num">Expenses</th><th className="num">Net burn</th><th className="num">Cash</th></tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}><td>{monthLabel(m.month)}</td><td className="num">{money(m.revenue)}</td><td className="num">{money(m.expenses)}</td><td className="num">{money(m.expenses - m.revenue)}</td><td className="num">{money(m.cash)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {latest && latestSections.length > 0 && (
        <section className="card">
          <h2>Latest update: {latest.title}</h2>
          <p className="muted small">Published {fmtDate(latest.published_at)}</p>
          {latestSections.map((s) => (
            <div key={s.id}><h3>{s.heading}</h3><Md html={renderMarkdown(s.body_md)} /></div>
          ))}
        </section>
      )}

      <p className="muted small no-print"><Link href="/home">Back</Link></p>
    </div>
  );
}
