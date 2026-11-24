import { findInvite } from "@/lib/invites";
import { getSetting } from "@/lib/db";
import { Field, Flash } from "@/components/ui";
import { acceptInviteAction } from "../../actions";

export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string>> }) {
  const { token } = await params;
  const invite = findInvite(token);
  if (!invite) {
    return (
      <div className="card">
        <h1>This invitation no longer works</h1>
        <p className="muted" style={{ marginTop: 6 }}>It has expired, been used already, or been replaced by a newer one. Ask the person who invited you to send a new link. If you already made an account, <a href="/login">sign in</a>.</p>
      </div>
    );
  }
  const company = getSetting("company_name");
  return (
    <div className="card">
      <h1>Welcome to {company}</h1>
      <p className="muted" style={{ marginTop: 6 }}>
        You are joining as {invite.role === "supporter" ? "a supporter" : invite.role === "investor" ? "an investor" : "a team member"}
        {invite.org_name ? <> with <strong>{invite.org_name}</strong></> : null}. One step: choose a password. After that we will show you exactly what to look at.
      </p>
      <Flash sp={await searchParams} />
      <form action={acceptInviteAction}>
        <input type="hidden" name="token" value={token} />
        <Field label="Email"><input value={invite.email} disabled readOnly /></Field>
        <Field label="Your name"><input name="name" required defaultValue={invite.name ?? ""} maxLength={120} /></Field>
        <Field label="Your title (optional)"><input name="title" maxLength={120} /></Field>
        <Field label="Choose a password" hint="At least 10 characters."><input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
        <button className="btn primary big">Create my account</button>
      </form>
    </div>
  );
}
