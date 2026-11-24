import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/db";
import { acceptNdaAction, logoutAction } from "../actions";

export default async function Nda() {
  const me = await requireUser({ skipNda: true });
  if (me.ndaAccepted || getSetting("nda_enabled") !== "1") redirect("/home");
  return (
    <div className="card">
      <h1>One thing before you start</h1>
      <p className="muted" style={{ marginTop: 6 }}>Please read and accept the confidentiality terms. Your acceptance is recorded with your name and the time.</p>
      <div className="hint" style={{ whiteSpace: "pre-wrap" }}>{getSetting("nda_text")}</div>
      <div className="spread">
        <form action={acceptNdaAction}><button className="btn primary big">I agree</button></form>
        <form action={logoutAction}><button className="linkbtn">Sign out</button></form>
      </div>
    </div>
  );
}
