import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

/** Helvetica can only draw basic Latin, so anything else is replaced. */
function ascii(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, "?").slice(0, 120);
}

/**
 * Stamps every page with the viewer's identity: a large diagonal mark and a
 * small footer line. Throws for PDFs that cannot be edited (encrypted or
 * corrupt); callers must then refuse to serve the file rather than serve it unmarked.
 */
export async function watermarkPdf(data: Buffer, viewer: string, footerNote: string): Promise<Buffer> {
  const pdf = await PDFDocument.load(data);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const mark = ascii(`${viewer}  ${stamp}`);
  const footer = ascii(`Confidential. ${footerNote}. Viewed by ${viewer} on ${stamp}.`);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const angle = Math.atan2(height, width);
    const diagonal = Math.hypot(width, height);
    const size = Math.max(8, Math.min(44, (diagonal * 0.7) / Math.max(1, font.widthOfTextAtSize(mark, 1))));
    const len = font.widthOfTextAtSize(mark, size);
    page.drawText(mark, {
      x: width / 2 - (len / 2) * Math.cos(angle),
      y: height / 2 - (len / 2) * Math.sin(angle),
      size,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity: 0.22,
      rotate: degrees((angle * 180) / Math.PI),
    });
    page.drawText(footer, { x: 18, y: 10, size: 7, font, color: rgb(0.4, 0.4, 0.4), opacity: 0.7 });
  }
  return Buffer.from(await pdf.save());
}

/** Used at upload time to warn founders about PDFs investors will not be able to open. */
export async function canWatermark(data: Buffer): Promise<boolean> {
  try {
    await watermarkPdf(data, "check@example.com", "check");
    return true;
  } catch {
    return false;
  }
}

const BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
};

export type FileKind = "pdf" | "image" | "text" | "other";

/** Only these types are ever shown in the browser. Everything else is download-only. */
export function fileKind(mime: string | null, filename: string | null): FileKind {
  const ext = (filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  const m = BY_EXT[ext] ?? (mime ?? "").toLowerCase().split(";")[0].trim();
  if (m === "application/pdf") return "pdf";
  if (m === "image/png" || m === "image/jpeg" || m === "image/gif" || m === "image/webp") return "image";
  if (m === "text/plain") return "text";
  return "other";
}
export function safeMime(mime: string | null, filename: string | null): string {
  const kind = fileKind(mime, filename);
  if (kind === "other") return "application/octet-stream";
  if (kind === "text") return "text/plain; charset=utf-8";
  const ext = (filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  return BY_EXT[ext] ?? (mime ?? "").toLowerCase().split(";")[0].trim();
}
