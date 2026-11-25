import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { getSetting, q, q1 } from "@/lib/db";
import { totpUri } from "@/lib/totp";
import { CATEGORIES } from "@/lib/notify";
import { Field, Flash, Hint, PageHead } from "@/components/ui";
import { changePasswordAction, confirmTotpAction, disableTotpAction, emailPrefAction, inviteColleagueAction, startTotpAction } from "./actions";

export default async function Account({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireUser();
  const row = q1<{ totp_secret: string | null; email_opt_out: number }>("SELECT totp_secret, email_opt_out FROM users WHERE id = ?", me.id)!;
  const pendingSecret = !me.totpEnabled ? row.totp_secret : null;
  const qr = pendingSecret ? await QRCode.toString(totpUri(pendingSecret, me.email, getSetting("company_name")), { type: "svg", margin: 1, width: 180 }) : null;
  const prefs = Object.fromEntries(q<{ category: string; email: number }>("SELECT category, email FROM notification_prefs WHERE user_id = ?", me.id).map((p) => [p.category, p.email]));
  const cats = Object.entries(CATEGORIES).filter(([, c]) => c.who === "all" || (c.who === "staff") === me.isStaff);
  const colleagues = me.orgId ? q<{ name: string; email: string }>("SELECT name, email FROM users WHERE org_id = ? AND disabled = 0 ORDER BY name", me.orgId) : [];

  return (
    <>
      <PageHead title="Account" sub={me.email} />
      <Flash sp={await searchParams} />

      {!me.isStaff && me.orgId && (
        <div className="card">
          <h2>Your team at {me.orgName}</h2>
          <Hint>Working on this with colleagues? Invite them here. They join {me.orgName}, see exactly what you see, and share your requests. They cannot see more than you do.</Hint>
          <ul>{colleagues.map((c) => <li key={c.email}>{c.name} <span className="muted small">{c.email}</span></li>)}</ul>
          <form action={inviteColleagueAction} className="inline-form">
            <Field label="Colleague's email"><input name="email" type="email" required /></Field>
            <Field label="Their name"><input name="name" maxLength={120} /></Field>
            <button className="btn primary">Invite colleague</button>
          </form>
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <h2>Change password</h2>
          <form action={changePasswordAction}>
            <Field label="Current password"><input name="current" type="password" required autoComplete="current-password" /></Field>
            <Field label="New password" hint="At least 10 characters."><input name="next" type="password" required minLength={10} autoComplete="new-password" /></Field>
            <button className="btn">Change password</button>
          </form>
        </div>
        <div className="card">
          <h2>Two-step sign-in</h2>
          {me.totpEnabled ? (
            <>
              <p><span className="badge ok">On</span> You are asked for a code from your authenticator app each time you sign in.</p>
              <form action={disableTotpAction}>
                <Field label="Password, to turn it off"><input name="current" type="password" required /></Field>
                <button className="btn danger">Turn off</button>
              </form>
            </>
          ) : pendingSecret ? (
            <>
              <p>1. Scan this with an authenticator app (1Password, Google Authenticator, Authy).</p>
              <div style={{ background: "#fff", display: "inline-block", padding: 6, borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: qr! }} />
              <p className="small muted">Or type this key by hand: <code>{pendingSecret}</code></p>
              <form action={confirmTotpAction}>
                <Field label="2. Type the 6-digit code it shows"><input name="code" inputMode="numeric" required /></Field>
                <button className="btn primary">Turn on</button>
              </form>
            </>
          ) : (
            <>
              <p className="muted">Adds a 6-digit code from your phone when you sign in. Recommended for founders.</p>
              <form action={startTotpAction}><button className="btn">Set up two-step sign-in</button></form>
            </>
          )}
        </div>
      </div>

      <div className="card" id="email">
        <h2>What reaches your inbox</h2>
        <p className="muted" style={{ marginTop: -6, maxWidth: "62ch" }}>Everything always appears under <a href="/notifications">What&apos;s new</a>. Choose which of it should also be emailed to {me.email}.</p>
        <form action={emailPrefAction}>
          <p><label className="row"><input type="checkbox" name="emails" defaultChecked={!row.email_opt_out} /> <strong>Send me emails</strong></label></p>
          <div style={{ paddingLeft: 26 }}>
            {cats.map(([key, c]) => (
              <p key={key} style={{ marginBottom: 6 }}><label className="row"><input type="checkbox" name={`cat_${key}`} defaultChecked={prefs[key] !== 0} /> {c.label}</label></p>
            ))}
          </div>
          <p className="muted small">Sign-in and password emails are always sent.</p>
          <button className="btn">Save</button>
        </form>
      </div>
    </>
  );
}
