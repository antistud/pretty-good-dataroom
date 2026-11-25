"use server";

import { q, q1, run, getSetting } from "@/lib/db";
import { appUrl, requireSection, requireStaff } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { escapeHtml, sendMail } from "@/lib/mail";
import { flash } from "@/lib/flash";
import { notify, staffIds } from "@/lib/notify";
import { formLevel, formStr } from "@/lib/format";

const OFFER_STATUSES = ["offered", "intro_made", "met", "closed"];

export async function saveAskAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("ask_id")) || 0;
  const title = formStr(form.get("title"), 200);
  const detail = formStr(form.get("detail"), 2000);
  const blurb = formStr(form.get("blurb"), 3000);
  const level = formLevel(form.get("min_level"), 0);
  if (!title) flash("/intros", "Say who you want to meet.", "error");
  if (id) {
    run("UPDATE intro_asks SET title = ?, detail = ?, blurb = ?, min_level = ? WHERE id = ?", title, detail || null, blurb || null, level, id);
    logActivity(me, "intro.ask_edit", "intro_ask", id, title);
    flash("/intros", "Ask updated.");
  }
  const res = run("INSERT INTO intro_asks (title, detail, blurb, min_level) VALUES (?,?,?,?)", title, detail || null, blurb || null, level);
  logActivity(me, "intro.ask_create", "intro_ask", Number(res.lastInsertRowid), title);
  flash("/intros", "Ask added. It will also appear in your next update email.");
}

export async function setAskStatusAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("ask_id"));
  const status = form.get("status") === "closed" ? "closed" : "open";
  run("UPDATE intro_asks SET status = ? WHERE id = ?", status, id);
  logActivity(me, "intro.ask_status", "intro_ask", id, status);
  flash("/intros", status === "closed" ? "Ask closed. People no longer see it." : "Ask re-opened.");
}

export async function offerIntroAction(form: FormData) {
  const me = await requireSection("intros");
  const askId = Number(form.get("ask_id")) || null;
  const contact = formStr(form.get("contact_name"), 200);
  const detail = formStr(form.get("contact_detail"), 500);
  const note = formStr(form.get("note"), 2000);
  if (!contact) flash("/intros", "Tell us who you can introduce.", "error");
  let askTitle: string | null = null;
  if (askId) {
    // Only asks this person is allowed to see can be answered.
    const ask = q1<{ title: string }>("SELECT title FROM intro_asks WHERE id = ? AND status = 'open' AND min_level <= ?", askId, me.level);
    if (!ask) flash("/intros", "That ask is no longer open.", "error");
    askTitle = ask!.title;
  }
  const res = run("INSERT INTO intro_offers (ask_id, user_id, contact_name, contact_detail, note) VALUES (?,?,?,?,?)", askId, me.id, contact, detail || null, note || null);
  const id = Number(res.lastInsertRowid);
  logActivity(me, "intro.offer", "intro_offer", id, contact);
  await notify(staffIds().filter((u) => u !== me.id), {
    category: "intros",
    title: `${me.name} can introduce you to ${contact}`,
    body: askTitle ? `For your ask: ${askTitle}` : undefined,
    href: "/intros",
    cta: "Open Set Me Up",
    emailHtml: `<p><strong>${escapeHtml(me.name)}</strong>${me.orgName ? ` (${escapeHtml(me.orgName)})` : ""} offered an introduction to <strong>${escapeHtml(contact)}</strong>${askTitle ? ` for your ask “${escapeHtml(askTitle)}”` : ""}.</p>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}${note ? `<p>${escapeHtml(note).replace(/\n/g, "<br>")}</p>` : ""}<p>Reply to them while it is fresh, and send the forwardable blurb.</p>`,
    mail: { replyTo: me.email },
  });
  flash("/intros", "Thank you. The founders have been told and will follow up with you directly.");
}

export async function setOfferStatusAction(form: FormData) {
  const me = await requireStaff();
  const id = Number(form.get("offer_id"));
  const status = String(form.get("status") ?? "");
  if (!OFFER_STATUSES.includes(status)) flash("/intros", "Unknown status.", "error");
  const offer = q1<{ user_id: number | null; status: string; contact_name: string; email: string | null; name: string | null; email_opt_out: number | null; disabled: number | null }>(
    `SELECT o.user_id, o.status, o.contact_name, u.email, u.name, u.email_opt_out, u.disabled FROM intro_offers o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
    id,
  );
  if (!offer) flash("/intros", "That offer was not found.", "error");
  run("UPDATE intro_offers SET status = ? WHERE id = ?", status, id);
  logActivity(me, "intro.offer_status", "intro_offer", id, status);
  if (status === "intro_made" && offer!.status !== "intro_made" && offer!.user_id) {
    await notify([offer!.user_id], {
      category: "intros",
      title: `Thank you for the introduction to ${offer!.contact_name}`,
      href: "/intros",
      cta: "See your introductions",
      emailHtml: `<p>Hi ${escapeHtml((offer!.name ?? "").split(/\s+/)[0])},</p><p>Thank you for introducing us to <strong>${escapeHtml(offer!.contact_name)}</strong>. Introductions like this are the most useful thing anyone does for ${escapeHtml(getSetting("company_name"))}, and we will let you know how it goes.</p><p>${escapeHtml(me.name)}</p>`,
      mail: { replyTo: me.email },
    });
  } else if (status === "met" && offer!.status !== "met" && offer!.user_id) {
    await notify([offer!.user_id], { category: "intros", title: `We met ${offer!.contact_name}. Thank you again.`, href: "/intros", email: false });
  }
  flash("/intros", "Updated.");
}
