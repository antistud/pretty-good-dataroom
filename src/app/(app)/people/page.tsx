import { requireStaff } from "@/lib/auth";
import { q } from "@/lib/db";
import { ago, fmtDate, tierName } from "@/lib/format";
import { Field, Flash, PageHead } from "@/components/ui";
import { createOrgAction, inviteAction, revokeInviteAction, setOrgTierAction, setUserDisabledAction } from "./actions";

type Org = { id: number; name: string; kind: string; tier: number };
type User = { id: number; email: string; name: string; title: string | null; role: string; org_id: number | null; disabled: number; last_seen_at: string | null; totp_enabled: number };
type Invite = { id: number; email: string; role: string; org_id: number | null; expires_at: string; inviter: string | null };

export default async function People({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireStaff();
  const tiers = q<{ level: number; name: string }>("SELECT level, name FROM tiers ORDER BY level");
  const orgs = q<Org>("SELECT * FROM orgs ORDER BY kind, name");
  const users = q<User>("SELECT id, email, name, title, role, org_id, disabled, last_seen_at, totp_enabled FROM users ORDER BY name");
  const invites = q<Invite>(
    `SELECT i.id, i.email, i.role, i.org_id, i.expires_at, u.name AS inviter FROM invites i LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.accepted_at IS NULL AND i.revoked = 0 AND i.expires_at > ? ORDER BY i.created_at DESC`,
    new Date().toISOString(),
  );
  const staff = users.filter((u) => u.role === "founder" || u.role === "team");

  const userRow = (u: User) => (
    <tr key={u.id}>
      <td>
        <strong>{u.name}</strong> {u.disabled ? <span className="badge bad">access removed</span> : null}
        <div className="muted small">{u.email}{u.title ? ` · ${u.title}` : ""}</div>
      </td>
      <td className="small">{u.role}{u.totp_enabled ? " · 2FA" : ""}</td>
      <td className="small muted">Last seen {ago(u.last_seen_at)}</td>
      <td className="right nowrap">
        {u.id !== me.id && (
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <form action={setUserDisabledAction}>
              <input type="hidden" name="user_id" value={u.id} />
              <input type="hidden" name="disabled" value={u.disabled ? "0" : "1"} />
              <button className={`linkbtn small ${u.disabled ? "" : "danger"}`}>{u.disabled ? "Restore access" : "Remove access"}</button>
            </form>
          </div>
        )}
      </td>
    </tr>
  );

  return (
    <>
      <PageHead title="People & access" sub="Access belongs to the firm. Members can invite their own colleagues." />
      <Flash sp={await searchParams} />

      <div className="grid2">
        <div className="card">
          <h2>Add an investor firm or supporter</h2>
          <form action={createOrgAction}>
            <Field label="Name" hint="The firm's name, or the person's name for an individual angel or supporter."><input name="name" required maxLength={120} /></Field>
            <div className="grid2">
              <Field label="Type">
                <select name="kind" defaultValue="investor">
                  <option value="investor">Investor</option>
                  <option value="supporter">Supporter (updates only)</option>
                </select>
              </Field>
              <Field label="Investor access tier" hint="Ignored for supporters.">
                <select name="tier" defaultValue="1">
                  {tiers.map((t) => <option key={t.level} value={t.level}>{t.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid2">
              <Field label="First contact's email (optional)"><input name="email" type="email" /></Field>
              <Field label="Their name (optional)"><input name="contact" maxLength={120} /></Field>
            </div>
            <button className="btn primary">Add and invite</button>
          </form>
        </div>
        <div className="card">
          <h2>Invite a person</h2>
          <form action={inviteAction}>
            <Field label="Email"><input name="email" type="email" required /></Field>
            <Field label="Name (optional)"><input name="name" maxLength={120} /></Field>
            <Field label="Joining">
              <select name="org_id" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.kind})</option>)}
              </select>
            </Field>
            <input type="hidden" name="role" value="external" />
            <button className="btn primary">Invite</button>
          </form>
          {me.role === "founder" && (
            <details style={{ marginTop: 14 }}>
              <summary>Invite a co-founder or team member instead</summary>
              <form action={inviteAction}>
                <Field label="Email"><input name="email" type="email" required /></Field>
                <Field label="Name (optional)"><input name="name" maxLength={120} /></Field>
                <Field label="Role" hint="Founders can change settings and people. Team members can edit content and work the pipeline.">
                  <select name="role" defaultValue="team"><option value="team">Team member</option><option value="founder">Founder</option></select>
                </Field>
                <button className="btn">Invite to the company side</button>
              </form>
            </details>
          )}
        </div>
      </div>

      {invites.length > 0 && (
        <div className="card">
          <h2>Waiting to accept</h2>
          <div className="table-wrap"><table className="table"><tbody>
            {invites.map((i) => (
              <tr key={i.id}>
                <td>{i.email}</td>
                <td className="small">{i.org_id ? orgs.find((o) => o.id === i.org_id)?.name : i.role}</td>
                <td className="small muted">Invited by {i.inviter ?? "—"} · expires {fmtDate(i.expires_at)}</td>
                <td className="right"><form action={revokeInviteAction}><input type="hidden" name="invite_id" value={i.id} /><button className="linkbtn small danger">Cancel</button></form></td>
              </tr>
            ))}
          </tbody></table></div>
          <p className="muted small" style={{ marginTop: 8 }}>Lost a link? Invite the same email again; the old link stops working and you get a new one.</p>
        </div>
      )}

      {orgs.length === 0 && <div className="empty">No investors or supporters yet. Add your first one above, or start from the Pipeline.</div>}
      {orgs.map((o) => {
        const members = users.filter((u) => u.org_id === o.id);
        return (
          <div className="card" key={o.id}>
            <div className="spread">
              <h2 style={{ margin: 0 }}>{o.name} <span className={`badge ${o.kind === "supporter" ? "grey" : ""}`}>{o.kind === "supporter" ? "Supporter" : tierName(o.tier)}</span></h2>
              <form action={setOrgTierAction} className="row">
                <input type="hidden" name="org_id" value={o.id} />
                <select name="tier" defaultValue={String(o.kind === "supporter" ? 0 : o.tier)} style={{ width: "auto" }}>
                  <option value="0">Supporter (updates only)</option>
                  {tiers.map((t) => <option key={t.level} value={t.level}>Investor: {t.name}</option>)}
                </select>
                <button className="btn small">Change access</button>
              </form>
            </div>
            {members.length === 0 ? <p className="muted small" style={{ marginTop: 8 }}>Nobody has joined yet.</p> : (
              <div className="table-wrap"><table className="table"><tbody>{members.map(userRow)}</tbody></table></div>
            )}
          </div>
        );
      })}

      <div className="card">
        <h2>Company side</h2>
        <div className="table-wrap"><table className="table"><tbody>{staff.map(userRow)}</tbody></table></div>
      </div>
    </>
  );
}
