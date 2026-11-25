/**
 * Reading spreadsheets of contacts. Pure functions, used in the browser for
 * the preview and again on the server, which never trusts the browser's copy.
 */

/** Parses CSV text: quoted fields, embedded commas and line breaks, and comma, semicolon or tab separators. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = src.split("\n", 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = count("\t") > count(",") && count("\t") >= count(";") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ""));
}

export const FIELDS = [
  { key: "firm", label: "Firm or fund", words: ["firm", "fund", "company", "organisation", "organization", "org", "investor", "account", "employer"] },
  { key: "name", label: "Contact's full name", words: ["full name", "name", "contact", "person", "partner"] },
  { key: "first", label: "First name", words: ["first name", "first", "given name", "forename"] },
  { key: "last", label: "Last name", words: ["last name", "last", "surname", "family name"] },
  { key: "email", label: "Email", words: ["email", "e-mail", "email address", "mail"] },
  { key: "cheque", label: "Likely cheque size", words: ["cheque", "check", "check size", "cheque size", "amount", "ticket", "investment"] },
  { key: "source", label: "How you know them", words: ["source", "how", "intro", "introduced by", "referrer", "relationship", "connection"] },
  { key: "notes", label: "Notes", words: ["notes", "note", "comments", "comment", "description", "background"] },
] as const;
export type FieldKey = (typeof FIELDS)[number]["key"];
export type Mapping = Partial<Record<FieldKey, number>>;

/** Guesses which column holds which field from the header row. Exact matches win over partial ones. */
export function guessMapping(headers: string[]): Mapping {
  const clean = headers.map((h) => h.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim());
  const map: Mapping = {};
  const taken = new Set<number>();
  for (const pass of ["exact", "contains"] as const) {
    for (const f of FIELDS) {
      if (map[f.key] != null) continue;
      const i = clean.findIndex((h, idx) => !taken.has(idx) && f.words.some((w) => (pass === "exact" ? h === w : h.includes(w))));
      if (i >= 0) { map[f.key] = i; taken.add(i); }
    }
  }
  // "Name" next to a first/last pair is the whole name only if no pair was found.
  if (map.first != null && map.last != null && map.name != null && (map.name === map.first || map.name === map.last)) delete map.name;
  return map;
}

/** True when the first row looks like headings rather than a person. */
export function looksLikeHeader(row: string[]): boolean {
  if (row.some((v) => /@/.test(v))) return false;
  const known = FIELDS.flatMap((f) => f.words as readonly string[]);
  return row.some((v) => known.includes(v.toLowerCase().replace(/[_\-.]+/g, " ").trim()));
}

/** "$50k", "50,000", "1.5m", "USD 25000" → a number, or null. */
export function parseAmount(v: string): number | null {
  const m = v.toLowerCase().replace(/[, ]/g, "").match(/(\d+(?:\.\d+)?)(k|m|mm|thousand|million)?/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "k" || m[2] === "thousand" ? 1_000 : m[2] ? 1_000_000 : 1);
  return Number.isFinite(n) && n > 0 && n < 1e10 ? Math.round(n) : null;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type Contact = { firm: string; name: string; email: string; cheque: number | null; source: string; notes: string };
export type Skipped = { line: number; reason: string };

/** Turns mapped rows into contacts. Rows with neither a firm nor a name are skipped, with the reason. */
export function toContacts(rows: string[][], mapping: Mapping, firstLine = 1): { contacts: Contact[]; skipped: Skipped[]; badEmails: number } {
  const get = (r: string[], k: FieldKey) => (mapping[k] != null ? (r[mapping[k]!] ?? "").trim() : "");
  const contacts: Contact[] = [];
  const skipped: Skipped[] = [];
  const seen = new Set<string>();
  let badEmails = 0;
  rows.forEach((r, i) => {
    const line = firstLine + i;
    const name = (get(r, "name") || [get(r, "first"), get(r, "last")].filter(Boolean).join(" ")).slice(0, 120);
    // An individual angel has no firm: they are listed under their own name.
    const firm = (get(r, "firm") || name).slice(0, 120);
    if (!firm) return void skipped.push({ line, reason: "no firm or name" });
    let email = get(r, "email").toLowerCase().slice(0, 200);
    if (email && !EMAIL.test(email)) { badEmails++; email = ""; }
    const key = email || `${firm.toLowerCase()}|${name.toLowerCase()}`;
    if (seen.has(key)) return void skipped.push({ line, reason: "repeated in this file" });
    seen.add(key);
    contacts.push({ firm, name, email, cheque: parseAmount(get(r, "cheque")), source: get(r, "source").slice(0, 200), notes: get(r, "notes").slice(0, 2000) });
  });
  return { contacts, skipped, badEmails };
}

/** The key used to recognise someone already in the pipeline. */
export function contactKeys(c: { firm: string; name: string; email: string }): string[] {
  return [c.email ? `e:${c.email.toLowerCase()}` : "", `n:${c.firm.toLowerCase()}|${c.name.toLowerCase()}`].filter(Boolean);
}
