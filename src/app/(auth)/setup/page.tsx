import { redirect } from "next/navigation";
import { isSetUp } from "@/lib/db";
import { mailEnabled } from "@/lib/mail";
import { Field, Flash } from "@/components/ui";
import { setupAction } from "../actions";

export default async function Setup({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  if (!mailEnabled()) redirect("/email-needed");
  if (isSetUp()) redirect("/login");
  return (
    <div className="card">
      <h1>Set up your data room</h1>
      <p className="muted" style={{ marginTop: 6 }}>This creates the first founder account. You can invite co-founders and change everything else afterwards.</p>
      <Flash sp={await searchParams} />
      <form action={setupAction}>
        <Field label="Company name"><input name="company" required maxLength={120} /></Field>
        <Field label="Your name"><input name="name" required maxLength={120} /></Field>
        <Field label="Your email" hint="This is how you sign in: we email you a code each time. There is no password."><input name="email" type="email" required /></Field>
        {process.env.SETUP_TOKEN && (
          <Field label="Setup token" hint="The SETUP_TOKEN value from your .env file."><input name="setup_token" type="password" required /></Field>
        )}
        <button className="btn primary big">Create data room</button>
      </form>
    </div>
  );
}
