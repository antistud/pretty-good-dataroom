/**
 * Working out where an uploaded file belongs. Pure functions, no database.
 *
 * Two sources, in order: a note a founder's AI assistant left about that file
 * ("this is the signed SAFE with Oak Ventures"), and failing that, the file's
 * own name. Neither decides who can see the file: that always comes from the
 * folder, which the founder controls.
 */
export type FilingHint = { id: number; filename: string; title: string | null; folder: string | null; description: string | null; safe_investor: string | null };
export type Filed = { folderId: number; title: string; description: string | null; hintId: number | null; safeInvestor: string | null; how: "assistant" | "name" | "default" };

/** A file name reduced to what identifies it: no extension, case or punctuation. */
export const fileKey = (name: string) => name.replace(/\.[A-Za-z0-9]{1,5}$/, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Which standard folder a file name points to, as a fragment to match against the room's folder names. */
export function guessFolder(filename: string): string | null {
  const n = fileKey(filename);
  const rules: [RegExp, string][] = [
    [/\bsafe\b|simple agreement for future equity|stock purchase|share purchase|restricted stock|\brspa\b|83 ?b\b|cap ?table|repurchase/, "Cap table"],
    [/certificate of (incorporation|formation)|articles of|by ?laws|operating agreement|board (consent|resolution|minutes)|written consent|\bein\b|incentive plan|stock plan|option plan|good standing/, "Company"],
    [/\bip assign|invention|\bpiia\b|\bciia+\b|proprietary information|intellectual property|trademark|patent|\bnda\b|non disclosure|privacy policy|terms of service/, "IP"],
    [/advisor|advisory|offer letter|employment|founder agreement|contractor|consulting agreement/, "Team"],
    [/\bdeck\b|pitch|one pager|teaser|demo/, "Pitch"],
    [/financial|\bmodel\b|budget|forecast|bank statement|p ?l\b|balance sheet|\btax\b/, "Financials"],
    [/roadmap|metrics|traction|customer|pilot|\bloi\b|letter of intent|case study/, "Product"],
    [/wire|signature page|closing|term sheet|side letter/, "Closing"],
  ];
  return rules.find(([re]) => re.test(n))?.[1] ?? null;
}

/** Finds a room folder from a name or fragment, forgiving about case and wording. */
export function matchFolder(want: string | null, folders: { id: number; name: string }[]): number | null {
  const w = (want ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!w) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return (folders.find((f) => norm(f.name) === w) ?? folders.find((f) => norm(f.name).startsWith(w)) ?? folders.find((f) => norm(f.name).includes(w) || w.includes(norm(f.name))))?.id ?? null;
}

/** The assistant's note for a file, if it left one. Names are compared loosely because assistants shorten and re-case them. */
export function hintFor(filename: string, hints: FilingHint[]): FilingHint | null {
  const key = fileKey(filename);
  if (!key) return null;
  return hints.find((h) => fileKey(h.filename) === key) ?? hints.find((h) => { const k = fileKey(h.filename); return k.length >= 6 && key.length >= 6 && (k.includes(key) || key.includes(k)); }) ?? null;
}

export function planFiling(filename: string, hints: FilingHint[], folders: { id: number; name: string }[], fallbackId: number): Filed {
  const plain = filename.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const hint = hintFor(filename, hints);
  if (hint) {
    const folderId = matchFolder(hint.folder, folders) ?? matchFolder(guessFolder(`${hint.title ?? ""} ${filename}`), folders) ?? fallbackId;
    return { folderId, title: hint.title || plain, description: hint.description, hintId: hint.id, safeInvestor: hint.safe_investor, how: "assistant" };
  }
  const guessed = matchFolder(guessFolder(filename), folders);
  return { folderId: guessed ?? fallbackId, title: plain, description: null, hintId: null, safeInvestor: null, how: guessed ? "name" : "default" };
}

/** Turns whatever an assistant sent into clean notes. Anything malformed is dropped; nothing here is trusted. */
export function cleanHints(raw: unknown): Omit<FilingHint, "id">[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { documents?: unknown }).documents) ? (raw as { documents: unknown[] }).documents : [];
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max) : null);
  const out: Omit<FilingHint, "id">[] = [];
  const seen = new Set<string>();
  for (const item of list.slice(0, 60)) {
    if (!item || typeof item !== "object") continue;
    const d = item as Record<string, unknown>;
    const filename = text(d.filename, 200)?.split(/[\\/]/).pop() ?? null;
    if (!filename || !fileKey(filename) || seen.has(fileKey(filename))) continue;
    seen.add(fileKey(filename));
    out.push({ filename, title: text(d.title, 200), folder: text(d.folder, 120), description: text(d.description, 500), safe_investor: text(d.safe_investor, 120) });
  }
  return out;
}
