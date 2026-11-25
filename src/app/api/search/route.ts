import { NextResponse } from "next/server";
import { canSeeSection, currentUser } from "@/lib/auth";
import { getSetting, q } from "@/lib/db";
import { visibleDocuments } from "@/lib/docs";

type Item = { label: string; href: string; kind: string; sub?: string };

/** Search across what the signed-in person is allowed to see, and nothing else. */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me || (!me.ndaAccepted && getSetting("nda_enabled") === "1")) return NextResponse.json({ items: [] }, { status: 401 });
  const term = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  if (term.length < 2) return NextResponse.json({ items: [] });
  const like = `%${term.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  const items: Item[] = [];

  if (canSeeSection(me, "documents")) {
    for (const d of visibleDocuments(me.level).filter((d) => d.name.toLowerCase().includes(term)).slice(0, 6)) {
      items.push({ label: d.name, href: `/documents/${d.id}`, kind: "Document" });
    }
  }
  if (canSeeSection(me, "updates")) {
    const updates = q<{ id: number; title: string }>(
      `SELECT DISTINCT u.id, u.title FROM updates u JOIN update_sections s ON s.update_id = u.id
        WHERE (? = 1 OR (u.status = 'published' AND s.min_level <= ?))
          AND (u.title LIKE ? ESCAPE '\\' OR ((? = 1 OR s.min_level <= ?) AND s.body_md LIKE ? ESCAPE '\\'))
        ORDER BY u.period DESC LIMIT 4`,
      me.isStaff ? 1 : 0, me.level, like, me.isStaff ? 1 : 0, me.level, like,
    );
    for (const u of updates) items.push({ label: u.title, href: `/updates/${u.id}`, kind: "Update" });
  }
  for (const p of q<{ slug: string; title: string }>("SELECT slug, title FROM pages WHERE min_level <= ? AND title LIKE ? ESCAPE '\\' LIMIT 4", me.level, like)) {
    items.push({ label: p.title, href: `/p/${p.slug}`, kind: "Page" });
  }
  if (me.isStaff) {
    for (const l of q<{ id: number; org_name: string; contact_name: string | null; stage: string }>(
      "SELECT id, org_name, contact_name, stage FROM leads WHERE org_name LIKE ? ESCAPE '\\' OR contact_name LIKE ? ESCAPE '\\' OR contact_email LIKE ? ESCAPE '\\' LIMIT 6",
      like, like, like,
    )) items.push({ label: l.org_name, sub: [l.contact_name, l.stage].filter(Boolean).join(" · "), href: `/pipeline/${l.id}`, kind: "Investor" });
    for (const u of q<{ name: string; email: string }>("SELECT name, email FROM users WHERE name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' LIMIT 4", like, like)) {
      items.push({ label: u.name, sub: u.email, href: "/people", kind: "Person" });
    }
    for (const r of q<{ id: number; title: string }>("SELECT id, title FROM requests WHERE title LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 4", like)) {
      items.push({ label: r.title, href: `/requests/${r.id}`, kind: "Request" });
    }
  } else if (me.orgId && canSeeSection(me, "requests")) {
    for (const r of q<{ id: number; title: string }>("SELECT id, title FROM requests WHERE org_id = ? AND title LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 4", me.orgId, like)) {
      items.push({ label: r.title, href: `/requests/${r.id}`, kind: "Request" });
    }
  }
  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
