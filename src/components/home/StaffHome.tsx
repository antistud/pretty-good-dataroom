import Link from "next/link";
import type { Viewer } from "@/lib/auth";
import { getSetting, q, q1 } from "@/lib/db";
import { ago, money, monthLabel } from "@/lib/format";
import { updateDue } from "@/lib/updates";
import { currentRound, roundTotals } from "@/lib/rounds";
import { ACTIVE_STAGES, humanDay, recentExternalActivity, suggestions, today, type Lead } from "@/lib/pipeline";
import { Welcome } from "@/components/Path";
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
    { title: "Create your round", help: "Target amount, SAFE cap and discount. Commitments in the pipeline attach to these terms.", href: "/rounds/new", done: count("SELECT COUNT(*) AS n FROM rounds") > 0 },
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

  const dated = q<{ id: number; title: string; needed_by: string; org: string | null }>(
    `SELECT r.id, r.title, r.needed_by, o.name AS org FROM requests r LEFT JOIN orgs o ON o.id = r.org_id
      WHERE r.status IN ('open','in_progress') AND r.needed_by IS NOT NULL ORDER BY r.needed_by LIMIT 5`,
  );
  for (const r of dated) {
    items.push({ text: `${r.org ?? "An investor"} needs "${r.title}" ${humanDay(r.needed_by)}.`, href: `/requests/${r.id}`, cta: "Open it", urgent: r.needed_by <= new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10) });
  }
  const openRequests = count("SELECT COUNT(*) AS n FROM requests WHERE status IN ('open','in_progress') AND needed_by IS NULL");
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
  const GROUPS: [string, string[]][] = [
    ["In the bank", ["wired"]],
    ["Signed, waiting on the wire", ["signed"]],
    ["Committed", ["committed"]],
    ["In diligence", ["diligence"]],
    ["Talking", ["interested", "meeting"]],
    ["Not yet in conversation", ["lead", "contacted"]],
  ];
  const standing = q<{ id: number; org_name: string; stage: string; check_size: number | null }>(
    `SELECT id, org_name, stage, check_size FROM leads WHERE stage != 'passed' ${round ? "AND (round_id = ? OR round_id IS NULL)" : ""}
      ORDER BY CASE stage WHEN 'wired' THEN 0 WHEN 'signed' THEN 1 WHEN 'committed' THEN 2 WHEN 'diligence' THEN 3 WHEN 'meeting' THEN 4 WHEN 'interested' THEN 5 WHEN 'contacted' THEN 6 ELSE 7 END, updated_at DESC LIMIT 14`,
    ...(round ? [round.id] : []),
  );
  const topItems = items.slice(0, 5);
  const moreItems = items.slice(5);

  const stretch: Record<string, string> = { prepare: "getting ready to raise", list: "building your investor list", conversations: "in the thick of investor conversations", diligence: "in diligence", closing: "bringing the round in", after: "between rounds, keeping your investors close" };
  const words = (n: number) => ["No", "One", "Two", "Three", "Four", "Five"][n] ?? String(n);

  return (
    <>
      <Welcome title={<Greeting name={firstName} />} />

      {isSample && (
        <div className="notice warn spread">
          <span>This is a made-up company, here so you can look around. Clear it before you invite anyone real.</span>
          {me.role === "founder" && <form action={clearSampleAction}><button className="btn small">Clear it and start for real</button></form>}
        </div>
      )}

      <div className="letter">
        <p>
          You are {stretch[season.key] ?? "on your way"}.{" "}
          {round ? (
            <>
              {round.name} stands at <strong>{money(total, true)}</strong>{target ? <> of {money(target, true)}</> : null}
              {wired > 0 ? <>, with {money(wired, true)} already in the bank</> : null}
              {leads.length > 0 ? <>, and {leads.length} conversation{leads.length === 1 ? "" : "s"} still alive</> : null}.
            </>
          ) : (
            <>There is no round set up yet; <Link href="/rounds/new">planning one takes a few minutes</Link>.</>
          )}
        </p>
        {round && target > 0 && (
          <div className="progress" style={{ maxWidth: 520, margin: "4px 0 18px" }}>
            <div className="second" style={{ width: widthOf(wired) }} />
            <div style={{ width: widthOf(Math.max(0, total - wired)) }} />
          </div>
        )}
        <p>
          {items.length === 0
            ? "Nothing is waiting on you today. A good day to reach out to someone new, or to rest."
            : items.length === 1
              ? "Just one thing needs you today:"
              : `${words(Math.min(items.length, 5))} things need you today. Take them in order; one at a time is plenty.`}
        </p>
      </div>

      {items.length > 0 && (
        <>
          <ol className="todo">
            {topItems.map((it, i) => (
              <li key={i}><span>{it.text}</span><Link className="go" href={it.href}>{it.cta} →</Link></li>
            ))}
          </ol>
          {moreItems.length > 0 && (
            <details style={{ marginBottom: 20 }}>
              <summary>and {moreItems.length} more, whenever you are ready</summary>
              <ul className="quiet-list">
                {moreItems.map((it, i) => <li key={i}>{it.text} <Link href={it.href}>{it.cta}</Link></li>)}
              </ul>
            </details>
          )}
        </>
      )}

      {setupLeft > 0 && nextSetup && (
        <div className="card">
          <h2>Before your first visitor</h2>
          <p style={{ maxWidth: "66ch" }}>
            {setupLeft === setup.length ? "The room is empty, which is exactly where everyone starts." : `${setup.length - setupLeft} of ${setup.length} done.`}{" "}
            Next: <strong>{nextSetup.title.toLowerCase()}</strong>. {nextSetup.help}
          </p>
          <p><Link className="btn primary" href={nextSetup.href}>{nextSetup.title}</Link></p>
          <details>
            <summary>See the whole list</summary>
            <ul className="steps">
              {setup.map((s) => (
                <li key={s.title} className={s.done ? "done" : ""}>
                  <span className="tick">✓</span>
                  <div className="step-body"><div className="step-title">{s.done ? s.title : <Link href={s.href}>{s.title}</Link>}</div></div>
                </li>
              ))}
            </ul>
          </details>
          {canSample && (
            <form action={loadSampleAction} style={{ marginTop: 14 }}>
              <span className="muted">Rather look around first? </span>
              <button className="linkbtn">Show me a made-up company</button>
            </form>
          )}
        </div>
      )}

      {standing.length > 0 && (
        <div className="card">
          <h2>Where everyone stands</h2>
          <div className="letter" style={{ marginBottom: 8 }}>
            {GROUPS.map(([label, stages]) => {
              const inGroup = standing.filter((l) => stages.includes(l.stage));
              if (!inGroup.length) return null;
              return (
                <p key={label}>
                  <span className="muted">{label}:</span>{" "}
                  {inGroup.map((l, i) => (
                    <span key={l.id}>
                      {i > 0 ? ", " : ""}
                      <Link href={`/pipeline/${l.id}`}>{l.org_name}</Link>
                      {l.check_size ? <span className="muted"> ({money(l.check_size, true)})</span> : null}
                    </span>
                  ))}
                  .
                </p>
              );
            })}
          </div>
        </div>
      )}

      <blockquote className="thought">
        {noteOfTheDay()}
        <footer>A thought for today · <Link href={`/guide#${season.key}`}>more on {season.label.toLowerCase()} in your guide</Link></footer>
      </blockquote>

      {setupLeft === 0 && toStrengthen.length > 0 && (
        <p className="muted" style={{ maxWidth: "70ch" }}>
          The room is about {health.score}% of the way to everything an investor expects. The quickest things to add:{" "}
          {toStrengthen.map((i, n) => <span key={i.title}>{n > 0 ? ", " : ""}<Link href={i.href}>{i.title.toLowerCase()}</Link></span>)}.
          {health.streak > 1 ? ` You have sent ${health.streak} monthly updates in a row.` : ""}
        </p>
      )}

      <div className="grid2">
        <div className="card">
          <h2>Coming up</h2>
          {upcoming.length === 0 ? <p className="muted">Nothing scheduled. Setting a next step on each investor keeps anyone from going quiet.</p> : (
            <ul className="quiet-list">
              {upcoming.map((l) => (
                <li key={l.id}><Link href={`/pipeline/${l.id}`}>{l.org_name}</Link>: {l.next_action} <span className="muted small">· {humanDay(l.next_action_due)}</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h2>Lately in the room</h2>
          {recent.length === 0 ? <p className="muted">Quiet so far. When investors and supporters sign in, you will see what they read here.</p> : (
            <>
              <ul className="quiet-list">
                {recent.slice(0, 6).map((r) => <li key={r.id}>{r.who} {r.what} <span className="muted small">· {ago(r.created_at)}</span></li>)}
              </ul>
              <p style={{ marginTop: 8 }}><Link href="/activity">Everything that has happened</Link></p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
