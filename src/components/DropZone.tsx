"use client";

import { useRef, useState } from "react";

const MAX_FILES = 30;
const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * A box to drop many files into at once. `action` is the server action that
 * files them; `noted` are file names an assistant has already described, so
 * the founder can see which of their files will be recognised.
 */
export function DropZone({ action, noted = [], fallbackFolderId }: { action: (form: FormData) => void | Promise<void>; noted?: string[]; fallbackFolderId?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const key = (n: string) => n.replace(/\.[A-Za-z0-9]{1,5}$/, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const known = new Set(noted.map(key));
  const tooBig = files.filter((f) => f.size > 50 * 1024 * 1024);

  const take = (list: FileList | null) => {
    if (!list || !input.current) return;
    const dt = new DataTransfer();
    [...list].slice(0, MAX_FILES).forEach((f) => dt.items.add(f));
    input.current.files = dt.files;
    setFiles([...dt.files]);
  };

  return (
    <form action={action} className="dropform">
      {fallbackFolderId ? <input type="hidden" name="fallback_folder_id" value={fallbackFolderId} /> : null}
      <label
        className={`dropzone${over ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9M4.5 15.5V18A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.500v-2.500" /></svg>
        <span><strong>Drop files here</strong>, or choose them. Up to {MAX_FILES} at once.</span>
        <input ref={input} type="file" name="files" multiple required onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, MAX_FILES))} />
      </label>
      {files.length > 0 && (
        <>
          <ul className="dropped">
            {files.map((f) => (
              <li key={f.name + f.size}>
                <span>{f.name}</span>
                <span className="muted small">{size(f.size)}{f.size > 50 * 1024 * 1024 ? " · too large" : known.has(key(f.name)) ? " · described by your assistant" : ""}</span>
              </li>
            ))}
          </ul>
          <button className="btn primary" disabled={tooBig.length > 0}>File {files.length === 1 ? "this document" : `these ${files.length} documents`}</button>
          {tooBig.length > 0 && <p className="muted small" style={{ marginTop: 8 }}>Files over 50 MB cannot be uploaded. Remove them and try again.</p>}
        </>
      )}
    </form>
  );
}
