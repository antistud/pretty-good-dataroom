import { redirect } from "next/navigation";
import { mailEnabled } from "@/lib/mail";

/** Shown instead of everything else while the server has no way to send email. */
export default function EmailNeeded() {
  if (mailEnabled()) redirect("/login");
  return (
    <div className="card">
      <h1>Email is not set up</h1>
      <p style={{ marginTop: 8 }}>This data room signs people in with a code sent by email, so it stays closed until it can send email.</p>
      <p className="muted">If you run this server: add the <code>SMTP_</code> settings to <code>/opt/dataroom/.env</code>, then run <code>/opt/dataroom/install.sh</code>. Nothing has been lost; the room opens as soon as email works.</p>
      <p className="muted">If you were invited here: please let the person who invited you know.</p>
    </div>
  );
}
