import { redirect } from "next/navigation";
import { pendingTwofaUserId } from "@/lib/auth";
import { Field, Flash } from "@/components/ui";
import { twofaAction } from "../../actions";

export default async function Twofa({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  if (!(await pendingTwofaUserId())) redirect("/login");
  return (
    <div className="card">
      <h1>Enter your code</h1>
      <p className="muted" style={{ marginTop: 6 }}>Open your authenticator app and type the 6-digit code for this data room.</p>
      <Flash sp={await searchParams} />
      <form action={twofaAction}>
        <Field label="6-digit code"><input name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus /></Field>
        <button className="btn primary">Continue</button>
      </form>
    </div>
  );
}
