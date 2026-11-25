import Link from "next/link";
import { Welcome } from "@/components/Path";
import { FounderNote } from "@/components/FounderNote";
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
      <Welcome title={`Welcome, ${me.name.split(" ")[0]}`} />
      <FounderNote kind="supporter" firstName={me.name.split(" ")[0]} />

      <div className="card">
        <h2>The latest from us</h2>
        {latest ? (
          <p><Link href={`/updates/${latest.id}`}>{latest.title}</Link> <span className="muted small">· {monthLabel(latest.period)}</span></p>
        ) : (
          <p className="muted">Nothing published yet. We will email you when the first update is out.</p>
        )}
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
