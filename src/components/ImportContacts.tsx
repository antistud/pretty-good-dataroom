"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { importContactsAction } from "@/app/(app)/pipeline/import/actions";
import { FIELDS, contactKeys, guessMapping, looksLikeHeader, parseCsv, toContacts, type FieldKey, type Mapping } from "@/lib/csv";

const MAX_BYTES = 1_000_000;
const MAX_ROWS = 2000;
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function ImportContacts({ rounds, defaultRound, existingKeys }: { rounds: { id: number; name: string }[]; defaultRound: number | null; existingKeys: string[] }) {
  const [table, setTable] = useState<string[][] | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping>({});
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const load = (text: string, name: string) => {
    setError("");
    const rows = parseCsv(text);
    if (rows.length === 0) return setError("That file is empty.");
    if (rows.length > MAX_ROWS + 1) return setError(`That file has ${rows.length.toLocaleString()} rows. The limit is ${MAX_ROWS.toLocaleString()}; split it and import in parts.`);
    const header = looksLikeHeader(rows[0]);
    setHasHeader(header);
    setMapping(header ? guessMapping(rows[0]) : {});
    setTable(rows);
    setFileName(name);
  };
  const onFile = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("That file is larger than 1 MB. Export only the contact columns, or split it.");
    if (/\.(xlsx?|numbers)$/i.test(file.name)) return setError("That is a spreadsheet file. In Excel, Numbers or Google Sheets choose File → Download or Export → CSV, then pick the CSV here.");
    load(await file.text(), file.name);
  };

  const existing = useMemo(() => new Set(existingKeys), [existingKeys]);
  const headers = table ? (hasHeader ? table[0] : table[0].map((_, i) => `Column ${i + 1}`)) : [];
  const body = table ? (hasHeader ? table.slice(1) : table) : [];
  const { contacts, skipped, badEmails } = useMemo(() => toContacts(body, mapping, hasHeader ? 2 : 1), [body, mapping, hasHeader]);
  const fresh = contacts.filter((c) => !contactKeys(c).some((k) => existing.has(k)));
  const already = contacts.length - fresh.length;
  const canIdentify = mapping.firm != null || mapping.name != null || (mapping.first != null && mapping.last != null) || mapping.first != null;

  if (!table) {
    return (
      <>
        <div className="hint">
          <strong>Bring your list in at once</strong>
          Export your contacts as a CSV file from wherever they live now (a spreadsheet, your CRM, LinkedIn) and choose it here. You will see exactly what will be added before anything is saved. Importing only adds people to your private pipeline: nobody is emailed and nobody gets access.
        </div>
        {error && <div className="notice error">{error}</div>}
        <label className="field" style={{ maxWidth: 460 }}>
          <span>Choose a CSV file</span>
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} />
          <small>One person per row. A heading row helps but is not required. Up to {MAX_ROWS.toLocaleString()} rows.</small>
        </label>
        <details>
          <summary>What should the file look like?</summary>
          <p className="muted">Any column order works, and extra columns are ignored. These headings are recognised automatically:</p>
          <div className="template">Firm,First name,Last name,Email,Cheque size,How you know them,Notes{"\n"}Oak Ventures,Amy,Ng,amy@oakventures.example,$100k,Intro from Sam,Met at demo day{"\n"},Jordan,Blake,jordan@example.com,25000,Former colleague,Angel; invests alone</div>
          <p style={{ marginTop: 10 }}>
            <a className="btn small" download="contacts-template.csv" href={"data:text/csv;charset=utf-8," + encodeURIComponent("Firm,First name,Last name,Email,Cheque size,How you know them,Notes\r\n")}>Download an empty template</a>
          </p>
        </details>
        <p style={{ marginTop: 18 }}><Link href="/pipeline">Back to investors</Link></p>
      </>
    );
  }

  return (
    <>
      <p className="muted">From <strong>{fileName}</strong>: {body.length.toLocaleString()} row{body.length === 1 ? "" : "s"}. <button type="button" className="linkbtn" onClick={() => setTable(null)}>Choose a different file</button></p>

      <div className="card">
        <h2>Which column is which?</h2>
        <p className="muted" style={{ marginTop: -6 }}>We matched what we could from your headings. Correct anything that is wrong; leave the rest as &ldquo;Not in this file&rdquo;.</p>
        <div className="grid2">
          {FIELDS.map((f) => (
            <label className="field" key={f.key}>
              <span>{f.label}</span>
              <select value={mapping[f.key] ?? ""} onChange={(e) => { const next = { ...mapping }; if (e.target.value === "") delete next[f.key as FieldKey]; else next[f.key as FieldKey] = Number(e.target.value); setMapping(next); }}>
                <option value="">Not in this file</option>
                {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}{body[0]?.[i] ? `  (e.g. ${body[0][i].slice(0, 28)})` : ""}</option>)}
              </select>
            </label>
          ))}
        </div>
        <p><label className="row"><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> The first row is headings, not a person</label></p>
      </div>

      <div className="card">
        <h2>What will happen</h2>
        {!canIdentify ? (
          <div className="notice warn">Tell us which column holds the firm or the person&apos;s name. Without one of those there is nothing to add.</div>
        ) : (
          <div className="letter" style={{ marginBottom: 14 }}>
            <p>
              <strong>{fresh.length.toLocaleString()}</strong> {fresh.length === 1 ? "person" : "people"} will be added to your pipeline as new leads.
              {already > 0 && <> {already.toLocaleString()} already in your pipeline will be left alone.</>}
              {skipped.length > 0 && <> {skipped.length.toLocaleString()} row{skipped.length === 1 ? "" : "s"} will be skipped.</>}
              {badEmails > 0 && <> {badEmails} email address{badEmails === 1 ? "" : "es"} did not look right and will be left blank.</>}
            </p>
          </div>
        )}
        {fresh.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Firm</th><th>Contact</th><th>Email</th><th className="num">Cheque</th><th>How you know them</th></tr></thead>
              <tbody>
                {fresh.slice(0, 8).map((c, i) => (
                  <tr key={i}><td>{c.firm}</td><td>{c.name || <span className="muted">—</span>}</td><td>{c.email || <span className="muted">—</span>}</td><td className="num">{c.cheque ? usd(c.cheque) : <span className="muted">—</span>}</td><td>{c.source || <span className="muted">—</span>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {fresh.length > 8 && <p className="muted small">…and {(fresh.length - 8).toLocaleString()} more.</p>}
        {skipped.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary>Why {skipped.length === 1 ? "is a row" : "are rows"} skipped?</summary>
            <ul className="quiet-list">{skipped.slice(0, 30).map((s) => <li key={s.line}>Row {s.line}: {s.reason}</li>)}</ul>
          </details>
        )}
      </div>

      <form action={importContactsAction} id="import-form">
        <input type="hidden" name="rows" value={JSON.stringify(body)} />
        <input type="hidden" name="mapping" value={JSON.stringify(mapping)} />
        {rounds.length > 0 && (
          <label className="field" style={{ maxWidth: 320 }}>
            <span>Add them to which round?</span>
            <select name="round_id" defaultValue={defaultRound ?? ""}>
              {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              <option value="">No round yet</option>
            </select>
          </label>
        )}
      </form>
      <div className="wizard-nav">
        <Link className="btn" href="/pipeline">Cancel</Link>
        <button type="submit" form="import-form" className="btn primary" disabled={!canIdentify || fresh.length === 0}>
          {fresh.length ? `Add ${fresh.length.toLocaleString()} ${fresh.length === 1 ? "person" : "people"}` : "Nothing to add"}
        </button>
      </div>
    </>
  );
}
