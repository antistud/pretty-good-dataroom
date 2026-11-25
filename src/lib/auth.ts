import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { q1, run, getSetting, isSetUp } from "./db";

const COOKIE = "pgd_session";
const SESSION_DAYS = 14;
export const STAFF_LEVEL = 100;

export type Role = "founder" | "team" | "investor" | "supporter";
export type Viewer = {
  id: number;
  email: string;
  name: string;
  role: Role;
  orgId: number | null;
  orgName: string | null;
  /** 0 supporter, 1..3 investor tier, 100 founders and team. */
  level: number;
  isStaff: boolean;
  canDownload: boolean;
  ndaAccepted: boolean;
  totpEnabled: boolean;
};

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That password is too long.";
  return null;
}

export function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function createSession(userId: number, twofaPending: boolean) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  run(
    "INSERT INTO sessions (token_hash, user_id, twofa_pending, expires_at) VALUES (?,?,?,?)",
    hashToken(token),
    userId,
    twofaPending ? 1 : 0,
    expires.toISOString(),
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl().startsWith("https://"),
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token_hash = ?", hashToken(token));
  jar.delete(COOKIE);
}

type SessionRow = {
  twofa_pending: number;
  id: number;
  email: string;
  name: string;
  role: Role;
  org_id: number | null;
  org_name: string | null;
  org_tier: number | null;
  nda_accepted_at: string | null;
  totp_enabled: number;
};

async function sessionRow(): Promise<SessionRow | undefined> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return undefined;
  return q1<SessionRow>(
    `SELECT s.twofa_pending, u.id, u.email, u.name, u.role, u.org_id, u.nda_accepted_at, u.totp_enabled,
            o.name AS org_name, o.tier AS org_tier
       FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN orgs o ON o.id = u.org_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`,
    hashToken(token),
    new Date().toISOString(),
  );
}

/** The user id of a session that has passed the password but not yet the 2FA step. */
export async function pendingTwofaUserId(): Promise<number | null> {
  const row = await sessionRow();
  return row && row.twofa_pending ? row.id : null;
}

export async function completeTwofa() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) run("UPDATE sessions SET twofa_pending = 0 WHERE token_hash = ?", hashToken(token));
}

export async function currentUser(): Promise<Viewer | null> {
  const row = await sessionRow();
  if (!row || row.twofa_pending) return null;
  const isStaff = row.role === "founder" || row.role === "team";
  const level = isStaff ? STAFF_LEVEL : row.role === "investor" ? Math.max(1, row.org_tier ?? 1) : 0;
  const tier = q1<{ can_download: number }>("SELECT can_download FROM tiers WHERE level = ?", level);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    orgId: row.org_id,
    orgName: row.org_name,
    level,
    isStaff,
    canDownload: isStaff || !!tier?.can_download,
    ndaAccepted: isStaff || !!row.nda_accepted_at,
    totpEnabled: !!row.totp_enabled,
  };
}

/** Every signed-in page and action starts here. */
export async function requireUser(opts: { skipNda?: boolean } = {}): Promise<Viewer> {
  if (!isSetUp()) redirect("/setup");
  const me = await currentUser();
  if (!me) redirect("/login");
  if (!opts.skipNda && !me.ndaAccepted && getSetting("nda_enabled") === "1") redirect("/nda");
  return me;
}

export async function requireStaff(): Promise<Viewer> {
  const me = await requireUser();
  if (!me.isStaff) redirect("/home");
  return me;
}

export async function requireFounder(): Promise<Viewer> {
  const me = await requireUser();
  if (me.role !== "founder") redirect("/home");
  return me;
}

export function canSee(me: Viewer, minLevel: number): boolean {
  return me.level >= minLevel;
}

export type Section =
  | "overview" | "team" | "updates" | "intros" | "round" | "documents" | "requests" | "captable" | "financials";

export function sectionLevel(section: Section): number {
  return Number(getSetting(`level_${section}`));
}
export function canSeeSection(me: Viewer, section: Section): boolean {
  const lvl = sectionLevel(section);
  if (lvl >= 999) return false;
  return me.level >= lvl;
}
export async function requireSection(section: Section): Promise<Viewer> {
  const me = await requireUser();
  if (!canSeeSection(me, section)) redirect("/home");
  return me;
}

// Small in-memory limiter for sign-in and token endpoints.
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimited(key: string, max = 8, windowMs = 15 * 60_000): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  h.n += 1;
  return h.n > max;
}

/**
 * The caller's address, for rate limiting. Behind the bundled proxy the last
 * entry of X-Forwarded-For is the one the proxy itself added; anything before
 * it was supplied by the caller and cannot be trusted.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const chain = (h.get("x-forwarded-for") || "").split(",").map((p) => p.trim()).filter(Boolean);
  return chain[chain.length - 1] || h.get("x-real-ip") || "local";
}

/** Compares two secrets without leaking, through timing, how much of a guess was right. */
export function sameSecret(a: string, b: string): boolean {
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

/** Ends every session of this user except the one making the request. */
export async function signOutOtherSessions(userId: number) {
  const token = (await cookies()).get(COOKIE)?.value;
  run("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", userId, token ? hashToken(token) : "");
}
