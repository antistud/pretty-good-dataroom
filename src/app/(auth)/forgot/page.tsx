import { Field, Flash } from "@/components/ui";
import { forgotAction } from "../actions";

export default async function Forgot({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <div className="card">
      <h1>Forgot your password?</h1>
      <p className="muted" style={{ marginTop: 6 }}>Type your email and we will send a link to choose a new one.</p>
      <Flash sp={await searchParams} />
      <form action={forgotAction}>
        <Field label="Email"><input name="email" type="email" required /></Field>
        <div className="spread"><button className="btn primary">Send reset link</button><a href="/login" className="small">Back to sign in</a></div>
      </form>
    </div>
  );
}
