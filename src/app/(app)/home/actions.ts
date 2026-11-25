"use server";

import { requireFounder } from "@/lib/auth";
import { clearSample, loadSample } from "@/lib/sample";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";

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
