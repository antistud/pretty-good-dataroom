import { canSeeSection, currentUser, type Section } from "@/lib/auth";
import { getSetting, q } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { allFolders, visibleDocuments } from "@/lib/docs";
import { readFile } from "@/lib/storage";
import { fileKind, watermarkPdf } from "@/lib/watermark";
import { buildZip } from "@/lib/zip";

const MAX_ZIP_BYTES = 400 * 1024 * 1024;

/** Quote for CSV, and neutralise cells a spreadsheet would run as a formula. */
function cell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csv(head: string[], rows: unknown[][]): string {
  return "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "file";

function deny(status: number, message: string) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * File exports. Every one requires a signed-in person who may see that
 * section and whose access allows downloads; founders and team always can.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const me = await currentUser();
  if (!me) return deny(401, "Sign in first.");
  if (!me.ndaAccepted && getSetting("nda_enabled") === "1") return deny(403, "Accept the confidentiality terms first.");
  if (!me.canDownload) return deny(403, "Your access does not include downloads. Ask the founders if you need a copy.");
  const need = (section: Section) => canSeeSection(me, section);
  const company = slug(getSetting("company_name"));
  const today = new Date().toISOString().slice(0, 10);
  const file = (body: string | Buffer, filename: string, type: string) =>
    new Response(body as BodyInit, {
      headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });

  if (name === "cap-table.csv") {
    if (!need("captable")) return deny(403, "Not available.");
    const holders = q<{ name: string; kind: string; share_class: string; shares: number }>("SELECT name, kind, share_class, shares FROM holders ORDER BY position, id");
    const total = holders.reduce((n, h) => n + h.shares, 0);
    logActivity(me, "export.csv", undefined, undefined, "cap table");
    return file(
      csv(["Holder", "Type", "Class", "Shares", "Fully diluted %"], [...holders.map((h) => [h.name, h.kind, h.share_class, h.shares, total ? ((h.shares / total) * 100).toFixed(4) : ""]), ["Total", "", "", total, total ? "100.0000" : ""]]),
      `${company}-cap-table-${today}.csv`,
      "text/csv; charset=utf-8",
    );
  }
  if (name === "safes.csv") {
    if (!need("captable")) return deny(403, "Not available.");
    const safes = q<{ investor_name: string; amount: number; kind: string; valuation_cap: number | null; discount: number | null; mfn: number; status: string; signed_on: string | null; round: string | null }>(
      "SELECT s.investor_name, s.amount, s.kind, s.valuation_cap, s.discount, s.mfn, s.status, s.signed_on, r.name AS round FROM safes s LEFT JOIN rounds r ON r.id = s.round_id ORDER BY s.signed_on IS NULL, s.signed_on, s.id",
    );
    logActivity(me, "export.csv", undefined, undefined, "SAFEs");
    return file(
      csv(["Investor", "Amount (USD)", "Type", "Valuation cap (USD)", "Discount %", "MFN", "Status", "Signed", "Round"], safes.map((s) => [s.investor_name, s.amount, s.kind === "post" ? "Post-money" : "Pre-money", s.valuation_cap ?? "", s.discount != null ? s.discount * 100 : "", s.mfn ? "Yes" : "No", s.status, s.signed_on ?? "", s.round ?? ""])),
      `${company}-safes-${today}.csv`,
      "text/csv; charset=utf-8",
    );
  }
  if (name === "financials.csv") {
    if (!need("financials")) return deny(403, "Not available.");
    const rows = q<{ month: string; revenue: number; expenses: number; cash: number; notes: string | null }>("SELECT month, revenue, expenses, cash, notes FROM financials ORDER BY month");
    logActivity(me, "export.csv", undefined, undefined, "financials");
    return file(
      csv(["Month", "Revenue (USD)", "Expenses (USD)", "Net burn (USD)", "Cash at month end (USD)", "Notes"], rows.map((r) => [r.month, r.revenue, r.expenses, r.expenses - r.revenue, r.cash, r.notes ?? ""])),
      `${company}-financials-${today}.csv`,
      "text/csv; charset=utf-8",
    );
  }
  if (name === "documents.zip") {
    if (!need("documents")) return deny(403, "Not available.");
    const folders = new Map(allFolders().map((f) => [f.id, f]));
    const pathOf = (folderId: number): string => {
      const parts: string[] = [];
      for (let f = folders.get(folderId), guard = 0; f && guard < 12; f = f.parent_id ? folders.get(f.parent_id) : undefined, guard++) parts.unshift(safeName(f.name));
      return parts.join("/");
    };
    const entries: { name: string; data: Buffer }[] = [];
    const skipped: string[] = [];
    const used = new Set<string>();
    let bytes = 0;
    for (const doc of visibleDocuments(me.level)) {
      if (!doc.current_version_id || !doc.filename) continue;
      const version = q<{ storage_key: string }>("SELECT storage_key FROM document_versions WHERE id = ?", doc.current_version_id)[0];
      if (!version) continue;
      let data: Buffer;
      try {
        data = await readFile(version.storage_key);
        // Investors receive the same marked copy they would get one file at a time.
        if (!me.isStaff && fileKind(doc.mime, doc.filename) === "pdf") data = await watermarkPdf(data, me.email, `${getSetting("company_name")} · confidential · ${today}`);
      } catch {
        skipped.push(doc.name);
        continue;
      }
      bytes += data.length;
      if (bytes > MAX_ZIP_BYTES) return deny(413, "The documents are too large to bundle. Download them one at a time, or ask the founders.");
      const ext = (doc.filename.match(/\.[A-Za-z0-9]{1,8}$/) ?? [""])[0];
      const base = `${pathOf(doc.folder_id)}/${safeName(doc.name)}`;
      let path = `${base}${base.toLowerCase().endsWith(ext.toLowerCase()) ? "" : ext}`;
      for (let n = 2; used.has(path.toLowerCase()); n++) path = `${base} (${n})${ext}`;
      used.add(path.toLowerCase());
      entries.push({ name: path, data });
    }
    if (skipped.length) entries.push({ name: "NOT INCLUDED.txt", data: Buffer.from(`These documents could not be included. Open them in the data room or ask the founders:\n\n${skipped.map((s) => `- ${s}`).join("\n")}\n`) });
    if (!entries.length) return deny(404, "There are no documents to download yet.");
    logActivity(me, "export.zip", undefined, undefined, `${entries.length} files`);
    return file(buildZip(entries), `${company}-documents-${today}.zip`, "application/zip");
  }
  return deny(404, "Unknown export.");
}
