import { canSeeSection, currentUser } from "@/lib/auth";
import { getSetting, q1 } from "@/lib/db";
import { readFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

const deny = (status: number) => new Response(null, { status, headers: { "Cache-Control": "private, no-store" } });

/** A team member's photo, for anyone allowed to see the team page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me) return deny(401);
  if (!me.ndaAccepted && getSetting("nda_enabled") === "1") return deny(403);
  if (!me.isStaff && !canSeeSection(me, "team")) return deny(404);
  const row = q1<{ photo_key: string | null; photo_mime: string | null }>("SELECT photo_key, photo_mime FROM team_members WHERE id = ?", Number((await params).id) || 0);
  if (!row?.photo_key || !row.photo_mime) return deny(404);
  try {
    const data = await readFile(row.photo_key);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": row.photo_mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
  } catch {
    return deny(404);
  }
}
