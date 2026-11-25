"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type PaletteItem = { label: string; href: string; kind: string; sub?: string };

/** Search and jump: Ctrl/Cmd+K or "/" opens it; type, arrow, Enter. */
export function Palette({ nav }: { nav: PaletteItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PaletteItem[]>([]);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setFound([]);
    setIndex(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !open)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setFound([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => setFound(d.items ?? []))
        .catch(() => {});
    }, 140);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query]);

  const term = query.trim().toLowerCase();
  const items = [...nav.filter((n) => !term || n.label.toLowerCase().includes(term)), ...found].slice(0, 12);
  const go = (item?: PaletteItem) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  return (
    <>
      <button type="button" className="palette-open" onClick={() => setOpen(true)}>
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>
      {open && (
        <div className="palette-veil" onMouseDown={close}>
          <div className="palette" role="dialog" aria-label="Search" onMouseDown={(e) => e.stopPropagation()}>
            <input
              ref={input}
              value={query}
              placeholder="Search people, firms, documents, pages…"
              aria-label="Search"
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(items.length - 1, i + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
                else if (e.key === "Enter") go(items[index]);
              }}
            />
            <ul>
              {items.map((item, i) => (
                <li key={item.kind + item.href + item.label} className={i === index ? "on" : ""} onMouseEnter={() => setIndex(i)} onClick={() => go(item)}>
                  <span>
                    {item.label}
                    {item.sub && <small> · {item.sub}</small>}
                  </span>
                  <em>{item.kind}</em>
                </li>
              ))}
              {items.length === 0 && <li className="none">Nothing matches “{query}”.</li>}
            </ul>
            <div className="palette-foot">↑ ↓ to move · Enter to open · Esc to close</div>
          </div>
        </div>
      )}
    </>
  );
}
