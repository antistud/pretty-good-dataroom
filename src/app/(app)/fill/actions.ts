"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { q1, run } from "@/lib/db";
import { appUrl, hashToken, requireStaff } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { formStr } from "@/lib/format";
import { parseAnswer } from "@/lib/docfill";
import { applyAnswer } from "@/lib/docfill-apply";
import { CONNECTOR_DAYS, newConnectorToken } from "@/lib/mcp";

export async function createConnectorAction(form: FormData) {
  const me = await requireStaff();
  const active = q1<{ n: number }>("SELECT COUNT(*) AS n FROM mcp_tokens WHERE user_id = ? AND revoked = 0", me.id)?.n ?? 0;
  if (active >= 5) flash("/fill", "You already have five connector links. Turn one off before making another.", "error");
  const token = newConnectorToken();
  const label = formStr(form.get("label"), 60) || "My AI assistant";
  const days = CONNECTOR_DAYS.includes(Number(form.get("days"))) ? Number(form.get("days")) : 7;
  const canRead = form.get("can_read") === "on" ? 1 : 0;
  run("INSERT INTO mcp_tokens (user_id, token_hash, label, expires_at, can_read) VALUES (?,?,?, datetime('now', ?), ?)", me.id, hashToken(token), label, `+${days} days`, canRead);
  logActivity(me, "connector.create", undefined, undefined, `${label}: ${canRead ? "can read and suggest" : "suggestions only"}, ${days} days`);
  // The key is shown once, handed to the next page in a short-lived
  // cookie so it never appears in a URL, the browser history or a log.
  (await cookies()).set("pgd_new_connector", token, { httpOnly: true, sameSite: "strict", secure: appUrl().startsWith("https://"), path: "/fill", maxAge: 300 });
  flash("/fill", "Your connector is ready below. Copy it now; the key is shown only once.");
}

export async function revokeConnectorAction(form: FormData) {
  const me = await requireStaff();
  run("UPDATE mcp_tokens SET revoked = 1 WHERE id = ? AND user_id = ?", Number(form.get("id")), me.id);
  (await cookies()).delete({ name: "pgd_new_connector", path: "/fill" });
  logActivity(me, "connector.revoke");
  flash("/fill", "That connector is off. The assistant using it can no longer reach the room.");
}

export async function hideConnectorAction() {
  await requireStaff();
  (await cookies()).delete({ name: "pgd_new_connector", path: "/fill" });
  flash("/fill", "Hidden. If you did not copy it, turn that connector off and make a new one.");
}

/** The paste-back route: the founder pastes their assistant's answer and it becomes a suggestion to review. */
export async function pasteAnswerAction(form: FormData) {
  const me = await requireStaff();
  const answer = parseAnswer(String(form.get("answer") ?? ""));
  if (!answer) flash("/fill", "We could not find the details in that. Paste the assistant's whole reply, including the block that starts with { and ends with }.", "error");
  run("INSERT INTO proposals (user_id, source, payload) VALUES (?, 'pasted', ?)", me.id, JSON.stringify(answer));
  logActivity(me, "proposal.create", undefined, undefined, "pasted");
  flash("/fill", "Here is what was found. Tick what you want to keep.");
}

export async function applyProposalAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("proposal_id"));
  const row = q1<{ payload: string }>("SELECT payload FROM proposals WHERE id = ? AND status = 'pending'", id);
  const answer = row ? parseAnswer(row.payload) : null;
  if (!answer) flash("/fill", "That suggestion is no longer available.", "error");
  const picked = new Set<string>();
  form.forEach((v, k) => { if (v === "on") picked.add(k); });
  const done = applyAnswer(answer!, picked);
  run("UPDATE proposals SET status = 'applied' WHERE id = ?", id);
  logActivity(me, "proposal.apply", undefined, undefined, done.join(", ") || "nothing selected");
  // The company name sits in the header shared by every page.
  revalidatePath("/", "layout");
  flash("/fill", done.length ? `Added: ${done.join(", ")}. Have a look at each page and adjust anything that is not quite right.` : "Nothing was ticked, so nothing was added.", "ok", done.length ? "ready" : undefined);
}

export async function dismissProposalAction(form: FormData) {
  await requireStaff();
  run("UPDATE proposals SET status = 'dismissed' WHERE id = ? AND status = 'pending'", Number(form.get("proposal_id")));
  flash("/fill", "Suggestion discarded. Nothing was changed.");
}
