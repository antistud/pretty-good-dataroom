import { levelOptions } from "@/lib/format";

type SP = Record<string, string | string[] | undefined>;

/** Shows ?ok= and ?error= messages set by server actions via flash(). */
export function Flash({ sp }: { sp: SP }) {
  const ok = typeof sp.ok === "string" ? sp.ok : "";
  const error = typeof sp.error === "string" ? sp.error : "";
  return (
    <>
      {ok && <div className="notice">{ok}</div>}
      {error && <div className="notice error">{error}</div>}
    </>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

/**
 * Plain-language guidance: what this page is and what to do on it. It stays
 * folded behind its title so the page itself comes first; anyone unsure opens it.
 */
export function Hint({ title = "How this works", children }: { title?: string; children: React.ReactNode }) {
  return (
    <details className="hint">
      <summary><span aria-hidden>ⓘ</span> {title}</summary>
      <div>{children}</div>
    </details>
  );
}

/** "Who can see this" selector. Defaults to the most restricted investor tier. */
export function LevelSelect({ name = "min_level", value, label = "Who can see this" }: { name?: string; value?: number; label?: string | null }) {
  const options = levelOptions();
  const fallback = options[options.length - 2]?.level ?? 3;
  const select = (
    <select name={name} defaultValue={String(value ?? fallback)}>
      {options.map((o) => (
        <option key={o.level} value={o.level}>
          {o.label}
        </option>
      ))}
    </select>
  );
  if (label === null) return select;
  return (
    <label className="field">
      <span>{label}</span>
      {select}
    </label>
  );
}

export function Field({ label, hint, aside, children }: { label: string; hint?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className={aside ? "field-label" : undefined}>{label}{aside}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Md({ html }: { html: string }) {
  // html comes from renderMarkdown(), which escapes all input.
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
