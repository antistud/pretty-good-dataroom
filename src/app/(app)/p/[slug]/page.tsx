import { notFound } from "next/navigation";
import { canSee, requireUser } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { logView } from "@/lib/activity";
import { levelName } from "@/lib/format";
import { renderMarkdown } from "@/lib/md";
import { Md, PageHead } from "@/components/ui";

export default async function CustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const me = await requireUser();
  const { slug } = await params;
  const page = q1<{ id: number; title: string; body_md: string; min_level: number }>("SELECT id, title, body_md, min_level FROM pages WHERE slug = ?", slug);
  // Same response for "does not exist" and "not allowed", so page names do not leak.
  if (!page || !canSee(me, page.min_level)) notFound();
  logView(me, "page.view", "page", page.id);
  return (
    <>
      <PageHead title={page.title} sub={me.isStaff ? `Visible to: ${levelName(page.min_level)}. Edit in Settings.` : undefined} />
      <div className="card">
        {page.body_md ? <Md html={renderMarkdown(page.body_md)} /> : <p className="muted">This page is empty.</p>}
      </div>
    </>
  );
}
