import Link from "next/link";
import { canSeeSection, requireSection } from "@/lib/auth";
import { q } from "@/lib/db";
import { logView } from "@/lib/activity";
import { money, pct } from "@/lib/format";
import { renderMarkdown } from "@/lib/md";
import { roundTotals, type RoundRow } from "@/lib/rounds";
import { Hint, Md, PageHead } from "@/components/ui";
import { RaiseProgress } from "@/components/rounds";

export default async function TheRound() {
  const me = await requireSection("round");
  logView(me, "section.view", undefined, undefined, "round");
  const rounds = q<RoundRow>("SELECT * FROM rounds WHERE status IN ('open','closing') AND min_level <= ? ORDER BY id DESC", me.level);
  const docs = canSeeSection(me, "documents");
  const requests = canSeeSection(me, "requests");

  return (
    <>
      <PageHead title="The round" sub="What is being raised, on what terms, and how to take part." />
      {me.isStaff && <Hint>This is what investors see. Edit rounds under <Link href="/rounds">Rounds</Link>. Only rounds that are open or closing appear here.</Hint>}
      {rounds.length === 0 && (
        <div className="empty">
          There is no open round to show you right now. When the founders open one, the terms will appear here.
          {requests && <> In the meantime you can <Link href="/requests">ask them a question</Link>.</>}
        </div>
      )}
      {rounds.map((r) => {
        const t = roundTotals(r.id);
        return (
          <div className="card" key={r.id}>
            <h2>{r.name} <span className={`badge ${r.status === "open" ? "ok" : "warn"}`}>{r.status === "open" ? "Open" : "Closing soon"}</span></h2>
            <div className="grid3" style={{ margin: "12px 0" }}>
              <div><div className="stat">{r.target_amount ? money(r.target_amount, true) : "—"}</div><div className="stat-label">Raising</div></div>
              {r.instrument === "safe" ? (
                <>
                  <div><div className="stat">{r.valuation_cap ? money(r.valuation_cap, true) : "None"}</div><div className="stat-label">Valuation cap (SAFE)</div></div>
                  <div><div className="stat">{r.discount ? pct(r.discount, 0) : "None"}</div><div className="stat-label">Discount</div></div>
                </>
              ) : (
                <>
                  <div><div className="stat">{r.pre_money ? money(r.pre_money, true) : "—"}</div><div className="stat-label">Pre-money valuation</div></div>
                  <div><div className="stat">{r.pre_money ? money(r.pre_money + r.target_amount, true) : "—"}</div><div className="stat-label">Post-money if fully raised</div></div>
                </>
              )}
            </div>
            <RaiseProgress totals={t} target={r.target_amount} />
            <p className="small" style={{ marginTop: 10 }}>
              {r.instrument === "safe" ? "Investment is by SAFE: you invest now and receive shares at the next priced round." : "This is a priced round: you buy shares directly."}
              {r.min_check ? ` Minimum cheque ${money(r.min_check)}.` : ""}
              {r.instrument === "safe" && r.valuation_cap && r.min_check ? ` At the cap, ${money(r.min_check)} is ${pct(r.min_check / r.valuation_cap)} of the company.` : ""}
            </p>
            {r.terms_md && (<><hr /><Md html={renderMarkdown(r.terms_md)} /></>)}
          </div>
        );
      })}

      {rounds.length > 0 && !me.isStaff && (
        <div className="card">
          <h2>What happens next</h2>
          <ul className="steps">
            <li className="next"><span className="tick">✓</span><div className="step-body"><div className="step-title">1. Review the documents</div><div className="muted small">Start with the pitch deck, then the cap table and financials.</div></div>{docs && <Link className="btn small primary" href="/documents">Open documents</Link>}</li>
            <li><span className="tick">✓</span><div className="step-body"><div className="step-title">2. Ask anything that is unclear</div><div className="muted small">Questions and document requests go straight to the founders, and you can track the answers.</div></div>{requests && <Link className="btn small" href="/requests">Ask or request</Link>}</li>
            <li><span className="tick">✓</span><div className="step-body"><div className="step-title">3. Tell the founders your amount</div><div className="muted small">Send a request saying how much you would like to invest. A commitment is not binding until you sign.</div></div>{requests && <Link className="btn small" href="/requests">Send your amount</Link>}</li>
            <li><span className="tick">✓</span><div className="step-body"><div className="step-title">4. Sign</div><div className="muted small">The founders send you the {rounds[0].instrument === "safe" ? "SAFE" : "round documents"} to sign. A countersigned copy is filed here for you.</div></div></li>
            <li><span className="tick">✓</span><div className="step-body"><div className="step-title">5. Wire the funds</div><div className="muted small">Wire instructions come with the signed documents. Always confirm bank details with a founder by phone before sending money.</div></div></li>
          </ul>
        </div>
      )}
    </>
  );
}
