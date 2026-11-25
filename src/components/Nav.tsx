"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { label: string; href: string };
/** A place in the app. With more than one page it shows them as a second row when you are inside it. */
export type NavGroup = { key: string; label: string; items: NavItem[] };

const within = (path: string, href: string) => path === href || path.startsWith(href + "/");

export function activeGroup(groups: NavGroup[], path: string): NavGroup | undefined {
  // The most specific match wins, so /round is never mistaken for /rounds.
  let best: { group: NavGroup; length: number } | undefined;
  for (const group of groups) {
    for (const item of group.items) {
      if (within(path, item.href) && (!best || item.href.length > best.length)) best = { group, length: item.href.length };
    }
  }
  return best?.group;
}

/** The handful of places, always in the same spot. */
export function PrimaryNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const current = activeGroup(groups, path);
  return (
    <nav className="topnav" aria-label="Main">
      {groups.map((g) => (
        <Link key={g.key} href={g.items[0].href} className={current?.key === g.key ? "active" : undefined} aria-current={current?.key === g.key ? "true" : undefined}>
          {g.label}
        </Link>
      ))}
    </nav>
  );
}

/** The pages inside the place you are in. Hidden when there is only one. */
export function SubNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const current = activeGroup(groups, path);
  if (!current || current.items.length < 2) return null;
  const best = current.items.filter((i) => within(path, i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <nav className="subnav" aria-label={current.label}>
      {current.items.map((i) => (
        <Link key={i.href} href={i.href} className={best?.href === i.href ? "active" : undefined} aria-current={best?.href === i.href ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** Everything, grouped the same way, for the phone's "More" screen. */
export function FullMenu({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  return (
    <nav>
      {groups.map((g) => (
        <div key={g.key}>
          {g.items.length > 1 && <div className="nav-label">{g.label}</div>}
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} className={within(path, i.href) ? "active" : undefined}>
              {g.items.length > 1 ? i.label : g.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
