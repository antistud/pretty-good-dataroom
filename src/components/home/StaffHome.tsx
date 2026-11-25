import Link from "next/link";
import type { Viewer } from "@/lib/auth";
import { getSetting, q, q1 } from "@/lib/db";
import { ago, money, monthLabel } from "@/lib/format";
import { updateDue } from "@/lib/updates";
import { currentRound, roundTotals } from "@/lib/rounds";
import { ACTIVE_STAGES, recentExternalActivity, suggestions, today, type Lead } from "@/lib/pipeline";
import { Hint } from "@/components/ui";
import { Journey, Sprout, Welcome } from "@/components/Garden";
import { Greeting } from "@/components/Greeting";
import { roomHealth } from "@/lib/health";
import { roomIsEmpty, sampleLoaded } from "@/lib/sample";
import { clearSampleAction, loadSampleAction } from "@/app/(app)/home/actions";
import { SEASONS, currentSeason, noteOfTheDay } from "@/lib/mentor";

type Item = { text: string; href: string; cta: string; urgent?: boolean };
type RoundLite = { id: number; name: string; status: string; target_amount: number | null };

export default async function StaffHome({ me }: { me: Viewer }) {
  const count = (sql: string, ...p: unknown[]) => q1<{ n: number }>(sql, ...p)?.n ?? 0;

  // First-run guide: each step is detected from what is already in the room.
  const setup = [
    { title: "Describe the company", help: "A few paragraphs on the Overview page: what you do, for whom, and why now. This is the first thing every investor reads.", href: "/overview", done: getSetting("overview_md").trim().length > 0 },
    { title: "Upload your deck", help: "Put it in the Pitch folder under Documents. Teaser-level investors see this folder first.", href: "/documents", done: count("SELECT COUNT(*) AS n FROM documents") > 0 },
    { title: "Fill in the cap table", help: "Add founders, any other holders and the option pool. Takes five minutes and powers the SAFE conversion maths.", href: "/captable", done: count("SELECT COUNT(*) AS n FROM holders") > 0 },
    { title: "Create your round", help: "Target amount, SAFE cap and discount. Commitments in the pipeline attach to these terms.", href: "/rounds", done: count("SELECT COUNT(*) AS n FROM rounds") > 0 },
    { title: "Add your first lead", help: "Anyone you might raise from. Their card then walks you through every step to a wire.", href: "/pipeline", done: count("SELECT COUNT(*) AS n FROM leads") > 0 },
    { title: "Write your first investor update", help: "A short monthly note. Investors who hear from you regularly are the ones who help.", href: "/updates", done: count("SELECT COUNT(*) AS n FROM updates") > 0 },
  ];
  const setupLeft = setup.filter((s) => !s.done).length;
  const nextSetup = setup.find((s) => !s.done);

  const round = currentRound() as RoundLite | null | undefined;
  const totals = round ? (roundTotals(round.id) as { committed?: number; signed?: number; wired?: number; total?: number }) : null;
  const total = Number(totals?.total) || 0;
  const wired = Number(totals?.wired) || 0;
  const target = Number(round?.target_amount) || 0;
  const widthOf = (n: number) => (target > 0 ? `${Math.min(100, Math.max(0, (n / target) * 100))}%` : "0%");

  const items: Item[] = [];
  const t = today();

  const due = updateDue();
  if (!due.published) {
    if (due.overdue) items.push({ text: `The ${monthLabel(due.period)} investor update is ${-due.daysUntilDue} day${due.daysUntilDue === -1 ? "" : "s"} overdue.`, href: "/updates", cta: due.draftId ? "Finish the draft" : "Write it now", urgent: true });
    else if (due.daysUntilDue <= 7) items.push({ text: `The ${monthLabel(due.period)} investor update is due ${due.daysUntilDue === 0 ? "today" : `in ${due.daysUntilDue} day${due.daysUntilDue === 1 ? "" : "s"}`}.`, href: "/updates", cta: due.draftId ? "Finish the draft" : "Start it", urgent: due.daysUntilDue <= 1 });
  }

  const openRequests = count("SELECT COUNT(*) AS n FROM requests WHERE status IN ('open','in_progress')");
  if (openRequests) items.push({ text: `${openRequests} investor request${openRequests === 1 ? " is" : "s are"} waiting for an answer.`, href: "/requests", cta: "Open requests", urgent: true });

  const offers = count("SELECT COUNT(*) AS n FROM intro_offers WHERE status = 'offered'");
  if (offers) items.push({ text: `${offers} new intro offer${offers === 1 ? "" : "s"} from your network. Reply while it is fresh.`, href: "/intros", cta: "See offers", urgent: true });

  const leads = q<Lead>(`SELECT * FROM leads WHERE stage IN (${ACTIVE_STAGES.map(() => "?").join(",")}) ORDER BY CASE WHEN next_action_due IS NULL THEN 1 ELSE 0 END, next_action_due, updated_at`, ...ACTIVE_STAGES);
  const seen = new Set<string>();
  for (const lead of leads) {
    for (const s of suggestions(lead)) {
      if (seen.has(s.text) || s.href === "/requests") continue; // requests are already counted above
      seen.add(s.text);
      items.push({ text: s.text, href: s.href, cta: "Open card", urgent: s.urgent });
    }
  }

  const staleInvites = q<{ email: string; created_at: string; org_id: number | null }>(
    `SELECT i.email, i.created_at, i.org_id FROM invites i
      WHERE i.accepted_at IS NULL AND i.revoked = 0 AND i.expires_at > ? AND i.created_at < datetime('now', '-5 days')
        AND (i.org_id IS NULL OR i.org_id NOT IN (SELECT org_id FROM leads WHERE org_id IS NOT NULL AND stage != 'passed'))`,
    new Date().toISOString(),
  );
  for (const i of staleInvites) items.push({ text: `${i.email} was invited ${ago(i.created_at)} and has not joined. Nudge them or send a fresh link.`, href: "/people", cta: "People & access" });

  items.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
  const upcoming = leads.filter((l) => l.next_action_due && l.next_action_due > t).slice(0, 5);
  const recent = recentExternalActivity(10);
  const firstName = me.name.split(" ")[0];
  const seasonIndex = currentSeason();
  const season = SEASONS[seasonIndex];
  const health = roomHealth();
  const toStrengthen = health.items.filter((i) => !i.done).slice(0, 3);
  const isSample = sampleLoaded();
  const canSample = me.role === "founder" && !isSample && roomIsEmpty();
  const GROWTH: Record<string, number> = { lead: 0, contacted: 0, interested: 1, meeting: 1, diligence: 2, committed: 3, signed: 3, wired: 4 };
  const plants = q<{ id: number; org_name: string; stage: string; check_size: number | null }>(
    `SELECT id, org_name, stage, check_size FROM leads WHERE stage != 'passed' ${round ? "AND (round_id = ? OR round_id IS NULL)" : ""}
      ORDER BY CASE stage WHEN 'wired' THEN 0 WHEN 'signed' THEN 1 WHEN 'committed' THEN 2 WHEN 'diligence' THEN 3 WHEN 'meeting' THEN 4 WHEN 'interested' THEN 5 WHEN 'contacted' THEN 6 ELSE 7 END, updated_at DESC LIMIT 14`,
    ...(round ? [round.id] : []),
  );
  const topItems = items.slice(0, 5);
  const moreItems = items.slice(5);

  return (
    <>
      <Welcome title={<Greeting name={firstName} />} stage={Math.min(4, seasonIndex)}>
        {items.length === 0 ? "Nothing urgent is waiting on you today." : items.length === 1 ? "One thing needs you today." : `${items.length} things need you today. Start at the top; one at a time is plenty.`}
      </Welcome>

      {isSample && (
        <div className="notice warn spread">
          <span>You are looking at a sample company. None of this is real, and investors cannot see it until you invite them.</span>
          {me.role === "founder" && <form action={clearSampleAction}><button className="btn small">Clear the sample and start for real</button></form>}
        </div>
      )}
      {canSample && (
        <Hint title="Want to look around first?">
          Load a made-up company to see what a raise in full swing looks like: a pipeline, a cap table, six months of financials. One click removes it again.
          <form action={loadSampleAction} style={{ marginTop: 8 }}><button className="btn small">Show me a sample company</button></form>
        </Hint>
      )}

      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>{season.title}</h2>
          <Link className="small" href={`/guide#${season.key}`}>Open your founder guide</Link>
        </div>
        <Journey stops={SEASONS.map((x) => ({ label: x.label, hint: x.title }))} current={seasonIndex} />
        <p className="muted" style={{ margin: "10px 0 0", maxWidth: "75ch" }}>{season.summary}</p>
      </div>

      {setupLeft > 0 && (
        <div className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>Get your room ready</h2>
            <span className="muted small">{setup.length - setupLeft} of {setup.length} done</span>
          </div>
          <ul className="steps" style={{ marginTop: 8 }}>
            {setup.map((s) => (
              <li key={s.title} className={s.done ? "done" : s === nextSetup ? "next" : ""}>
                <span className="tick">✓</span>
                <div className="step-body">
                  <div className="step-title">{s.title}</div>
                  {!s.done && <div className="muted small">{s.help}</div>}
                </div>
                {!s.done && <Link className={`btn small ${s === nextSetup ? "primary" : ""}`} href={s.href}>{s === nextSetup ? "Do this now" : "Open"}</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {round ? (
        <div className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>{round.name} <span className="badge">{round.status}</span></h2>
            <div className="row"><Link className="btn small" href="/pipeline">Pipeline</Link><Link className="btn small" href="/rounds">Round details</Link></div>
          </div>
          <div className="grid3" style={{ margin: "12px 0" }}>
            <div><div className="stat">{money(total, true)}</div><div className="stat-label">Committed so far{target ? ` of ${money(target, true)}` : ""}</div></div>
            <div><div className="stat">{money(wired, true)}</div><div className="stat-label">Wired: in the bank</div></div>
            <div><div className="stat">{leads.length}</div><div className="stat-label">Active conversations</div></div>
          </div>
          <div className="progress" style={{ display: "flex" }}>
            <div className="second" style={{ width: widthOf(wired) }} />
            <div style={{ width: widthOf(Math.max(0, total - wired)) }} />
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>The warm colour is money in the bank; green is committed or signed and still to be wired.</div>
        </div>
      ) : setupLeft === 0 ? (
        <Hint title="No round is open">Create your next round under <Link href="/rounds">Rounds</Link> to track commitments against a target.</Hint>
      ) : null}

      <div className="card">
        <h2>Needs you today</h2>
        {items.length === 0 ? (
          <div className="empty">Nothing is waiting on you. {leads.length === 0 ? <>Add a lead to the <Link href="/pipeline">pipeline</Link> to get going.</> : "Good moment to reach out to a new investor."}</div>
        ) : (
          <>
            <ul className="steps">
              {topItems.map((it, i) => (
                <li key={i} className={i === 0 ? "next" : ""}>
                  <span className="tick" style={it.urgent ? { color: "var(--accent)", borderColor: "var(--accent)" } : undefined}>{it.urgent ? "!" : ""}</span>
                  <div className="step-body">{it.text}</div>
                  <Link className={`btn small ${i === 0 ? "primary" : ""}`} href={it.href}>{it.cta}</Link>
                </li>
              ))}
            </ul>
            {moreItems.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary>{moreItems.length} more, when you are ready</summary>
                <ul className="steps">
                  {moreItems.map((it, i) => (
                    <li key={i}>
                      <span className="tick" />
                      <div className="step-body">{it.text}</div>
                      <Link className="btn small" href={it.href}>{it.cta}</Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>

      {plants.length > 0 && (
        <div className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>Your garden</h2>
            <span className="muted small">Each investor grows as the conversation does. Blooms are money in the bank.</span>
          </div>
          <div className="garden">
            {plants.map((pl) => (
              <Link key={pl.id} href={`/pipeline/${pl.id}`} title={`${pl.org_name}: ${pl.stage}`}>
                <Sprout stage={GROWTH[pl.stage] ?? 0} size={GROWTH[pl.stage] === 4 ? 64 : 56} />
                <span>{pl.org_name}</span>
                <small>{pl.stage}</small>
              </Link>
            ))}
          </div>
        </div>
      )}

      {setupLeft === 0 && <div className="card">
        <div className="row" style={{ gap: 20, alignItems: "center", flexWrap: "nowrap" }}>
          <div className="ring" style={{ ["--p" as string]: health.score } as React.CSSProperties}><b>{health.score}</b></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ marginBottom: 4 }}>Room health {health.streak > 1 && <span className="badge ok">{health.streak} updates in a row</span>}</h2>
            {toStrengthen.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Everything an investor expects is in place. Keep it current.</p>
            ) : (
              <>
                <p className="muted small" style={{ marginBottom: 6 }}>How ready the room is for an investor to walk in. The quickest ways to raise it:</p>
                <div className="row">
                  {toStrengthen.map((i) => <Link key={i.title} className="btn small" href={i.href} title={i.help}>{i.title}</Link>)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>}

      <Hint title="A thought for today">{noteOfTheDay()}</Hint>

      <div className="grid2">
        <div className="card">
          <h2>Coming up</h2>
          {upcoming.length === 0 ? <p className="muted small">No follow-ups scheduled. Set a next action on each lead card so nothing goes quiet.</p> : (
            <div className="table-wrap"><table className="table"><tbody>
              {upcoming.map((l) => (
                <tr key={l.id}>
                  <td className="nowrap small muted">{l.next_action_due}</td>
                  <td><Link href={`/pipeline/${l.id}`}>{l.org_name}</Link><div className="small muted">{l.next_action}</div></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </div>
        <div className="card">
          <div className="spread"><h2 style={{ margin: 0 }}>Recent investor activity</h2><Link className="small" href="/activity">All activity</Link></div>
          {recent.length === 0 ? <p className="muted small" style={{ marginTop: 8 }}>Nothing yet. Once investors and supporters sign in, what they look at shows up here.</p> : (
            <ul className="small" style={{ margin: "10px 0 0", paddingLeft: 20 }}>
              {recent.map((r) => <li key={r.id}><strong>{r.who}</strong>{r.org ? ` (${r.org})` : ""} {r.what} <span className="muted">· {ago(r.created_at)}</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
