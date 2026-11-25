import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { q } from "@/lib/db";
import { money, pct } from "@/lib/format";
import { STATUS_LABEL, roundTotals, type RoundRow } from "@/lib/rounds";
import { Flash, Hint, PageHead } from "@/components/ui";
import { RaiseProgress, RoundFields } from "@/components/rounds";
import { createRoundAction } from "./actions";

const BADGE: Record<string, string> = { planning: "grey", open: "ok", closing: "warn", closed: "grey" };

export default async function Rounds({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireStaff();
  const rounds = q<RoundRow>("SELECT * FROM rounds ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'closing' THEN 1 WHEN 'planning' THEN 2 ELSE 3 END, id DESC");
  return (
    <>
      <PageHead title="Rounds" sub="Each raise is its own round: the one you are doing now, and the ones you are planning." />
      <Flash sp={await searchParams} />
      <Hint title="How rounds work">
        A round moves through four steps. <strong>Planning</strong>: get ready, nobody outside sees it. <strong>Open</strong>: investors with access see the terms. <strong>Closing</strong>: collecting signatures and wires. <strong>Closed</strong>: done. Each round has a checklist that tells you what to do next.
      </Hint>

      {rounds.map((r) => {
        const t = roundTotals(r.id);
        return (
          <div className="card" key={r.id}>
            <div className="spread">
              <h2 style={{ margin: 0 }}><Link href={`/rounds/${r.id}`}>{r.name}</Link> <span className={`badge ${BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span></h2>
              <Link className="btn small" href={`/rounds/${r.id}`}>Open</Link>
            </div>
            <p className="muted small" style={{ margin: "6px 0 10px" }}>
              {r.instrument === "safe"
                ? [`SAFEs`, r.valuation_cap && `${money(r.valuation_cap, true)} cap`, r.discount && `${pct(r.discount, 0)} discount`].filter(Boolean).join(" · ")
                : [`Priced round`, r.pre_money && `${money(r.pre_money, true)} pre-money`].filter(Boolean).join(" · ")}
            </p>
            <RaiseProgress totals={t} target={r.target_amount} />
            <div className="row small" style={{ marginTop: 8 }}>
              <span>Committed {money(t.committed)}</span><span>Signed {money(t.signed)}</span><span>Wired {money(t.wired)}</span>
            </div>
          </div>
        );
      })}

      <div className="card">
        <h2>{rounds.length ? "Plan another round" : "Plan your first round"}</h2>
        <p style={{ maxWidth: "62ch" }}>Six short questions: what the money is for, how much, on what terms. Each one explains what founders usually do and works out a suggestion from your own numbers.</p>
        <p><Link className="btn primary" href="/rounds/new">Plan a round, step by step</Link></p>
        <details>
          <summary>I already know my terms</summary>
          <p className="muted">Fill in what you know. You can change everything later, and nothing is visible to investors until you open the round.</p>
          <form action={createRoundAction}>
            <RoundFields />
            <button className="btn">Create round</button>
          </form>
        </details>
      </div>
    </>
  );
}
