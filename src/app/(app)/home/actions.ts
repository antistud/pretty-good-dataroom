"use server";

import { run } from "@/lib/db";
import { requireUser } from "@/lib/auth";
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
