import { redirect } from "next/navigation";
import { pendingEmail } from "@/lib/auth";
import { Field, Flash } from "@/components/ui";
import { requestCodeAction, verifyCodeAction } from "../../actions";

export default async function Code({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const email = await pendingEmail();
  if (!email) redirect("/login");
  return (
    <div className="card">
      <h1>Check your email</h1>
      <p className="muted" style={{ marginTop: 6 }}>
        If <strong>{email}</strong> has access, a six-digit code is on its way. It expires in ten minutes.
      </p>
      <Flash sp={await searchParams} />
      <form action={verifyCodeAction}>
        <Field label="Six-digit code">
          <input name="code" inputMode="numeric" pattern="[0-9 ]*" autoComplete="one-time-code" maxLength={7} required autoFocus style={{ fontSize: 24, letterSpacing: "0.2em", textAlign: "center" }} />
        </Field>
        <button className="btn primary">Sign in</button>
      </form>
      <form action={requestCodeAction} style={{ marginTop: 16 }}>
        <input type="hidden" name="email" value={email} />
        <span className="muted small">Nothing arrived? Check spam, then </span>
        <button className="linkbtn small">send a new code</button>
        <span className="muted small"> or <a href="/login">use a different email</a>.</span>
      </form>
    </div>
  );
}
