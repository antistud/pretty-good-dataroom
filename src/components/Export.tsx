"use client";

/** Opens the browser's print dialog, where "Save as PDF" is always an option. */
export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn small no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}

/** Print plus any file downloads this person is allowed. */
export function ExportBar({ print = true, links = [] }: { print?: boolean; links?: { href: string; label: string }[] }) {
  return (
    <span className="row no-print">
      {links.map((l) => (
        <a key={l.href} className="btn small" href={l.href} download>
          {l.label}
        </a>
      ))}
      {print && <PrintButton />}
    </span>
  );
}
