import Link from "next/link";
import { Welcome } from "@/components/Garden";
import type { Viewer } from "@/lib/auth";
import { canSeeSection } from "@/lib/auth";
import { getSetting, q } from "@/lib/db";
import { fmtDate, monthLabel } from "@/lib/format";
import { visibleUpdates } from "@/lib/onboarding";
import { Hint } from "@/components/ui";

export default async function SupporterHome({ me }: { me: Viewer }) {
  const company = getSetting("company_name");
  const updates = canSeeSection(me, "updates") ? visibleUpdates(me.level, 12) : [];
  const asks = canSeeSection(me, "intros")
    ? q<{ id: number; title: string; detail: string | null }>(
        "SELECT id, title, detail FROM intro_asks WHERE status = 'open' AND min_level <= ? ORDER BY created_at DESC LIMIT 4",
        me.level,
      )
    : [];
  const latest = updates[0];

  return (
    <>
      <Welcome title={`Welcome, ${me.name.split(" ")[0]}`} stage={3}>
        Thank you for backing {company}. This is where you follow along and where you can help.
      </Welcome>

      <Hint title="What being a supporter means">
        You get the monthly update: what went well, what did not, and what the founders need. That is it. No paperwork and nothing to review.
        The best way to help is at the bottom of every update: introduce the founders to someone on their list.
      </Hint>

      <div className="card">
        <h2>Do this first</h2>
        <ol className="steps">
          <li className={latest ? "next" : ""}>
            <span className="tick">✓</span>
            <div className="step-body">
              <div className="step-title">Read the latest update</div>
              <div className="muted small">{latest ? `${latest.title} · ${monthLabel(latest.period)}` : "Nothing published yet. You will get an email when the first one is out."}</div>
            </div>
            {latest && <Link className="btn small primary" href={`/updates/${latest.id}`}>Read it</Link>}
          </li>
          {canSeeSection(me, "intros") && (
            <li>
              <span className="tick">✓</span>
              <div className="step-body">
                <div className="step-title">See who the founders want to meet</div>
                <div className="muted small">If a name or a type of person rings a bell, press “I can intro”. It takes one minute.</div>
              </div>
              <Link className="btn small" href="/intros">Open Set Me Up</Link>
            </li>
          )}
          {canSeeSection(me, "team") && (
            <li>
              <span className="tick">✓</span>
              <div className="step-body">
                <div className="step-title">Meet the team</div>
                <div className="muted small">Who is building {company}.</div>
              </div>
              <Link className="btn small" href="/team">Meet the team</Link>
            </li>
          )}
        </ol>
      </div>

      {canSeeSection(me, "intros") && (
        <div className="card" style={{ borderColor: "var(--brand)" }}>
          <div className="spread">
            <h2 style={{ margin: 0 }}>Set Me Up: who we would love to meet</h2>
            <Link className="btn primary" href="/intros">I can help</Link>
          </div>
          {asks.length === 0 ? (
            <p className="muted" style={{ marginTop: 10 }}>No specific asks right now. If you know someone the founders should meet, you can still suggest them.</p>
          ) : (
            <ul style={{ margin: "12px 0 0", paddingLeft: 18 }}>
              {asks.map((a) => (
                <li key={a.id} style={{ marginBottom: 6 }}>
                  <strong>{a.title}</strong>
                  {a.detail && <div className="muted small">{a.detail}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canSeeSection(me, "updates") && (
        <div className="card">
          <h2>Updates</h2>
          {updates.length === 0 ? (
            <div className="empty">No updates yet.</div>
          ) : (
            <div className="table-wrap"><table className="table"><tbody>
              {updates.map((u) => (
                <tr key={u.id}>
                  <td><Link href={`/updates/${u.id}`}>{u.title}</Link></td>
                  <td className="small muted right">{monthLabel(u.period)} · {fmtDate(u.published_at)}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </div>
      )}

      <p className="muted small">
        Want a colleague or partner to get these too? <Link href="/account">Invite them from your account page</Link>, where you can also change your password and email settings.
      </p>
    </>
  );
}
