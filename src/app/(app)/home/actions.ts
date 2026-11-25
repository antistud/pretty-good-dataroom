"use server";

import { run } from "@/lib/db";
import { requireFounder, requireUser } from "@/lib/auth";
import { clearSample, loadSample } from "@/lib/sample";
import { logActivity } from "@/lib/activity";
import { STEP_KEYS, onboardScope } from "@/lib/onboarding";
import { flash } from "@/lib/flash";

/** Lets an investor tick off (or untick) a "Start here" step by hand. Only ever touches their own checklist. */
export async function markStepAction(form: FormData) {
  const me = await requireUser();
  const key = String(form.get("key") ?? "");
  if (me.isStaff || !STEP_KEYS.includes(key)) flash("/home", "That step was not found.", "error");
  if (form.get("undo") === "1") run("DELETE FROM checks WHERE scope = ? AND key = ?", onboardScope(me.id), key);
  else run("INSERT OR IGNORE INTO checks (scope, key) VALUES (?, ?)", onboardScope(me.id), key);
  flash("/home", "Checklist updated.");
}

export async function loadSampleAction() {
  const me = await requireFounder();
  if (!loadSample()) flash("/home", "Sample data can only be loaded into an empty room.", "error");
  logActivity(me, "sample.load");
  flash("/home", "A sample company is loaded. Look around, then clear it from this page when you are ready to start for real.");
}

export async function clearSampleAction() {
  const me = await requireFounder();
  clearSample();
  logActivity(me, "sample.clear");
  flash("/home", "Sample data cleared. The room is yours.");
}
