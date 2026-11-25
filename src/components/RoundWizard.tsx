"use client";

import Link from "next/link";
import { useState } from "react";
import { createRoundAction } from "@/app/(app)/rounds/actions";

export type WizardContext = {
  /** Average net burn over the last three recorded months, or null if no financials. */
  burn: number | null;
  cash: number | null;
  /** Share of the company the founders hold today, 0..1, or null if the cap table is empty. */
  foundersNow: number | null;
  /** Share already sold on earlier post-money SAFEs, 0..1. */
  soldOnSafes: number;
  hasRounds: boolean;
  audiences: { level: number; label: string }[];
  defaultAudience: number;
};

const usd = (n: number, compact = false) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0, notation: compact ? "compact" : "standard" }).format(n);
const num = (s: string) => {
  const n = Number(String(s).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);
const pc = (f: number) => `${(f * 100).toFixed(f * 100 >= 10 ? 0 : 1)}%`;

/** A note from the guide: plain advice that changes with the founder's answers. */
function Guide({ children, tone }: { children: React.ReactNode; tone?: "warn" }) {
  return <div className={tone === "warn" ? "notice warn" : "hint"} style={{ maxWidth: "62ch" }}>{children}</div>;
}

function Choice({ picked, onPick, title, children }: { picked: boolean; onPick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" className={`choice ${picked ? "on" : ""}`} onClick={onPick} aria-pressed={picked}>
      <strong>{title}</strong>
      <span>{children}</span>
    </button>
  );
}

const STEPS = ["The goal", "The amount", "The instrument", "The price", "The smallest cheque", "Review"] as const;

export function RoundWizard({ ctx }: { ctx: WizardContext }) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState({
    name: ctx.hasRounds ? "Seed" : "Pre-seed",
    milestone: "",
    months: "18",
    burn: ctx.burn && ctx.burn > 0 ? String(Math.round(ctx.burn)) : "",
    cash: ctx.cash != null ? String(Math.round(ctx.cash)) : "",
    amount: "",
    instrument: "safe" as "safe" | "priced",
    sell: "15",
    cap: "",
    discount: "",
    preMoney: "",
    pool: "10",
    minCheck: "",
    audience: String(ctx.defaultAudience),
  });
  const set = (k: keyof typeof a) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setA({ ...a, [k]: e.target.value });

  // ---- What the answers imply ----
  const months = num(a.months) || 18;
  const burn = num(a.burn);
  const cash = num(a.cash);
  // Money to cover the plan, less what is already in the bank, plus a fifth for things taking longer than planned.
  const need = burn ? Math.max(0, burn * months - cash) : 0;
  const suggestedAmount = need ? roundTo(need * 1.2, need > 400_000 ? 50_000 : 25_000) : 0;
  const amount = num(a.amount);
  const runwayAtAmount = burn && amount ? (amount + cash) / burn : 0;

  const sell = Math.min(60, num(a.sell)) / 100;
  const suggestedCap = amount && sell ? roundTo(amount / sell, 250_000) : 0;
  const cap = num(a.cap) || suggestedCap;
  const sold = a.instrument === "safe" ? (cap ? amount / cap : 0) : num(a.preMoney) ? amount / (num(a.preMoney) + amount) : 0;
  const totalSold = Math.min(0.95, sold + ctx.soldOnSafes);
  const foundersAfter = ctx.foundersNow != null ? ctx.foundersNow * (1 - totalSold) : null;
  const suggestedMin = amount ? Math.min(25_000, roundTo(amount / 40, 5_000)) : 10_000;
  const minCheck = num(a.minCheck) || suggestedMin;

  const problems = [
    !amount ? "Set how much you are raising (step 2)." : "",
    a.instrument === "safe" && cap && cap <= amount ? "The valuation cap must be larger than the amount you are raising (step 4)." : "",
    a.instrument === "priced" && !num(a.preMoney) ? "Set the pre-money valuation (step 4)." : "",
    !a.name.trim() ? "Give the round a name." : "",
  ].filter(Boolean);

  const terms = [
    a.milestone.trim() ? `**What this round is for:** ${a.milestone.trim()}` : "",
    burn ? `**Use of funds:** about ${Math.round(runwayAtAmount || months)} months of runway at roughly ${usd(burn)} a month.` : "",
  ].filter(Boolean).join("\n\n");

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="wizard">
      <p className="muted small spread" aria-live="polite">
        <span>Step {step + 1} of {STEPS.length} · {STEPS[step]}</span>
        <Link className="muted" href="/rounds">Leave without saving</Link>
      </p>
      <div className="progress" style={{ maxWidth: 320, marginBottom: 26 }}><div className="second" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, animation: "none" }} /></div>

      {step === 0 && (
        <section>
          <h1>What will this money get you to?</h1>
          <Guide>
            <strong>Start with the destination, not the number.</strong>
            Investors fund a milestone: something that, once reached, makes the next round easy to raise. &ldquo;Twenty paying customers and a repeatable way to find more&rdquo; is a milestone. &ldquo;Runway&rdquo; is not.
          </Guide>
          <label className="field">
            <span>In a sentence, where does this round take the company?</span>
            <textarea value={a.milestone} onChange={set("milestone")} rows={3} placeholder="e.g. 20 paying clinics, $40K in monthly revenue, and a sales process a new hire can run." />
            <small>You will say this sentence in every investor meeting. It is worth getting right, but you can refine it later.</small>
          </label>
          <label className="field" style={{ maxWidth: 260 }}>
            <span>How many months will that take?</span>
            <input value={a.months} onChange={set("months")} inputMode="numeric" />
          </label>
          {months < 12 && <Guide tone="warn">Under a year is tight. Fundraising itself usually takes three to six months, so you would be raising again almost as soon as you finish. Most founders plan for 18 to 24.</Guide>}
          {months >= 12 && months <= 30 && <Guide>Good. Eighteen to twenty-four months is the usual plan: long enough to hit the milestone and still have six months left to raise the next round from a position of strength.</Guide>}
          {months > 30 && <Guide tone="warn">That is a long horizon for a first round. The further out the plan, the more you must raise and the more of the company you sell now, at today&apos;s lower price. Consider a nearer milestone.</Guide>}
        </section>
      )}

      {step === 1 && (
        <section>
          <h1>How much do you need?</h1>
          <Guide>
            <strong>Work it out; do not pick a round number.</strong>
            The amount is what the plan costs: monthly spend times the months you just chose, less what you already have, plus a margin because things take longer than planned.
            {ctx.burn == null && <> There are no financials in the room yet, so enter your best estimate. Adding them later under <Link href="/financials">Financials</Link> will also make investors&apos; questions easier.</>}
          </Guide>
          <div className="grid2">
            <label className="field">
              <span>Average monthly spend over the plan ($)</span>
              <input value={a.burn} onChange={set("burn")} inputMode="numeric" placeholder="45,000" />
              <small>{ctx.burn && ctx.burn > 0 ? `You are burning about ${usd(ctx.burn)} a month today. Raise this figure for the hires the plan needs.` : "Include the people you plan to hire, not only today's costs."}</small>
            </label>
            <label className="field">
              <span>Cash in the bank today ($)</span>
              <input value={a.cash} onChange={set("cash")} inputMode="numeric" placeholder="0" />
            </label>
          </div>
          {burn > 0 && (
            <Guide>
              <strong>That works out to about {usd(suggestedAmount)}.</strong>
              {usd(burn)} a month for {months} months is {usd(burn * months)}{cash ? <>, less the {usd(cash)} you have,</> : null} which leaves {usd(need)} to cover. Adding a fifth as a margin and rounding gives {usd(suggestedAmount)}.
            </Guide>
          )}
          <label className="field" style={{ maxWidth: 320 }}>
            <span>How much will you raise? ($)</span>
            <input value={a.amount} onChange={set("amount")} inputMode="numeric" placeholder={suggestedAmount ? suggestedAmount.toLocaleString("en-US") : "750,000"} />
            {suggestedAmount > 0 && !amount && <small><button type="button" className="linkbtn" onClick={() => setA({ ...a, amount: String(suggestedAmount) })}>Use {usd(suggestedAmount)}</button></small>}
          </label>
          {amount > 0 && burn > 0 && runwayAtAmount < 12 && <Guide tone="warn">At {usd(amount)} you would have about {Math.round(runwayAtAmount)} months of runway. That is likely too little to reach the milestone and raise again.</Guide>}
          {amount > 0 && burn > 0 && runwayAtAmount >= 12 && <Guide>{usd(amount)} gives you about {Math.round(runwayAtAmount)} months at that spend. You can always close a little above your target; it is much harder to go back for more.</Guide>}
          {amount > 0 && suggestedAmount > 0 && amount > suggestedAmount * 1.6 && <Guide tone="warn">That is well above what the plan needs. More money means selling more of the company at today&apos;s price. If you want the extra, be ready to say what it buys.</Guide>}
        </section>
      )}

      {step === 2 && (
        <section>
          <h1>How will investors put money in?</h1>
          <Guide>
            <strong>For a first round, SAFEs are almost always the right answer.</strong>
            A SAFE is a short standard document: the investor gives you money now and receives shares later, when you raise a priced round. No board seats, no lengthy negotiation, and each investor can sign on a different day, so you take money as it comes.
          </Guide>
          <div className="choices">
            <Choice picked={a.instrument === "safe"} onPick={() => setA({ ...a, instrument: "safe" })} title="SAFEs (recommended)">Fast, cheap and standard. Each investor signs the same two-page-style agreement. What nearly every pre-seed company uses.</Choice>
            <Choice picked={a.instrument === "priced"} onPick={() => setA({ ...a, instrument: "priced" })} title="A priced round">You sell shares at a set price today. More legal work and usually a lead investor who sets terms. More common from seed onward.</Choice>
          </div>
          {a.instrument === "priced" && <Guide tone="warn">A priced round is a real negotiation with a lead investor and needs a lawyer from the start. If you do not already have a lead asking for one, a SAFE round will be faster and cheaper.</Guide>}
        </section>
      )}

      {step === 3 && a.instrument === "safe" && (
        <section>
          <h1>What is the valuation cap?</h1>
          <Guide>
            <strong>Think in ownership, not valuation.</strong>
            The cap decides how much of the company this round buys: the amount raised divided by the cap. Founders usually sell between 10% and 20% in a first round. Less, and investors may feel the price is too high; more, and you will feel it in every later round.
          </Guide>
          <label className="field" style={{ maxWidth: 360 }}>
            <span>How much of the company are you prepared to sell in this round?</span>
            <select value={a.sell} onChange={(e) => setA({ ...a, sell: e.target.value, cap: "" })}>
              {[8, 10, 12, 15, 18, 20, 25, 30].map((v) => <option key={v} value={v}>{v}%{v === 15 ? " (a common middle)" : ""}</option>)}
            </select>
          </label>
          {amount > 0 ? (
            <Guide>
              <strong>That suggests a cap of about {usd(suggestedCap, true)}.</strong>
              {usd(amount)} at a {usd(suggestedCap, true)} post-money cap sells {pc(amount / suggestedCap)} of the company.
            </Guide>
          ) : <Guide tone="warn">Go back and set the amount first; the cap follows from it.</Guide>}
          <div className="grid2">
            <label className="field">
              <span>Valuation cap, post-money ($)</span>
              <input value={a.cap} onChange={set("cap")} inputMode="numeric" placeholder={suggestedCap ? suggestedCap.toLocaleString("en-US") : ""} />
              <small>Leave blank to use the suggestion. &ldquo;Post-money&rdquo; is the modern standard and makes the maths this simple.</small>
            </label>
            <label className="field">
              <span>Discount (%), optional</span>
              <input value={a.discount} onChange={set("discount")} inputMode="numeric" placeholder="None" />
              <small>With a cap, most founders offer no discount. It only matters if your next round is priced below the cap.</small>
            </label>
          </div>
          {amount > 0 && cap > amount && (
            <Guide tone={totalSold > 0.3 ? "warn" : undefined}>
              <strong>What that does to you.</strong>
              This round sells {pc(sold)}.{ctx.soldOnSafes > 0 ? <> With the {pc(ctx.soldOnSafes)} already sold on earlier SAFEs, that is {pc(totalSold)} in total.</> : null}
              {foundersAfter != null ? <> The founders go from about {pc(ctx.foundersNow!)} to about {pc(foundersAfter)} once these convert, before the next round and any option pool.</> : <> Add your shareholders under <Link href="/captable">Cap table</Link> and this page will show what the founders keep.</>}
              {totalSold > 0.3 && <> That is a lot to give up before a priced round. A seed round typically takes another 15% to 25%, so check you are comfortable with where that leaves you.</>}
            </Guide>
          )}
          {cap > 0 && cap <= amount && <Guide tone="warn">The cap must be larger than the amount raised; otherwise you would be selling the whole company.</Guide>}
        </section>
      )}

      {step === 3 && a.instrument === "priced" && (
        <section>
          <h1>What is the price?</h1>
          <Guide>
            <strong>In a priced round the lead investor proposes this.</strong>
            The pre-money valuation is what the company is worth before the new money. New investors&apos; share is the amount raised divided by the pre-money plus the amount raised. Expect them to ask for an option pool, which comes out of the existing holders&apos; share.
          </Guide>
          <div className="grid2">
            <label className="field"><span>Pre-money valuation ($)</span><input value={a.preMoney} onChange={set("preMoney")} inputMode="numeric" placeholder="6,000,000" /></label>
            <label className="field"><span>Option pool after the round (%)</span><input value={a.pool} onChange={set("pool")} inputMode="numeric" /><small>Ten percent is a common ask.</small></label>
          </div>
          {amount > 0 && num(a.preMoney) > 0 && <Guide>New investors would own {pc(sold)} after the round. Use the calculator on the <Link href="/captable">Cap table</Link> page to see every holder once earlier SAFEs convert.</Guide>}
        </section>
      )}

      {step === 4 && (
        <section>
          <h1>What is the smallest cheque you will take?</h1>
          <Guide>
            <strong>Small enough for a helpful angel, large enough to keep the list manageable.</strong>
            Every investor is a signature to collect, a wire to chase and a person to keep updated for years. A minimum between $10,000 and $25,000 is typical for a first round. You can always make an exception for someone whose help matters more than their money.
          </Guide>
          <label className="field" style={{ maxWidth: 320 }}>
            <span>Minimum investment ($)</span>
            <input value={a.minCheck} onChange={set("minCheck")} inputMode="numeric" placeholder={suggestedMin.toLocaleString("en-US")} />
            <small>Leave blank to use {usd(suggestedMin)}.</small>
          </label>
          {amount > 0 && <Guide>At {usd(minCheck)} minimum, filling {usd(amount)} takes at most {Math.ceil(amount / minCheck)} investors, and realistically far fewer. {Math.ceil(amount / minCheck) > 45 ? "That could be a lot of people to manage; consider a higher minimum." : "That is a manageable number."}</Guide>}
          <div className="grid2">
            <label className="field"><span>What should this round be called?</span><input value={a.name} onChange={set("name")} maxLength={120} /></label>
            <label className="field">
              <span>Who may see the terms once the round is open?</span>
              <select value={a.audience} onChange={set("audience")}>{ctx.audiences.map((o) => <option key={o.level} value={o.level}>{o.label}</option>)}</select>
              <small>Nobody outside sees anything while the round is still in planning.</small>
            </label>
          </div>
        </section>
      )}

      {step === 5 && (
        <section>
          <h1>Here is your round</h1>
          <div className="letter">
            <p>
              <strong>{a.name || "This round"}</strong>: raising <strong>{amount ? usd(amount) : "an amount still to be set"}</strong>{" "}
              {a.instrument === "safe"
                ? <>on post-money SAFEs{cap ? <> at a <strong>{usd(cap, true)} cap</strong></> : null}{num(a.discount) ? <> with a {num(a.discount)}% discount</> : null}</>
                : <>in a priced round{num(a.preMoney) ? <> at a <strong>{usd(num(a.preMoney), true)} pre-money valuation</strong></> : null}</>}
              , with a minimum investment of {usd(minCheck)}.
            </p>
            {sold > 0 && <p>That sells about <strong>{pc(sold)}</strong> of the company{foundersAfter != null && a.instrument === "safe" ? <>, leaving the founders with about {pc(foundersAfter)}</> : null}.</p>}
            {a.milestone.trim() && <p>It takes you to: {a.milestone.trim()}</p>}
            {burn > 0 && amount > 0 && <p>At {usd(burn)} a month, that is about {Math.round(runwayAtAmount)} months.</p>}
          </div>
          {problems.length > 0 && <Guide tone="warn"><strong>Before you can create it</strong>{problems.map((p) => <div key={p}>{p}</div>)}</Guide>}
          {problems.length === 0 && (
            <Guide>
              <strong>What happens next.</strong>
              The round is created in planning, invisible to everyone outside. You will get a short readiness list (deck, cap table, company documents), and when that is done you open the round and start adding investors. Every figure here can be changed later.
            </Guide>
          )}
          <form action={createRoundAction} id="round-form">
            <input type="hidden" name="name" value={a.name} />
            <input type="hidden" name="instrument" value={a.instrument} />
            <input type="hidden" name="target_amount" value={amount || ""} />
            <input type="hidden" name="valuation_cap" value={a.instrument === "safe" ? cap || "" : ""} />
            <input type="hidden" name="discount" value={a.instrument === "safe" ? num(a.discount) || "" : ""} />
            <input type="hidden" name="pre_money" value={a.instrument === "priced" ? num(a.preMoney) || "" : ""} />
            <input type="hidden" name="new_pool_pct" value={a.instrument === "priced" ? num(a.pool) || "" : ""} />
            <input type="hidden" name="min_check" value={minCheck} />
            <input type="hidden" name="terms_md" value={terms} />
            <input type="hidden" name="min_level" value={a.audience} />
          </form>
          <p className="muted small" style={{ marginTop: 18, maxWidth: "62ch" }}>This guidance describes common practice for early rounds. It is not legal, tax or financial advice. Have a lawyer review the SAFE and any filings before you take money.</p>
        </section>
      )}

      {/* Where to go next. On a phone this stays pinned to the bottom of the screen. */}
      <div className="wizard-nav">
        {step > 0 && <button type="button" className="btn" onClick={back}>Back</button>}
        {/* Distinct keys matter: without them the Continue button would turn into the
            submit button mid-click and the browser would submit the form straight away. */}
        {step < 5 ? (
          <button key="continue" type="button" className="btn primary" onClick={next}>Continue</button>
        ) : (
          <button key="create" type="submit" className="btn primary" form="round-form" disabled={problems.length > 0}>Create this round</button>
        )}
      </div>
    </div>
  );
}
