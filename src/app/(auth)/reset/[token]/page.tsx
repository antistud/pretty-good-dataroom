import { q1 } from "@/lib/db";
import { hashToken } from "@/lib/auth";
import { Field, Flash } from "@/components/ui";
import { resetAction } from "../../actions";

export default async function Reset({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string>> }) {
  const { token } = await params;
  const valid = q1("SELECT 1 FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > ?", hashToken(token), new Date().toISOString());
  if (!valid) {
    return (
      <div className="card">
        <h1>This reset link no longer works</h1>
        <p className="muted" style={{ marginTop: 6 }}>Reset links last one hour and work once. <a href="/forgot">Ask for a new one</a>.</p>
      </div>
    );
  }
  return (
    <div className="card">
      <h1>Choose a new password</h1>
      <Flash sp={await searchParams} />
      <form action={resetAction}>
        <input type="hidden" name="token" value={token} />
        <Field label="New password" hint="At least 10 characters."><input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
        <button className="btn primary">Save password</button>
      </form>
    </div>
  );
}
