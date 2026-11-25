import { getSetting } from "@/lib/db";
import { readFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The company logo. Public on purpose: it appears on the sign-in page and in
 * emails, where nobody is signed in, and says no more than the company name
 * already shown there.
 */
export async function GET() {
  const key = getSetting("logo_key");
  const mime = getSetting("logo_mime");
  if (!key || !/^image\/(png|jpeg|webp)$/.test(mime)) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const data = await readFile(key);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
  } catch {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
