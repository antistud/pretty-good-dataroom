"use server";

import { q, q1, run, setSetting, getSetting } from "@/lib/db";
import { requireFounder } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { formLevel, formStr } from "@/lib/format";
import { mailEnabled, sendMail } from "@/lib/mail";

const SECTIONS = ["overview", "team", "updates", "intros", "round", "documents", "requests", "captable", "financials"] as const;

export async function saveCompanyAction(form: FormData) {
  const me = await requireFounder();
  const name = formStr(form.get("company_name"), 120);
  if (!name) flash("/settings", "The company needs a name.", "error");
  setSetting("company_name", name);
  setSetting("tagline", formStr(form.get("tagline"), 200));
  logActivity(me, "settings.company", undefined, undefined, name);
  flash("/settings", "Company details saved.");
}

export async function saveTiersAction(form: FormData) {
  const me = await requireFounder();
  const tiers = q<{ level: number }>("SELECT level FROM tiers ORDER BY level");
  for (const t of tiers) {
    const name = formStr(form.get(`name_${t.level}`), 40);
    if (!name) flash("/settings", "Every tier needs a name.", "error");
  }
  for (const t of tiers) {
    run("UPDATE tiers SET name = ?, can_download = ? WHERE level = ?", formStr(form.get(`name_${t.level}`), 40), form.get(`download_${t.level}`) === "on" ? 1 : 0, t.level);
  }
  logActivity(me, "settings.tiers");
  flash("/settings", "Access tiers saved.");
}

export async function saveSectionsAction(form: FormData) {
  const me = await requireFounder();
  const changes: string[] = [];
  for (const s of SECTIONS) {
    const raw = String(form.get(`level_${s}`) ?? "");
    const level = raw === "999" ? 999 : formLevel(raw, -1);
    if (level < 0) flash("/settings", "Pick an audience for every section.", "error");
    if (String(level) !== getSetting(`level_${s}`)) changes.push(`${s}=${level}`);
    setSetting(`level_${s}`, String(level));
  }
  logActivity(me, "settings.sections", undefined, undefined, changes.join(", ") || "no change");
  flash("/settings", "Section visibility saved.");
}

export async function saveNdaAction(form: FormData) {
  const me = await requireFounder();
  const enabled = form.get("nda_enabled") === "on";
  const text = formStr(form.get("nda_text"), 10000);
  if (enabled && !text) flash("/settings", "Write the confidentiality text before turning it on.", "error");
  setSetting("nda_enabled", enabled ? "1" : "0");
  if (text) setSetting("nda_text", text);
  logActivity(me, "settings.nda", undefined, undefined, enabled ? "on" : "off");
  flash("/settings", enabled ? "Confidentiality step is on. Anyone who has not accepted yet will be asked next time they open the room." : "Confidentiality step is off.");
}

export async function saveUpdateDayAction(form: FormData) {
  const me = await requireFounder();
  const day = Number(form.get("update_due_day"));
  if (!Number.isInteger(day) || day < 1 || day > 28) flash("/settings", "Pick a day between 1 and 28.", "error");
  setSetting("update_due_day", String(day));
  logActivity(me, "settings.update_day", undefined, undefined, String(day));
  flash("/settings", `Monthly update is now due on day ${day} of each month.`);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function readPage(form: FormData) {
  const title = formStr(form.get("title"), 120);
  if (!title) flash("/settings", "Give the page a title.", "error");
  const slug = slugify(formStr(form.get("slug"), 80) || title);
  if (!/^[a-z0-9-]+$/.test(slug)) flash("/settings", "The page address can only use letters, numbers and dashes.", "error");
  const position = Number(form.get("position"));
  return {
    title,
    slug,
    body: formStr(form.get("body_md"), 50000),
    level: formLevel(form.get("min_level"), 100),
    position: Number.isInteger(position) ? position : 0,
  };
}

export async function createPageAction(form: FormData) {
  const me = await requireFounder();
  const p = readPage(form);
  if (q1("SELECT 1 FROM pages WHERE slug = ?", p.slug)) flash("/settings", `There is already a page at /p/${p.slug}. Choose a different address.`, "error");
  const res = run("INSERT INTO pages (slug, title, body_md, min_level, position) VALUES (?,?,?,?,?)", p.slug, p.title, p.body, p.level, p.position);
  logActivity(me, "page.create", "page", Number(res.lastInsertRowid), p.title);
  flash("/settings", `Page “${p.title}” created. It now shows in the menu for the audience you chose.`);
}

export async function updatePageAction(form: FormData) {
  const me = await requireFounder();
  const id = Number(form.get("id"));
  const p = readPage(form);
  if (q1("SELECT 1 FROM pages WHERE slug = ? AND id <> ?", p.slug, id)) flash("/settings", `There is already a page at /p/${p.slug}.`, "error");
  run("UPDATE pages SET slug = ?, title = ?, body_md = ?, min_level = ?, position = ? WHERE id = ?", p.slug, p.title, p.body, p.level, p.position, id);
  logActivity(me, "page.update", "page", id, p.title);
  flash("/settings", `Page “${p.title}” saved.`);
}

export async function deletePageAction(form: FormData) {
  const me = await requireFounder();
  const id = Number(form.get("id"));
  run("DELETE FROM pages WHERE id = ?", id);
  logActivity(me, "page.delete", "page", id);
  flash("/settings", "Page deleted.");
}

export async function testEmailAction() {
  const me = await requireFounder();
  if (!mailEnabled()) flash("/settings", "Email is not set up. Add the SMTP values to your .env file and restart.", "error");
  const ok = await sendMail(me.email, "Test email from your data room", "<p>If you are reading this, email is working. Invitations, monthly updates and reminders will be delivered.</p>");
  logActivity(me, "settings.test_email", undefined, undefined, ok ? "sent" : "failed");
  if (!ok) flash("/settings", "The email could not be sent. Check the SMTP values and the server log for the reason.", "error");
  flash("/settings", `Test email sent to ${me.email}. Check your inbox and spam folder.`);
}

export async function saveWelcomeAction(form: FormData) {
  const me = await requireFounder();
  setSetting("welcome_investor", formStr(form.get("welcome_investor"), 3000));
  setSetting("welcome_supporter", formStr(form.get("welcome_supporter"), 3000));
  logActivity(me, "settings.welcome");
  flash("/settings", "Welcome notes saved. New visitors will see your words.");
}
