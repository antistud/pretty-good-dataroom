import { canSeeSection, currentUser } from "@/lib/auth";
import { getSetting, q1 } from "@/lib/db";
import { getDocument } from "@/lib/docs";
import { readFile } from "@/lib/storage";
import { logActivity, logView } from "@/lib/activity";
import { fileKind, safeMime, watermarkPdf } from "@/lib/watermark";

export const dynamic = "force-dynamic";

function deny(status: number, message: string) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function disposition(kind: "inline" | "attachment", filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "file";
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const me = await currentUser();
  if (!me) return deny(401, "Sign in to view this file.");
  if (!me.ndaAccepted && getSetting("nda_enabled") === "1") return deny(403, "Accept the confidentiality terms first.");
  if (!me.isStaff && !canSeeSection(me, "documents")) return deny(403, "You do not have access to this file.");

  const versionId = Number((await params).versionId);
  if (!Number.isInteger(versionId)) return deny(404, "File not found.");
  const version = q1<{ id: number; document_id: number; filename: string; mime: string; storage_key: string }>(
    "SELECT id, document_id, filename, mime, storage_key FROM document_versions WHERE id = ?",
    versionId,
  );
  const doc = version && getDocument(version.document_id);
  // Same answer for "does not exist" and "not allowed", so ids cannot be probed.
  if (!version || !doc || doc.effective_level > me.level) return deny(404, "File not found.");
  if (!me.isStaff && doc.current_version_id !== version.id) return deny(404, "File not found.");

  const wantsDownload = new URL(req.url).searchParams.get("download") === "1";
  const kind = fileKind(version.mime, version.filename);
  // Investors may view PDFs and images in the browser. Anything else, and any download, needs download rights.
  const inlineOk = me.isStaff ? kind !== "other" : kind === "pdf" || kind === "image";
  const asDownload = wantsDownload || !inlineOk;
  if (asDownload && !me.canDownload) return deny(403, "Downloads are not enabled for your access level. Ask the founders if you need a copy.");

  let data: Buffer;
  try {
    data = await readFile(version.storage_key);
  } catch {
    return deny(404, "File not found.");
  }

  if (!me.isStaff && kind === "pdf") {
    try {
      data = await watermarkPdf(data, me.email, getSetting("company_name"));
    } catch {
      // Never hand out an unmarked copy.
      return deny(422, "This PDF is protected and cannot be shown here. Ask the founders for another copy.");
    }
  }

  if (asDownload) logActivity(me, "doc.download", "document", doc.id, version.filename);
  else logView(me, "doc.view", "document", doc.id);

  const headers: Record<string, string> = {
    "Content-Type": asDownload && kind === "other" ? "application/octet-stream" : safeMime(version.mime, version.filename),
    "Content-Disposition": disposition(asDownload ? "attachment" : "inline", version.filename),
    "Content-Length": String(data.length),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  // Browser PDF viewers break under a sandboxing policy, so PDFs rely on the content type and nosniff alone.
  if (kind !== "pdf") headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  return new Response(new Uint8Array(data), { headers });
}
