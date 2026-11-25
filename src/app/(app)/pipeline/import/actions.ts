"use server";

import { db, q, q1 } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { contactKeys, toContacts, type Mapping } from "@/lib/csv";

const MAX_ROWS = 2000;

/**
 * Adds contacts to the pipeline as leads. The browser sends the raw rows and
 * the chosen columns; everything is validated and de-duplicated again here.
 */
export async function importContactsAction(form: FormData) {
  const me = await requireStaff();
  let rows: string[][];
  let mapping: Mapping;
  try {
    rows = JSON.parse(String(form.get("rows") ?? "[]"));
    mapping = JSON.parse(String(form.get("mapping") ?? "{}"));
  } catch {
    flash("/pipeline/import", "That file could not be read. Try exporting it as CSV again.", "error");
  }
  if (!Array.isArray(rows!) || rows!.length === 0) flash("/pipeline/import", "There was nothing to import.", "error");
  if (rows!.length > MAX_ROWS) flash("/pipeline/import", `That is more than ${MAX_ROWS} rows. Split the file and import it in parts.`, "error");
  const cleanRows = rows!.filter((r) => Array.isArray(r)).map((r) => r.slice(0, 60).map((v) => String(v ?? "").slice(0, 2000)));
  const cleanMap: Mapping = {};
  for (const [k, v] of Object.entries(mapping! ?? {})) if (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 60) (cleanMap as Record<string, number>)[k] = v as number;

  const roundId = Number(form.get("round_id")) || null;
  if (roundId && !q1("SELECT 1 FROM rounds WHERE id = ?", roundId)) flash("/pipeline/import", "That round no longer exists.", "error");

  const { contacts } = toContacts(cleanRows, cleanMap);
  const existing = new Set(q<{ org_name: string; contact_name: string | null; contact_email: string | null }>("SELECT org_name, contact_name, contact_email FROM leads").flatMap((l) => contactKeys({ firm: l.org_name, name: l.contact_name ?? "", email: l.contact_email ?? "" })));
  const fresh = contacts.filter((c) => !contactKeys(c).some((k) => existing.has(k)));
  if (!fresh.length) flash("/pipeline", contacts.length ? "Everyone in that file is already in your pipeline. Nothing was added." : "No usable rows were found. Each row needs at least a firm or a name.", "error");

  const insert = db.prepare("INSERT INTO leads (round_id, org_name, contact_name, contact_email, check_size, source, stage) VALUES (?,?,?,?,?,?, 'lead')");
  const note = db.prepare("INSERT INTO lead_notes (lead_id, user_id, body) VALUES (?,?,?)");
  db.transaction(() => {
    for (const c of fresh) {
      const id = Number(insert.run(roundId, c.firm, c.name || null, c.email || null, c.cheque, c.source || "Imported from a spreadsheet").lastInsertRowid);
      if (c.notes) note.run(id, me.id, c.notes);
    }
  })();
  logActivity(me, "lead.import", undefined, undefined, `${fresh.length} contacts`);
  const already = contacts.length - fresh.length;
  flash("/pipeline", `${fresh.length} ${fresh.length === 1 ? "contact" : "contacts"} added as leads.${already ? ` ${already} already in your pipeline ${already === 1 ? "was" : "were"} left alone.` : ""} Nobody has been emailed or given access.`);
}
