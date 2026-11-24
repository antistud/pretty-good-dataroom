import { q } from "./db";

export function money(n: number | null | undefined, compact = false): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(n);
}
export function num(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
}
export function pct(fraction: number | null | undefined, digits = 2): string {
  if (fraction == null || Number.isNaN(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}
/** SQLite datetime('now') is UTC without a zone marker. */
export function parseDate(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
}
export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return parseDate(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  return parseDate(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}
export function ago(s: string | null | undefined): string {
  if (!s) return "never";
  const mins = Math.floor((Date.now() - parseDate(s).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}
export function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export type LevelOption = { level: number; label: string };

/** Audience choices for any piece of content, least to most restricted. */
export function levelOptions(): LevelOption[] {
  const tiers = q<{ level: number; name: string }>("SELECT level, name FROM tiers ORDER BY level");
  return [
    { level: 0, label: "Everyone (supporters and investors)" },
    ...tiers.map((t, i) => ({
      level: t.level,
      label: i === tiers.length - 1 ? `Investors: ${t.name} only` : `Investors: ${t.name} and above`,
    })),
    { level: 100, label: "Founders and team only" },
  ];
}
export function levelName(level: number): string {
  if (level >= 999) return "Off";
  if (level >= 100) return "Founders only";
  if (level <= 0) return "Everyone";
  const t = q<{ level: number; name: string }>("SELECT level, name FROM tiers WHERE level = ?", level)[0];
  return t ? `${t.name}+` : `Tier ${level}+`;
}
export function tierName(level: number): string {
  if (level >= 100) return "Staff";
  if (level <= 0) return "Supporter";
  return q<{ name: string }>("SELECT name FROM tiers WHERE level = ?", level)[0]?.name ?? `Tier ${level}`;
}
/** Parse a form number; blank becomes null. Strips $ , and %. */
export function formNum(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export function formStr(v: FormDataEntryValue | null, max = 5000): string {
  return String(v ?? "").trim().slice(0, max);
}
export function formLevel(v: FormDataEntryValue | null, fallback = 3): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : fallback;
}
