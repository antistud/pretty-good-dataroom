import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q, run } from "@/lib/db";
import { ago } from "@/lib/format";
import { PageHead } from "@/components/ui";

type Row = { id: number; title: string; body: string | null; href: string; read_at: string | null; created_at: string };

export default async function Notifications() {
  const me = await requireUser();
  const rows = q<Row>("SELECT id, title, body, href, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 80", me.id);
  // Opening the page counts as having seen them; this visit still shows which were new.
  run("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL", me.id);
  const fresh = rows.filter((r) => !r.read_at);
  const earlier = rows.filter((r) => r.read_at);
  const list = (items: Row[]) => (
    <ul className="quiet-list">
      {items.map((n) => (
        <li key={n.id} style={{ padding: "12px 0" }}>
          <Link href={n.href} style={{ color: "var(--ink)", fontWeight: n.read_at ? 400 : 600 }}>{n.title}</Link>
          {n.body && <div className="muted">{n.body}</div>}
          <div className="muted small">{ago(n.created_at)}</div>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <PageHead title="What's new" sub="Everything that has happened that concerns you.">
        <Link className="btn" href="/account#email">Choose what reaches your inbox</Link>
      </PageHead>
      {rows.length === 0 && <p className="empty">Nothing yet. When something happens that needs you, it shows up here.</p>}
      {fresh.length > 0 && <div className="card"><h2>New</h2>{list(fresh)}</div>}
      {earlier.length > 0 && <div className="card"><h2>Earlier</h2>{list(earlier)}</div>}
    </>
  );
}
