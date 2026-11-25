"use server";

import { setSetting } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { formStr } from "@/lib/format";

export async function saveOverviewAction(form: FormData) {
  const me = await requireStaff();
  setSetting("tagline", formStr(form.get("tagline"), 200));
  setSetting("overview_md", formStr(form.get("overview_md"), 20000));
  setSetting("fact_stage", formStr(form.get("fact_stage"), 80));
  setSetting("fact_founded", formStr(form.get("fact_founded"), 40));
  setSetting("fact_location", formStr(form.get("fact_location"), 120));
  const website = formStr(form.get("fact_website"), 300);
  if (website && !/^https?:\/\//i.test(website)) flash("/overview", "The website must start with https:// or http://.", "error");
  setSetting("fact_website", website);
  const contact = formStr(form.get("fact_contact_email"), 200);
  if (contact && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) flash("/overview", "The contact email doesn't look right.", "error");
  setSetting("fact_contact_email", contact);
  logActivity(me, "overview.update");
  flash("/overview", "Overview saved.");
}
