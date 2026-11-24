import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { SEASONS, currentSeason, noteOfTheDay } from "@/lib/mentor";
import { Journey, Welcome } from "@/components/Garden";
import { Hint } from "@/components/ui";

export default async function Guide() {
  await requireStaff();
  const here = currentSeason();
  return (
    <>
      <Welcome title="Your founder guide" stage={Math.min(4, here)}>
        Raising a first round is a path with six stretches. This page shows where you are, what matters now, and what comes next. You only need to think about one stretch at a time.
      </Welcome>
      <div className="card">
        <Journey stops={SEASONS.map((s) => ({ label: s.label, hint: s.title }))} current={here} />
      </div>
      <Hint title="A thought for today">{noteOfTheDay()}</Hint>

      {SEASONS.map((s, i) => (
        <details className="card" key={s.key} open={i === here} id={s.key}>
          <summary style={{ fontFamily: "var(--serif)", fontSize: 19, color: "var(--ink)" }}>
            {i + 1}. {s.title}{" "}
            {i === here ? <span className="badge warn">You are here</span> : i < here ? <span className="badge ok">Done</span> : null}
          </summary>
          <p style={{ maxWidth: "70ch" }}>{s.summary}</p>
          <div className="grid2">
            <div>
              <h3>What to focus on</h3>
              <ul>{s.focus.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
            <div>
              <h3>Watch out for</h3>
              <ul>{s.watchOut.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          </div>
          <div className="row">
            {s.links.map((l) => (
              <Link key={l.href + l.label} className={`btn ${i === here ? "primary" : ""} small`} href={l.href}>{l.label}</Link>
            ))}
          </div>
        </details>
      ))}
      <p className="muted small">This guide describes common practice for pre-seed rounds. It is not legal, tax or financial advice; check terms, filings and conversions with your lawyer.</p>
    </>
  );
}
