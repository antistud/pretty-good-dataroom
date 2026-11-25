import { redirect } from "next/navigation";
import { isSetUp } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { mailEnabled } from "@/lib/mail";
import { Field, Flash } from "@/components/ui";
import { requestCodeAction } from "../actions";

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  if (!mailEnabled()) redirect("/email-needed");
  if (!isSetUp()) redirect("/setup");
  if (await currentUser()) redirect("/home");
  return (
    <div className="card">
      <h1>Sign in</h1>
      <p className="muted" style={{ marginTop: 6 }}>Enter your email and we will send you a six-digit code. There is no password.</p>
      <Flash sp={await searchParams} />
      <form action={requestCodeAction}>
        <Field label="Email"><input name="email" type="email" required autoComplete="email" autoFocus /></Field>
        <button className="btn primary">Email me a code</button>
      </form>
      <p className="muted small" style={{ marginTop: 16 }}>Access is by invitation. If you were invited, open the link in your invitation email first.</p>
    </div>
  );
}
