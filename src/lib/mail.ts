import nodemailer, { type Transporter } from "nodemailer";
import { getSetting, run } from "./db";

/** True when the app can send email. Sign-in depends on it, so the app does nothing without it. */
export function mailEnabled(): boolean {
  return !!process.env.SMTP_HOST;
}

/**
 * For development only: SMTP_HOST=console prints each email to the server log
 * instead of sending it. Never use this on a real room: anyone who can read
 * the log can read every sign-in code.
 */
function consoleMode(): boolean {
  return process.env.SMTP_HOST === "console";
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

function baseUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export type MailOptions = {
  /** A real person to reply to. Replies then reach a founder, not a dead mailbox. */
  replyTo?: string;
  /** One line shown in the inbox preview after the subject. */
  preview?: string;
  /** Account and security mail is always sent; everything else carries a preferences link. */
  transactional?: boolean;
};

/** The shared look of every email: paper background, serif headline, one clear button. */
export function renderEmail(bodyHtml: string, cta?: { label: string; url: string }, opts: MailOptions = {}): string {
  const company = escapeHtml(getSetting("company_name"));
  // The logo, when there is one. The company name stays as text beside it unless the logo already spells it out,
  // and is always the image's alt text, because many mail apps hide pictures until asked.
  const logoKey = getSetting("logo_key");
  const logo = logoKey ? `<img src="${baseUrl()}/api/logo?v=${escapeHtml(logoKey.slice(0, 8))}" alt="${company}" height="32" style="height:32px;width:auto;max-width:220px;border:0;vertical-align:middle">` : "";
  const masthead = logo ? (getSetting("logo_has_name") === "1" ? logo : `${logo}<span style="vertical-align:middle;padding-left:10px">${company}</span>`) : company;
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px"><tr><td style="background:#1b1b19;border-radius:10px"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font:600 15px system-ui,-apple-system,Segoe UI,sans-serif;text-decoration:none">${escapeHtml(cta.label)}</a></td></tr></table>`
    : "";
  const footer = opts.transactional
    ? `You are receiving this because you have an account in the ${company} data room.`
    : `You are receiving this because you have access to the ${company} data room. <a href="${baseUrl()}/account#email" style="color:#7a7164">Choose which emails you get</a>.`;
  return `<!doctype html><html><body style="margin:0;background:#f8f7f4">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preview ?? "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7f4"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
<tr><td style="font:500 19px Georgia,'Iowan Old Style',serif;color:#1b1b19;padding:0 4px 14px">${masthead}</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e4e1d9;border-radius:14px;padding:28px 28px 24px;font:16px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1b1b19">${bodyHtml}${button}</td></tr>
<tr><td style="font:12.5px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#7a7164;padding:16px 6px 0">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

function toText(html: string): string {
  return html
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Sends an email if SMTP is configured. Returns false (and never throws) when
 * mail is off or the send fails, so callers can fall back to in-app notices.
 * Every attempt is written to email_log.
 */
export async function sendMail(to: string, subject: string, bodyHtml: string, cta?: { label: string; url: string }, opts: MailOptions = {}): Promise<boolean> {
  const cleanSubject = subject.replace(/[\r\n]+/g, " ").slice(0, 200);
  if (!mailEnabled()) {
    run("INSERT INTO email_log (to_email, subject, status) VALUES (?,?, 'not sent: email is off')", to, cleanSubject);
    return false;
  }
  if (consoleMode()) {
    console.log(`[mail:console] to ${to} | ${cleanSubject}${cta ? ` | ${cta.url}` : ""}`);
    run("INSERT INTO email_log (to_email, subject, status) VALUES (?,?, 'printed to the server log')", to, cleanSubject);
    return true;
  }
  try {
    await getTransport().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      replyTo: opts.replyTo,
      subject: cleanSubject,
      html: renderEmail(bodyHtml, cta, opts),
      text: toText(bodyHtml) + (cta ? `\n\n${cta.label}: ${cta.url}` : ""),
      headers: opts.transactional ? undefined : { "List-Unsubscribe": `<${baseUrl()}/account#email>` },
    });
    run("INSERT INTO email_log (to_email, subject, status) VALUES (?,?, 'sent')", to, cleanSubject);
    return true;
  } catch (err) {
    const message = (err as Error).message.slice(0, 300);
    console.error("[mail] send failed:", message);
    run("INSERT INTO email_log (to_email, subject, status, error) VALUES (?,?, 'failed', ?)", to, cleanSubject, message);
    return false;
  }
}
