"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export type Tab = { label: string; href: string; icon: "home" | "people" | "doc" | "mail" | "chat" | "more"; match?: string[] };

const ICONS: Record<Tab["icon"], string> = {
  home: "M3 11.5 12 4l9 7.5M5.5 10v9h13v-9",
  people: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a2.5 2.5 0 1 0 0-5M3 19c0-3 2.5-5 5-5s5 2 5 5m2-5c2.500 0 5 1.500 5 5",
  doc: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  chat: "M4 5h16v11H9l-5 4z",
  more: "M4 7h16M4 12h16M4 17h16",
};
function Icon({ name }: { name: Tab["icon"] }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name].replace(/\.500/g, ".5")} />
    </svg>
  );
}

/**
 * Phone chrome and small interaction feedback for the whole app:
 * the bottom tab bar and menu toggle, busy state on submitted forms,
 * a confirmation before destructive actions, and tidy one-shot messages.
 */
export function Chrome({ tabs, unread }: { tabs: Tab[]; unread: number }) {
  const path = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [path]);
  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    return () => document.body.classList.remove("menu-open");
  }, [open]);

  // Once a message has been shown, drop it from the address so a refresh or a shared link does not repeat it.
  useEffect(() => {
    if (!params.get("ok") && !params.get("error")) return;
    const next = new URLSearchParams(params.toString());
    next.delete("ok");
    next.delete("error");
    window.history.replaceState(null, "", `${path}${next.size ? `?${next}` : ""}`);
  }, [params, path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        document.querySelector<HTMLDetailsElement>("details.acct[open]")?.removeAttribute("open");
      }
    };
    const onClick = (e: MouseEvent) => {
      const acct = document.querySelector<HTMLDetailsElement>("details.acct[open]");
      if (acct && (!acct.contains(e.target as Node) || (e.target as HTMLElement).closest("a"))) acct.open = false;
      if ((e.target as HTMLElement).closest?.("[data-menu-toggle]")) {
        setOpen((o) => !o);
        return;
      }
      const button = (e.target as HTMLElement).closest?.("button.danger, button[data-confirm]") as HTMLButtonElement | null;
      if (!button || button.type === "button") return;
      const question = button.dataset.confirm || `${button.textContent?.trim() ?? "Do this"}? This cannot be undone.`;
      if (!window.confirm(question)) e.preventDefault();
    };
    const onSubmit = (e: SubmitEvent) => {
      if (e.defaultPrevented) return;
      const form = e.target as HTMLFormElement;
      if (form.method === "get") return;
      const button = (e.submitter as HTMLButtonElement | null) ?? form.querySelector<HTMLButtonElement>("button:not([type=button])");
      if (!button) return;
      // Mark busy after the browser has collected the form, so the pressed button's value is still sent.
      setTimeout(() => {
        button.classList.add("busy");
        button.setAttribute("aria-busy", "true");
      }, 0);
      setTimeout(() => {
        button.classList.remove("busy");
        button.removeAttribute("aria-busy");
      }, 8000);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  // A page that has just loaded has nothing busy on it.
  useEffect(() => {
    // Label each table cell with its column heading, for the stacked phone layout.
    document.querySelectorAll("table.table").forEach((table) => {
      const heads = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
      if (!heads.length) return;
      table.querySelectorAll("tbody tr, tfoot tr").forEach((tr) => {
        Array.from(tr.children).forEach((td, i) => {
          if (heads[i] && td.textContent?.trim() && !td.hasAttribute("data-label")) td.setAttribute("data-label", heads[i]);
        });
      });
    });
    document.querySelectorAll("button.busy").forEach((b) => {
      b.classList.remove("busy");
      b.removeAttribute("aria-busy");
    });
  }, [path, params]);

  return (
    <>
    {open && <div className="menu-veil" onClick={() => setOpen(false)} />}
    <nav className="tabbar" aria-label="Main">
      {tabs.map((t) => {
        const active = (t.match ?? [t.href]).some((h) => path === h || path.startsWith(h + "/"));
        return (
          <Link key={t.href} href={t.href} className={active && !open ? "active" : ""}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </Link>
        );
      })}
      <button type="button" className={open ? "active" : ""} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="more" />
        <span>{open ? "Close" : "More"}</span>
        {unread > 0 && !open && <i className="dot" />}
      </button>
    </nav>
    </>
  );
}
