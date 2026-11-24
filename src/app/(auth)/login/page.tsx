import { redirect } from "next/navigation";
import { isSetUp } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { Field, Flash } from "@/components/ui";
import { loginAction } from "../actions";

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  if (!isSetUp()) redirect("/setup");
  if (await currentUser()) redirect("/home");
  return (
    <div className="card">
      <h1>Sign in</h1>
      <p className="muted" style={{ marginTop: 6 }}>Access is by invitation. If you were invited, use the link in your invitation first.</p>
      <Flash sp={await searchParams} />
      <form action={loginAction}>
        <Field label="Email"><input name="email" type="email" required autoComplete="username" /></Field>
        <Field label="Password"><input name="password" type="password" required autoComplete="current-password" /></Field>
        <div className="spread">
          <button className="btn primary">Sign in</button>
          <a href="/forgot" className="small">Forgot password?</a>
        </div>
      </form>
    </div>
  );
}
