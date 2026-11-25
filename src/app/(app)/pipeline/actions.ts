"use server";

import { q1, run } from "@/lib/db";
import { requireStaff, type Viewer } from "@/lib/auth";
import { createInvite } from "@/lib/invites";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { formNum, formStr, money } from "@/lib/format";
import { STAGES, isStage, stageOf, tierLevelForRank, type Lead, type StageKey } from "@/lib/pipeline";

function getLead(id: number): Lead {
  const lead = q1<Lead>("SELECT * FROM leads WHERE id = ?", id);
  if (!lead) flash("/pipeline", "That lead no longer exists.", "error");
  return lead!;
}

function formDate(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function formRound(v: FormDataEntryValue | null): number | null {
  const id = Number(v);
  return id && q1("SELECT 1 FROM rounds WHERE id = ?", id) ? id : null;
}

/** Moves a lead and keeps data room access and SAFE status in step with the stage. */
function setStage(me: Viewer, lead: Lead, stage: StageKey) {
  run("UPDATE leads SET stage = ?, updated_at = datetime('now') WHERE id = ?", stage, lead.id);
  const rank = stageOf(stage).tierRank;
  if (lead.org_id && rank > 0) {
    const level = tierLevelForRank(rank);
    // Access only ever goes up automatically. Lowering is a deliberate choice on the lead page.
    run("UPDATE orgs SET kind = 'investor', tier = MAX(CASE WHEN kind = 'investor' THEN tier ELSE 0 END, ?) WHERE id = ?", level, lead.org_id);
    run("UPDATE users SET role = 'investor' WHERE org_id = ? AND role = 'supporter'", lead.org_id);
    run("UPDATE invites SET role = 'investor' WHERE org_id = ? AND accepted_at IS NULL", lead.org_id);
  }
  if (stage === "signed" || stage === "wired" || stage === "committed") {
    run(
      `UPDATE safes SET status = ?, signed_on = CASE WHEN ? = 'committed' THEN signed_on ELSE COALESCE(signed_on, date('now')) END
        WHERE ((? IS NOT NULL AND org_id = ?) OR (org_id IS NULL AND investor_name = ?)) AND IFNULL(round_id, 0) = IFNULL(?, 0)`,
      stage,
      stage,
      lead.org_id,
      lead.org_id,
      lead.org_name,
      lead.round_id,
    );
  }
  logActivity(me, "lead.stage", "lead", lead.id, `${lead.org_name}: ${lead.stage} -> ${stage}`);
}

export async function addLeadAction(form: FormData) {
  const me = await requireStaff();
  const orgName = formStr(form.get("org_name"), 120);
  if (!orgName) flash("/pipeline", "Give the lead a firm or investor name.", "error");
  const email = formStr(form.get("contact_email"), 200).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) flash("/pipeline", "That email address doesn't look right.", "error");
  const roundId = formRound(form.get("round_id"));
  const res = run(
    "INSERT INTO leads (round_id, org_name, contact_name, contact_email, check_size, source) VALUES (?,?,?,?,?,?)",
    roundId,
    orgName,
    formStr(form.get("contact_name"), 120) || null,
    email || null,
    formNum(form.get("check_size")),
    formStr(form.get("source"), 200) || null,
  );
  const id = Number(res.lastInsertRowid);
  logActivity(me, "lead.create", "lead", id, orgName);
  flash(`/pipeline/${id}`, `${orgName} added. The panel below tells you what to do next.`);
}

export async function updateLeadAction(form: FormData) {
  const me = await requireStaff();
  const lead = getLead(Number(form.get("lead_id")));
  const back = `/pipeline/${lead.id}`;
  const orgName = formStr(form.get("org_name"), 120);
  if (!orgName) flash(back, "The firm name cannot be empty.", "error");
  const email = formStr(form.get("contact_email"), 200).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) flash(back, "That email address doesn't look right.", "error");
  let orgId = lead.org_id;
  if (form.has("org_id")) {
    const raw = Number(form.get("org_id"));
    orgId = raw && q1("SELECT 1 FROM orgs WHERE id = ?", raw) ? raw : null;
  }
  run(
    "UPDATE leads SET org_name = ?, contact_name = ?, contact_email = ?, check_size = ?, source = ?, round_id = ?, org_id = ?, updated_at = datetime('now') WHERE id = ?",
    orgName,
    formStr(form.get("contact_name"), 120) || null,
    email || null,
    formNum(form.get("check_size")),
    formStr(form.get("source"), 200) || null,
    formRound(form.get("round_id")),
    orgId,
    lead.id,
  );
  logActivity(me, "lead.update", "lead", lead.id, orgName);
  flash(back, "Details saved.");
}

export async function setNextActionAction(form: FormData) {
  await requireStaff();
  const lead = getLead(Number(form.get("lead_id")));
  run(
    "UPDATE leads SET next_action = ?, next_action_due = ? WHERE id = ?",
    formStr(form.get("next_action"), 300) || null,
    formDate(form.get("next_action_due")),
    lead.id,
  );
  flash(`/pipeline/${lead.id}`, "Next action saved. It will show on your Today screen when it is due.");
}

export async function addNoteAction(form: FormData) {
  const me = await requireStaff();
  const lead = getLead(Number(form.get("lead_id")));
  const body = formStr(form.get("body"), 4000);
  if (!body) flash(`/pipeline/${lead.id}`, "Write something in the note first.", "error");
  run("INSERT INTO lead_notes (lead_id, user_id, body) VALUES (?,?,?)", lead.id, me.id, body);
  run("UPDATE leads SET updated_at = datetime('now') WHERE id = ?", lead.id);
  flash(`/pipeline/${lead.id}`, "Note added.");
}

export async function moveStageAction(form: FormData) {
  const me = await requireStaff();
  const lead = getLead(Number(form.get("lead_id")));
  const stage = String(form.get("stage") ?? "");
  const back = `/pipeline/${lead.id}`;
  if (!isStage(stage)) flash(back, "Unknown stage.", "error");
  if (stage === "passed") flash(back, "Use the \"They passed\" form so you can record why.", "error");
  const note = formStr(form.get("note"), 4000);
  if (note) run("INSERT INTO lead_notes (lead_id, user_id, body) VALUES (?,?,?)", lead.id, me.id, note);
  if (lead.stage === "passed") run("UPDATE leads SET passed_reason = NULL WHERE id = ?", lead.id);
  setStage(me, lead, stage as StageKey);
  const s = stageOf(stage);
  const access = lead.org_id && s.tierRank > 0 ? " Their data room access was raised to match." : "";
  flash(back, `Moved to ${s.label}.${access}`, "ok", stage === "wired" ? "wired" : undefined);
}

/** Creates the firm (if needed) at teaser access, invites the contact and moves the lead to Interested. */
export async function inviteLeadAction(form: FormData) {
  const me = await requireStaff();
  const lead = getLead(Number(form.get("lead_id")));
  const back = `/pipeline/${lead.id}`;
  if (!lead.contact_email) flash(back, "Add the contact's email under Details first, then invite them.", "error");

  const advance = (l: Lead) => {
    const order = ["lead", "contacted"];
    if (order.includes(l.stage)) setStage(me, l, "interested");
    else setStage(me, l, l.stage); // re-applies the stage's access to a newly linked firm
  };

  // If this person already has an account, link the lead to their firm instead of failing.
  const existing = q1<{ org_id: number | null; role: string }>("SELECT org_id, role FROM users WHERE email = ?", lead.contact_email);
  if (existing) {
    if (!existing.org_id) flash(back, "That email belongs to someone on the company side, so they cannot be invited as an investor.", "error");
    run("UPDATE leads SET org_id = ? WHERE id = ?", existing.org_id, lead.id);
    advance({ ...lead, org_id: existing.org_id });
    flash(back, `${lead.contact_email} already has an account, so this lead is now linked to their firm.`);
  }

  let orgId = lead.org_id;
  if (!orgId) {
    const res = run("INSERT INTO orgs (name, kind, tier) VALUES (?, 'investor', ?)", lead.org_name, tierLevelForRank(1));
    orgId = Number(res.lastInsertRowid);
    run("UPDATE leads SET org_id = ? WHERE id = ?", orgId, lead.id);
    logActivity(me, "org.create", "org", orgId, lead.org_name);
  }
  const linked = { ...lead, org_id: orgId };
  const orgKind = q1<{ kind: "investor" | "supporter" }>("SELECT kind FROM orgs WHERE id = ?", orgId)!.kind;
  const inv = await createInvite(me, { email: lead.contact_email!, name: lead.contact_name ?? undefined, role: orgKind, orgId });
  if (!inv.ok) flash(back, inv.error, "error");
  else {
    advance(linked);
    flash(back, inv.emailed ? `Invitation emailed to ${lead.contact_email}. Link, in case you need it: ${inv.url}` : `Copy this link and send it to ${lead.contact_name || lead.contact_email} yourself: ${inv.url}`);
  }
}

/** Records a yes: writes the SAFE at the round's terms and moves the lead to Committed. */
export async function commitAction(form: FormData) {
  const me = await requireStaff();
  const lead = getLead(Number(form.get("lead_id")));
  const back = `/pipeline/${lead.id}`;
  const amount = formNum(form.get("amount"));
  if (!amount || amount <= 0) flash(back, "Type the amount they committed.", "error");
  const round = lead.round_id
    ? q1<{ instrument: string; valuation_cap: number | null; discount: number | null }>("SELECT instrument, valuation_cap, discount FROM rounds WHERE id = ?", lead.round_id)
    : undefined;
  run("UPDATE leads SET check_size = ? WHERE id = ?", amount, lead.id);
  let extra = "";
  if (round?.instrument === "priced") {
    extra = " This is a priced round, so no SAFE was created; record their shares on the cap table at closing.";
  } else {
    const existing = q1<{ id: number }>(
      "SELECT id FROM safes WHERE ((? IS NOT NULL AND org_id = ?) OR (org_id IS NULL AND investor_name = ?)) AND IFNULL(round_id, 0) = IFNULL(?, 0)",
      lead.org_id,
      lead.org_id,
      lead.org_name,
      lead.round_id,
    );
    if (existing) {
      run("UPDATE safes SET amount = ?, org_id = COALESCE(org_id, ?) WHERE id = ?", amount, lead.org_id, existing.id);
    } else {
      run(
        "INSERT INTO safes (round_id, org_id, investor_name, amount, kind, valuation_cap, discount, status) VALUES (?,?,?,?, 'post', ?, ?, 'committed')",
        lead.round_id,
        lead.org_id,
        lead.org_name,
        amount,
        round?.valuation_cap ?? null,
        round?.discount ?? null,
      );
    }
    extra = round ? " A SAFE at the round's terms was added to the cap table as committed." : " A SAFE was added to the cap table as committed. This lead has no round, so set its cap and discount there.";
  }
  setStage(me, lead, "committed");
  flash(back, `${money(amount)} commitment recorded.${extra}`, "ok", "committed");
}

export async function passAction(form: FormData) {
  const me = await requireStaff();
  const lead = getLead(Number(form.get("lead_id")));
  run(
    "UPDATE leads SET stage = 'passed', passed_reason = ?, next_action = NULL, next_action_due = NULL, updated_at = datetime('now') WHERE id = ?",
    formStr(form.get("reason"), 500) || null,
    lead.id,
  );
  logActivity(me, "lead.stage", "lead", lead.id, `${lead.org_name}: ${lead.stage} -> passed`);
  flash(`/pipeline/${lead.id}`, lead.org_id ? "Marked as passed. Their access has not changed yet: choose what happens to it below." : "Marked as passed.");
}

/** After a pass: keep the firm as supporters, drop them to teaser access, or remove access. */
export async function afterPassAction(form: FormData) {
  const me = await requireStaff();
  const lead = getLead(Number(form.get("lead_id")));
  const back = `/pipeline/${lead.id}`;
  if (!lead.org_id) flash(back, "This lead has no data room access to change.", "error");
  const mode = String(form.get("mode") ?? "");
  if (mode === "supporter") {
    run("UPDATE orgs SET kind = 'supporter', tier = 0 WHERE id = ?", lead.org_id);
    run("UPDATE users SET role = 'supporter' WHERE org_id = ?", lead.org_id);
    run("UPDATE invites SET role = 'supporter' WHERE org_id = ? AND accepted_at IS NULL", lead.org_id);
    logActivity(me, "org.tier", "org", lead.org_id, `${lead.org_name} -> supporter`);
    flash(back, `${lead.org_name} is now a supporter: they keep getting updates, and can no longer see documents, the cap table or financials.`);
  } else if (mode === "teaser") {
    run("UPDATE orgs SET kind = 'investor', tier = ? WHERE id = ?", tierLevelForRank(1), lead.org_id);
    logActivity(me, "org.tier", "org", lead.org_id, `${lead.org_name} -> teaser`);
    flash(back, `${lead.org_name} is back to teaser access.`);
  } else if (mode === "remove") {
    run("UPDATE users SET disabled = 1 WHERE org_id = ?", lead.org_id);
    run("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE org_id = ?)", lead.org_id);
    run("UPDATE invites SET revoked = 1 WHERE org_id = ? AND accepted_at IS NULL", lead.org_id);
    logActivity(me, "org.remove_access", "org", lead.org_id, lead.org_name);
    flash(back, `Everyone at ${lead.org_name} has been signed out and can no longer sign in. You can restore people under People & access.`);
  }
  flash(back, "Choose one of the options.", "error");
}

export async function deleteLeadAction(form: FormData) {
  const me = await requireStaff();
  const lead = getLead(Number(form.get("lead_id")));
  run("DELETE FROM leads WHERE id = ?", lead.id);
  logActivity(me, "lead.delete", "lead", lead.id, lead.org_name);
  flash("/pipeline", `${lead.org_name} removed from the pipeline. Any data room access they had is unchanged.`);
}

/** Called when a card is dragged to another column on the board. */
export async function dragStageAction(leadId: number, stage: string) {
  const me = await requireStaff();
  const lead = getLead(Number(leadId));
  const card = `/pipeline/${lead.id}`;
  if (!isStage(stage) || stage === lead.stage) flash("/pipeline", "Nothing to move.", "error");
  if (stage === "passed") flash(card, "Record why they passed here, then decide what happens to their access.", "error");
  const order = STAGES.map((s) => s.key);
  const committedAt = order.indexOf("committed");
  // A commitment needs an amount, so it is recorded on the card rather than by dragging.
  if (order.indexOf(stage as StageKey) >= committedAt && order.indexOf(lead.stage as StageKey) < committedAt) {
    flash(card, "Lovely. Record the amount they committed here first; that also adds the SAFE to the cap table.");
  }
  if (lead.stage === "passed") run("UPDATE leads SET passed_reason = NULL WHERE id = ?", lead.id);
  setStage(me, lead, stage as StageKey);
  const s = stageOf(stage);
  flash("/pipeline", `${lead.org_name} moved to ${s.label}.${lead.org_id && s.tierRank > 0 ? " Their access was raised to match." : ""}`, "ok", stage === "wired" ? "wired" : undefined);
}
