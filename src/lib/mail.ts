import nodemailer, { type Transporter } from "nodemailer";
import { getSetting } from "./db";

export function mailEnabled(): boolean {
  return !!process.env.SMTP_HOST;
}

let transport: Transporter | null = null;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Sends an email if SMTP is configured. Returns false (and never throws) when
 * mail is off or the send fails, so callers can fall back to in-app notices.
 */
export async function sendMail(to: string, subject: string, bodyHtml: string, cta?: { label: string; url: string }): Promise<boolean> {
  if (!mailEnabled()) return false;
  const company = getSetting("company_name");
  const button = cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:#2f6b4f;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">${escapeHtml(cta.label)}</a></p>`
    : "";
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#2a2620;max-width:600px">${bodyHtml}${button}<p style="color:#6b7280;font-size:12px;margin-top:32px">${escapeHtml(company)} data room</p></div>`;
  try {
    await getTransport().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() + (cta ? `\n\n${cta.url}` : ""),
    });
    return true;
  } catch (err) {
    console.error("[mail] send failed:", (err as Error).message);
    return false;
  }
}
